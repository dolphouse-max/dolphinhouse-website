// workers/email/index.js
// Email bot: logs inbound mail to D1, generates AI reply with Workers AI,
// and optionally replies via Cloudflare Email Routing when enabled by env.

import { EmailMessage } from "cloudflare:email";

function extractAddress(from) {
  if (!from) return null;
  const s = String(from);
  const m = s.match(/<([^>]+)>/);
  return (m && m[1]) || s.trim();
}

function toTitleCase(s) {
  return String(s || "")
    .toLowerCase()
    .split(/\s+/)
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : "")
    .join(" ");
}

function extractDisplayName(fromHeader, fallbackEmail) {
  try {
    const raw = String(fromHeader || "").trim();
    const m = raw.match(/^\s*"?([^"<]+)"?\s*<[^>]+>/);
    if (m && m[1]) return toTitleCase(m[1].trim());
  } catch {}
  try {
    const email = String(fallbackEmail || "");
    const local = email.split("@")[0] || "";
    const name = local.replace(/[._-]+/g, " ");
    return toTitleCase(name);
  } catch {}
  return "";
}

async function safeReadRaw(message) {
  try {
    if (typeof message.raw === "string") return message.raw;
    return await new Response(message.raw).text();
  } catch {
    return "";
  }
}

function safeExtractEmbedding(resp) {
  if (!resp) return null;
  if (Array.isArray(resp)) return resp[0];
  if (resp?.data?.[0]?.embedding) return resp.data[0].embedding;
  if (Array.isArray(resp?.data?.[0])) return resp.data[0];
  if (Array.isArray(resp?.embedding)) return resp.embedding;
  if (resp?.output?.[0]?.embeddings?.[0]?.values) return resp.output[0].embeddings[0].values;
  return null;
}

function safeExtractChatText(aiRes) {
  if (!aiRes) return null;
  return aiRes?.response || aiRes?.text || aiRes?.output?.[0]?.content?.[0]?.text || null;
}

