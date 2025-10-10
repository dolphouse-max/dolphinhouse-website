export async function GET({ locals, request }) {
  try {
    const db = locals.runtime.env.DB;
    const { results } = await db.prepare(`
      SELECT room_type AS room, label, qty, rate_non_ac AS rateNonAC, rate_ac AS rateAC
      FROM inventory
    `).all();

    // Convert array into object for easy client-side access
    const inv = {};
    for (const r of results) {
      inv[r.room] = {
        label: r.label,
        qty: r.qty,
        rateNonAC: r.rateNonAC,
        rateAC: r.rateAC
      };
    }

    return new Response(JSON.stringify(inv), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function PUT({ locals, request }) {
  try {
    const db = locals.runtime.env.DB;
    const data = await request.json();

    // Clear old inventory
    await db.prepare("DELETE FROM inventory").run();

    // Insert new data
    for (const [key, val] of Object.entries(data)) {
      await db.prepare(`
        INSERT INTO inventory (room_type, label, qty, rate_non_ac, rate_ac)
        VALUES (?, ?, ?, ?, ?)
      `).bind(key, val.label, val.qty, val.rateNonAC, val.rateAC).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
