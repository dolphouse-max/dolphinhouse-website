// workers/reindex/index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    if (!secret || secret !== env.REINDEX_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }

    const page = Number(url.searchParams.get("page") || "0");
    const PAGE_SIZE = Number(url.searchParams.get("size") || "200");

    try {
      const offset = page * PAGE_SIZE;
      const q = `SELECT id, text FROM knowledge_chunks LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
      const rowsResp = await env.DB.prepare(q).all();
      const rows = rowsResp?.results || [];

      if (!rows.length) {
        return new Response(`no_rows_page_${page}`, { status: 200 });
      }

      const upserts = [];
      for (const row of rows) {
        const docId = String(row.id);
        const text = (row.text || "").slice(0, 4500); // keep embeddings manageable

        // get embedding
        const embResp = await env.AI.run("@cf/baai/bge-small-en-v1.5", { text });
        // robust extraction
        const vector = (function () {
          try {
            if (Array.isArray(embResp)) return embResp[0];
            if (embResp?.data?.[0]?.embedding) return embResp.data[0].embedding;
            if (Array.isArray(embResp?.data?.[0])) return embResp.data[0];
            if (Array.isArray(embResp?.embedding)) return embResp.embedding;
            if (embResp?.output?.[0]?.embeddings?.[0]?.values) return embResp.output[0].embeddings[0].values;
            return null;
          } catch (e) { return null; }
        })();

        if (!Array.isArray(vector) || vector.length === 0) {
          console.warn("no-vector-for", docId);
          continue;
        }

        upserts.push({
          id: docId,
          vector,
          metadata: { preview: text.slice(0, 500) }
        });
      }

      if (upserts.length === 0) {
        return new Response(`no_vectors_page_${page}`, { status: 200 });
      }

      // Upsert to Vectorize — try multiple shapes if needed
      let upsertResult = null;
      try {
        upsertResult = await env.VECTORIZE_NEW.upsert(upserts);
      } catch (e) {
        try {
          upsertResult = await env.VECTORIZE_NEW.upsert({ vectors: upserts });
        } catch (e2) {
          try {
            upsertResult = await env.VECTORIZE_NEW.upsert({ items: upserts });
          } catch (e3) {
            console.error("vectorize_upsert_failed", e3?.message || e3);
            return new Response("vectorize upsert failed: " + (e3?.message || e3), { status: 500 });
          }
        }
      }

      console.log("upsert_count", upserts.length);
      return new Response(`ok_page_${page}_count_${upserts.length}`, { status: 200 });
    } catch (err) {
      console.error("reindex_error", err?.message || err);
      return new Response("reindex error: " + (err?.message || err), { status: 500 });
    }
  }
};
