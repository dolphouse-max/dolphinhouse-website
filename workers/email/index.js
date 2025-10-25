// workers/email/index.js
import { EmailMessage } from "cloudflare:email";

/* Helpers */
function extractAddress(from) {
  if (!from) return null;
  const s = String(from);
  const m = s.match(/<([^>]+)>/);
  return (m && m[1]) || s.trim();
}

function buildRawMime({ from, to, subject, text, inReplyTo, messageId }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
  ];
  if (messageId) headers.push(`Message-ID: ${messageId}`);
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  return headers.join("\r\n") + "\r\n\r\n" + text;
}

async function safeReadRaw(message) {
  try {
    if (typeof message.raw === "string") return message.raw;
    return await new Response(message.raw).text();
  } catch {
    try {
      return Array.from(message.headers.entries()).map(([k, v]) => `${k}: ${v}`).join("\n");
    } catch {
      return "";
    }
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
  return (
    aiRes?.response ||
    aiRes?.text ||
    aiRes?.output?.[0]?.content?.[0]?.text ||
    aiRes?.choices?.[0]?.message?.content ||
    (typeof aiRes?.choices?.[0] === "string" ? aiRes.choices[0] : null) ||
    null
  );
}

/* Main */
export default {
  async email(message, env, ctx) {
    const FROM_ADDR = env.EMAIL_FROM || "contact@dolphinhouse-alibaug.com";
    const USE_CLOUDFLARE_REPLY = env.USE_CLOUDFLARE_REPLY === "1";
    const MAILCHANNELS_ENABLED = !USE_CLOUDFLARE_REPLY;
    const MAILCHANNELS_API_KEY = env.MAILCHANNELS_API_KEY || null;

    try {
      const fromAddr = extractAddress(message.from || message.headers?.get("From")) || null;
      const toAddr = extractAddress(message.to || message.headers?.get("To")) || FROM_ADDR;
      const subject = message.subject || message.headers?.get("subject") || "(no subject)";
      const inboundMessageId = (() => { try { return message.headers?.get("Message-ID") || null } catch { return null } })();
      const inboundInReplyTo = (() => { try { return message.headers?.get("In-Reply-To") || null } catch { return null } })();
      const raw = await safeReadRaw(message);
      const bodyText = (raw || "").toString();

      // CREATE TABLE (ensure consistent schema)
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

      // Log inbound (10 columns)
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
          inboundMessageId,
          inboundInReplyTo || null,
          threadKey,
          now
        ).run();
      } catch (e) {
        console.warn("D1 inbound log warning:", e?.message || e);
      }

      // ----- RAG: embedding -> vectorize -> hydrate -----
      let kbSnippet = "";
      try {
        if (env.AI && env.VECTORIZE && env.DB) {
          const qText = `${subject}\n\n${bodyText.substring(0, 800)}`;
          const embResp = await env.AI.run("@cf/baai/bge-small-en-v1.5", { text: qText });

          // debug logs of embedding response
          try {
            console.log("DEBUG embResp keys:", Object.keys(embResp || {}));
            console.log("DEBUG embResp.data0:", JSON.stringify(embResp?.data?.[0] ?? null));
          } catch (e) {}

          const vectorEmbedding = safeExtractEmbedding(embResp);
          console.log("DEBUG extracted embedding length:", Array.isArray(vectorEmbedding) ? vectorEmbedding.length : "not-array");

          if (!Array.isArray(vectorEmbedding) || vectorEmbedding.length === 0) {
            console.warn("RAG: empty embedding, falling back to LIKE");
            throw new Error("empty_embedding");
          }

          // === CHANGE: accept 384-dim embeddings ===
          // We saw your model returning 384 dims. Use this variable to match your index:
          const EXPECTED_DIMS = 384; // <--- set to 384 so we attempt Vectorize with 384-dim vectors

          if (vectorEmbedding.length !== EXPECTED_DIMS) {
            console.warn(`RAG: embedding has ${vectorEmbedding.length} dims (expected ${EXPECTED_DIMS}), will attempt Vectorize but may fail`);
            // we'll still attempt Vectorize; if it fails it will be handled below
          }

          // Try Vectorize (two call shapes)
          let vecRes = null;
          try {
            try {
              vecRes = await env.VECTORIZE.query({ vector: vectorEmbedding, topK: 3 });
            } catch (e1) {
              vecRes = await env.VECTORIZE.query(vectorEmbedding, { topK: 3 });
            }
          } catch (vecErr) {
            throw new Error("vectorize_failed:" + (vecErr?.message || vecErr));
          }

          const matches = vecRes?.matches || vecRes?.results || [];
          const ids = matches.map(m => m && (m.id ?? m.document_id ?? m.doc_id)).filter(Boolean);
          if (ids.length) {
            const placeholders = ids.map(() => "?").join(",");
            const rowsResp = await env.DB.prepare(
              `SELECT id, text FROM knowledge_chunks WHERE id IN (${placeholders}) ORDER BY created_at DESC`
            ).bind(...ids).all();
            const rows = rowsResp?.results || [];
            kbSnippet = rows.map(r => r.text || "").join("\n---\n");
          } else kbSnippet = "";
        } else {
          // fallback cheap LIKE
          const termBase = (subject + " " + bodyText).toLowerCase().replace(/[?!,.;:]/g, " ");
          const term = termBase.slice(0, 200);
          try {
            const res = await env.DB.prepare(
              `SELECT text FROM knowledge_chunks WHERE LOWER(text) LIKE ? ORDER BY created_at DESC LIMIT 1`
            ).bind(`%${term}%`).all();
            kbSnippet = res.results?.[0]?.text || "";
          } catch {
            kbSnippet = "";
          }
        }
      } catch (e) {
        console.warn("RAG lookup warning:", e?.message || e);
        // As last resort, attempt LIKE search again
        try {
          const termBase = (subject + " " + bodyText).toLowerCase().replace(/[?!,.;:]/g, " ");
          const term = termBase.slice(0, 200);
          const res = await env.DB.prepare(
            `SELECT text FROM knowledge_chunks WHERE LOWER(text) LIKE ? ORDER BY created_at DESC LIMIT 1`
          ).bind(`%${term}%`).all();
          kbSnippet = res.results?.[0]?.text || "";
        } catch {
          kbSnippet = "";
        }
      }

      // ----- AI reply generation -----
      const prompt = `You are a helpful assistant for Dolphin House, Alibaug.

User email:
${bodyText}

Relevant context:
${kbSnippet}

Reply clearly, politely, and concisely.`;

      let replyText = "Thank you for reaching out. We'll get back to you shortly.";
      try {
        if (env.AI) {
          const aiRes = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { prompt });
          const text = safeExtractChatText(aiRes);
          if (text) replyText = String(text).trim();
        }
      } catch (e) {
        console.warn("AI generation warning:", e?.message || e);
      }

      // ----- Send reply -----
      // Cloudflare message.reply path (only if explicitly enabled)
      if (USE_CLOUDFLARE_REPLY && typeof message.reply === "function") {
        try {
          let safeMessageId = inboundMessageId;
          if (!safeMessageId) safeMessageId = `<${crypto.randomUUID()}@dolphinhouse-alibaug.com>`;
          const mime = buildRawMime({
            from: FROM_ADDR,
            to: fromAddr || toAddr,
            subject: `Re: ${subject}`,
            text: replyText,
            inReplyTo: safeMessageId,
            messageId: safeMessageId
          });
          const em = new EmailMessage(FROM_ADDR, fromAddr || toAddr, mime);
          await message.reply(em);
        } catch (e) {
          console.error("Cloudflare reply failed:", e?.message || e);
          // fall through to MailChannels fallback
        }
      }

      // MailChannels send (default). Must include X-Api-Key header.
      if (MAILCHANNELS_ENABLED) {
        try {
          const headers = { "content-type": "application/json" };
          if (MAILCHANNELS_API_KEY) headers["X-Api-Key"] = MAILCHANNELS_API_KEY;
          // if you don't want to use an API key and rely on Cloudflare/MailChannels integration,
          // leave MAILCHANNELS_API_KEY unset — but set up the domain lockdown/SPA if required.
          const sendPayload = {
            personalizations: [{ to: [{ email: fromAddr }] }],
            from: { email: FROM_ADDR },
            subject: `Re: ${subject}`,
            content: [{ type: "text/plain", value: replyText }]
          };
          const mcResp = await fetch("https://api.mailchannels.net/tx/v1/send", {
            method: "POST",
            headers,
            body: JSON.stringify(sendPayload)
          });
          if (!mcResp.ok) {
            console.error("MailChannels send failed:", await mcResp.text());
          }
        } catch (e) {
          console.error("MailChannels send error:", e?.message || e);
        }
      }

      // ----- Log outbound (10 cols) -----
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
          `Re: ${subject}`,
          replyText,
          null,
          inboundMessageId || inboundInReplyTo || null,
          threadKey,
          new Date().toISOString()
        ).run();
      } catch (e) {
        console.warn("D1 outbound log warning:", e?.message || e);
      }

    } catch (err) {
      console.error("Email worker error:", err?.message || err);
    }
  }
};
