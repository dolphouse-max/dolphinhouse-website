// src/pages/api/inventory.js
// src/pages/api/inventory.js
export async function GET({ locals }) {
  try {
    const db = locals.runtime.env.DB;
    const { results } = await db.prepare(`
      SELECT room, label, qty, rateNonAC, rateAC, occupancy, extraPerson
      FROM inventory
    `).all();

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error('Inventory API error:', err);
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

    // If data is an object (key-value pairs), convert to array format
    let itemsToUpdate = [];
    
    if (Array.isArray(data)) {
      itemsToUpdate = data;
    } else {
      // Convert object format to array
      itemsToUpdate = Object.entries(data).map(([key, val]) => ({
        room: key,
        ...val
      }));
    }

    // Clear old inventory
    await db.prepare("DELETE FROM inventory").run();

    // Insert new data
    for (const item of itemsToUpdate) {
      await db.prepare(`
        INSERT INTO inventory (room_type, label, qty, rate_non_ac, rate_ac, occupancy, extra_person)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.room,
        item.label,
        item.qty,
        item.rateNonAC || 0,
        item.rateAC || 0,
        item.occupancy || 2,
        item.extraPerson || 500
      ).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error('Inventory PUT error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}