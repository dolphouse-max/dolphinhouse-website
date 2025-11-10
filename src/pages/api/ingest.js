export async function POST({ locals, request }) {
  const db = locals.runtime.env.DB;
  try {
    // Ensure table exists (idempotent)
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS knowledge_chunks (
          id TEXT PRIMARY KEY,
          source TEXT,
          ref TEXT,
          text TEXT,
          createdAt TEXT
        )`
      )
      .run();

    // Optional indexes to improve LIKE queries
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_knowledge_ref ON knowledge_chunks(ref)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_chunks(source)`).run();

    const body = await request.json();

    for (const item of body) {
      await db
        .prepare(
          `INSERT INTO knowledge_chunks (id, source, ref, text, createdAt)
           VALUES (?, ?, ?, ?, datetime('now'))`
        )
        .bind(
          crypto.randomUUID(),
          item.source,
          item.ref,
          item.text
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