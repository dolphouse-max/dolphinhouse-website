// functions/api/ingest.js

export async function onRequestPost(context) {
  const db = context.env.DB;
  try {
    const body = await context.request.json();

    for (const item of body) {
      await db
        .prepare(
          `INSERT INTO knowledge_chunks (id, source, ref, text, vector, createdAt)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`
        )
        .bind(
          crypto.randomUUID(),
          item.source,
          item.ref,
          item.text,
          JSON.stringify(item.vector)
        )
        .run();
    }

    return new Response(
      JSON.stringify({ success: true, count: body.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Ingest error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
