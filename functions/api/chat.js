// functions/api/chat.js
export async function onRequestPost(context) {
  try {
    const { query } = await context.request.json();
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query text." }), { status: 400 });
    }

    const db = context.env.DB;

    // Retrieve relevant chunks
    const results = await db.prepare(
      "SELECT text FROM knowledge_chunks ORDER BY RANDOM() LIMIT 3"
    ).all();

    const contextText = results.results.map(r => r.text).join("\n");

    // Call Cloudflare Workers AI (Llama model)
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
            { role: "system", content: "You are Dolphin House Resort assistant." },
            { role: "user", content: `${query}\n\nContext:\n${contextText}` },
          ],
        }),
      }
    );

    const data = await aiResp.json();
    const answer = data.result?.response || "No answer generated.";

    return new Response(JSON.stringify({ answer }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
