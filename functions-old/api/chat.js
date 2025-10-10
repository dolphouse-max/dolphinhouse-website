// functions/api/chat.js
export async function onRequestPost(context) {
  try {
    const { query } = await context.request.json();
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query text." }), { status: 400 });
    }

    const db = context.env.DB;

    // ============================================================
    // 1️⃣ Step — Get Embedding for the Query (vector representation)
    // ============================================================
    const embedResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${context.env.CF_ACCOUNT_ID}/ai/run/@cf/baai/bge-base-en-v1.5`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.env.CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: query }),
      }
    );

    if (!embedResp.ok) {
      const errText = await embedResp.text();
      throw new Error("Embedding API failed: " + errText);
    }

    const embedData = await embedResp.json();
    const queryVector = embedData.result.data[0];

    // ============================================================
    // 2️⃣ Step — Retrieve Most Relevant Knowledge Chunks from D1
    // ============================================================
    const results = await db
      .prepare(`
        SELECT text,
               (1 - (distance(vector, ?))) AS score
        FROM knowledge_chunks
        ORDER BY score DESC
        LIMIT 5;
      `)
      .bind(JSON.stringify(queryVector))
      .all();

    const chunks = results.results || [];
    const contextText = chunks.map(r => r.text).join("\n\n");

    // ============================================================
    // 3️⃣ Step — Combine Context + Query and Ask Llama for Answer
    // ============================================================
    const aiResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${context.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.env.CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are the friendly and knowledgeable assistant for Dolphin House Beach Resort, Nagaon, Alibaug. " +
                "Use the provided context faithfully and avoid making up information. If unsure, say you don’t know.",
            },
            {
              role: "user",
              content: `Question: ${query}\n\nContext from resort database:\n${contextText}`,
            },
          ],
        }),
      }
    );

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      throw new Error("Llama AI API failed: " + errText);
    }

    const data = await aiResp.json();
    const answer = data.result?.response || "Sorry, I couldn’t find relevant information.";

    // ============================================================
    // 4️⃣ Step — Return JSON Response
    // ============================================================
    return new Response(
      JSON.stringify({
        answer,
        sources: chunks.map(c => c.text.slice(0, 80) + "..."),
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("❌ Chat API error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
