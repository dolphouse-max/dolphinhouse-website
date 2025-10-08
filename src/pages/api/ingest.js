export async function onRequestPost(context) {
  const db = context.env.DB; // D1 binding
  const data = await context.request.json();

  for (const item of data) {
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

  return new Response(JSON.stringify({ success: true, count: data.length }), {
    headers: { "Content-Type": "application/json" },
  });
}