export default {
  async email(message, env, ctx) {
    const FROM_ADDR = env.EMAIL_FROM || "contact@dolphinhouse-alibaug.com";
    const SHOULD_REPLY = String(env.USE_CLOUDFLARE_REPLY || "0") === "1";

    try {
      const fromAddr = extractAddress(message.from || message.headers?.get("From")) || null;
      const toAddr = extractAddress(message.to || message.headers?.get("To")) || FROM_ADDR;
      const subject = message.subject || message.headers?.get("subject") || "(no subject)";
      const messageId = (() => { try { return message.headers?.get("Message-ID") || null } catch { return null } })();
      const inReplyTo = (() => { try { return message.headers?.get("In-Reply-To") || null } catch { return null } })();

      const raw = await safeReadRaw(message);
      const bodyText = String(raw || "").slice(0, 2000);

      // Ensure emails table exists (same schema)
      try {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS emails (
            id TEXT PRIMARY KEY,
            direction TEXT,
            from_addr TEXT,
            to_addr TEXT,
            subject TEXT,
            body TEXT,
            message_id TEXT,
            in_reply_to TEXT,
            thread_key TEXT,
            created_at TEXT
          )
        `).run();
      } catch (e) {
        console.warn("D1 create table warning:", e?.message || e);
      }

      // Log inbound
      const threadKey = subject.trim().replace(/^((re|fwd):\s*)+/i, "").toLowerCase();
      const now = new Date().toISOString();
      try {
        await env.DB.prepare(`
          INSERT INTO emails (
            id, direction, from_addr, to_addr, subject, body,
            message_id, in_reply_to, thread_key, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          "inbound",
          fromAddr,
          toAddr,
          subject,
          bodyText,
          messageId,
          inReplyTo || null,
          threadKey,
          now
        ).run();
      } catch (e) {
        console.warn("D1 inbound log warning:", e?.message || e);
      }

      // RAG / embedding -> Vectorize (safe)
      const STATIC_CONTEXT = [
        "Dolphin House Beach Resort is ~200m (2-min walk) from Nagaon Beach entrance.",
        "Indoor swimming pool with waterfall; open 8:00 AM to 8:00 PM.",
        "Room tariffs: from ₹2000 (Non-AC) and ₹2300 (AC). Family/deluxe rooms available.",
        "Free on-site car parking; complimentary high-speed Wi-Fi in rooms and common areas.",
        "Check-in 12:00 PM; Check-out 10:00 AM. Early/late subject to availability and charges.",
        "Advance payment confirms booking; balance due at check-in. Payments via UPI/Google Pay/bank transfer.",
        "Cancellation: ≥7 days full refund; 3–6 days 50% charge; <48 hours or no-show non-refundable.",
        "Children <5 stay complimentary without extra bed; extra person ≥5 years ₹700/night.",
        "Contact: WhatsApp +91-8554871073; booking@dolphinhouse-alibaug.com; Nagaon Beach Road, Alibaug."
      ].join("\n");
      let kbSnippet = "";
      try {
        const qText = `${subject}\n\n${bodyText.substring(0, 800)}`;
        // Use 768-dim model to match Vectorize index configuration
        const embResp = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: qText });

        try {
          console.log("DEBUG embResp keys:", Object.keys(embResp || {}));
          console.log("DEBUG embResp.data0:", JSON.stringify(embResp?.data?.[0] ?? null));
        } catch {}

        const vectorEmbedding = safeExtractEmbedding(embResp);
        console.log("DEBUG extracted embedding length:", Array.isArray(vectorEmbedding) ? vectorEmbedding.length : "not-array");

        if (!Array.isArray(vectorEmbedding) || vectorEmbedding.length === 0) {
          console.warn("RAG: empty embedding, using D1 LIKE fallback");
          throw new Error("empty_embedding");
        }

        const EXPECTED_DIMS = 768;
        if (vectorEmbedding.length !== EXPECTED_DIMS) {
          console.warn(`RAG: embedding dims ${vectorEmbedding.length} != ${EXPECTED_DIMS}; skipping Vectorize`);
          throw new Error("dim_mismatch");
        }

        // Query Vectorize (only if dims match)
        let vecRes = null;
        try {
          vecRes = await env.VECTORIZE.query({ vector: vectorEmbedding, topK: 3 });
        } catch (e) {
          try { vecRes = await env.VECTORIZE.query(vectorEmbedding, { topK: 3 }); }
          catch (e2) { throw e2; }
        }

        const matches = vecRes?.matches || vecRes?.results || [];
        // Prefer text from index metadata if available; fall back to D1 join
        const metaTexts = matches.map(m => (m?.metadata?.text || m?.document?.text || "")).filter(Boolean);
        if (metaTexts.length) {
          kbSnippet = metaTexts.join("\n---\n");
        } else {
          const ids = matches.map(m => (m && (m.id ?? m.document_id ?? m.doc_id)) || null).filter(Boolean);
          if (ids.length) {
            const placeholders = ids.map(() => "?").join(",");
            const rows = (await env.DB.prepare(`SELECT text FROM knowledge_chunks WHERE id IN (${placeholders})`).bind(...ids).all()).results || [];
            kbSnippet = rows.map(r => r.text || "").join("\n---\n");
          }
        }
      } catch (e) {
        console.warn("RAG lookup fallback:", e?.message || e);

        // --- FIXED: D1 LIKE fallback without ORDER BY created_at ---
        try {
          const termBase = (subject + " " + bodyText).toLowerCase().replace(/[?!,.;:]/g, " ");
          const term = termBase.slice(0, 200);
          // We purposely do NOT use ORDER BY created_at because some schemas lack that column.
          const res = await env.DB.prepare(
            `SELECT text FROM knowledge_chunks WHERE LOWER(text) LIKE ? LIMIT 1`
          ).bind(`%${term}%`).all();
          kbSnippet = res.results?.[0]?.text || "";
        } catch (e2) {
          console.warn("D1 LIKE fallback failed:", e2?.message || e2);
          kbSnippet = "";
        }
      }

      // AI reply
      const displayName = extractDisplayName(message.headers?.get("From"), fromAddr);
      const greeting = displayName ? `Hi ${displayName},` : "Hello,";
      const mergedContext = [kbSnippet, STATIC_CONTEXT].filter(Boolean).join("\n\n").trim();
      const prompt = `You are an assistant for Dolphin House Beach Resort, Alibaug.
Use the CONTEXT facts to answer the user's question precisely. If the context lacks a specific detail, ask ONE clear follow-up question rather than guessing.
Tone: warm, concise, professional. Include actionable specifics (distance, timings, tariffs) when relevant. End with booking contact: WhatsApp +91-8554871073.

CONTEXT:
${mergedContext || "(no context)"}

SUBJECT: ${subject}
EMAIL:
${bodyText}

Begin your reply with: "${greeting}" then provide the answer.`;
      let replyText = "Thank you for your email. We'll respond shortly.";
      try {
        const aiRes = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { prompt });
        replyText = safeExtractChatText(aiRes) || replyText;
      } catch (e) {
        console.warn("AI generation warning:", e?.message || e);
      }

      const replySubject = subject?.trim()?.toLowerCase()?.startsWith("re:") ? subject : `Re: ${subject}`;

      // Optionally send an actual email reply via Cloudflare Email Routing
      if (SHOULD_REPLY && fromAddr) {
        try {
          // Compose raw MIME (avoid external deps). Use In-Reply-To for threading.
          const midDomain = (FROM_ADDR.split("@")[1] || "dolphinhouse-alibaug.com").toLowerCase();
          const msgId = `<${crypto.randomUUID()}@${midDomain}>`;
          const dateStr = new Date().toUTCString();
          console.log("Inbound Message-ID:", messageId || "(none)");
          const mimeLines = [
            `Message-ID: ${msgId}`,
            `Date: ${dateStr}`,
            `From: ${FROM_ADDR}`,
            `To: ${fromAddr}`,
            `Subject: ${replySubject}`,
            ...(messageId ? [`In-Reply-To: ${messageId}`] : []),
            ...(messageId ? [`References: ${messageId}`] : []),
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            `Reply-To: ${FROM_ADDR}`,
            '',
            replyText
          ];
          const rawMime = mimeLines.join("\r\n");

          const replyMsg = new EmailMessage(FROM_ADDR, fromAddr, rawMime);
          console.log("Attempting reply:", {
            to: fromAddr,
            subject: replySubject,
            rawBytes: rawMime.length
          });
          await message.reply(replyMsg);
          console.log("Sent reply to", fromAddr);
        } catch (sendErr) {
          console.warn("Cloudflare email reply failed:", sendErr?.message || sendErr);
          try { console.warn("Reply failure stack:", sendErr?.stack || "(no stack)"); } catch {}
        }
      } else {
        console.log("Reply not sent (SHOULD_REPLY=", SHOULD_REPLY, ") to=", fromAddr);
      }

      // Store outbound in D1
      try {
        await env.DB.prepare(`
          INSERT INTO emails (
            id, direction, from_addr, to_addr, subject, body,
            message_id, in_reply_to, thread_key, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          "outbound",
          FROM_ADDR,
          fromAddr,
          replySubject,
          replyText,
          null,
          messageId || inReplyTo || null,
          threadKey,
          new Date().toISOString()
        ).run();
      } catch (e) {
        console.warn("D1 outbound log warning:", e?.message || e);
      }

    } catch (err) {
      console.error("Email worker top-level error:", err?.message || err);
    }
  }
};