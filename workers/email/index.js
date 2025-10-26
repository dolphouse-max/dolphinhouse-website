// workers/email/index.js (TEST MODE — no external email sending)
// Fixed: avoids ORDER BY created_at on knowledge_chunks when column doesn't exist.

import { EmailMessage } from "cloudflare:email";

function extractAddress(from) {
  if (!from) return null;
  const s = String(from);
  const m = s.match(/<([^>]+)>/);
  return (m && m[1]) || s.trim();
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
      let kbSnippet = "";
      try {
        const qText = `${subject}\n\n${bodyText.substring(0, 800)}`;
        const embResp = await env.AI.run("@cf/baai/bge-small-en-v1.5", { text: qText });

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
        const ids = matches.map(m => (m && (m.id ?? m.document_id ?? m.doc_id)) || null).filter(Boolean);

        if (ids.length) {
          const placeholders = ids.map(() => "?").join(",");
          const rows = (await env.DB.prepare(`SELECT text FROM knowledge_chunks WHERE id IN (${placeholders})`).bind(...ids).all()).results || [];
          kbSnippet = rows.map(r => r.text || "").join("\n---\n");
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
      const prompt = `You are a helpful and professional assistant for Dolphin House, Alibaug.
Context:
${kbSnippet}
User email:
${bodyText}
Compose a short, polite reply.`;
      let replyText = "Thank you for your email. We'll respond shortly.";
      try {
        const aiRes = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { prompt });
        replyText = safeExtractChatText(aiRes) || replyText;
      } catch (e) {
        console.warn("AI generation warning:", e?.message || e);
      }

      console.log("TEST-MODE generated reply:", replyText);

      // Store outbound in D1 (no sending)
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