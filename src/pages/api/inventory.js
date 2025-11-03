// src/pages/api/inventory.js
// src/pages/api/inventory.js
export async function GET({ locals }) {
  try {
    const db = locals.runtime.env.DB;
    // Detect actual column names in inventory table
    const info = await db.prepare('PRAGMA table_info(inventory)').all();
    const cols = new Set((info.results || []).map((r) => r.name));

    const col = (pref, alt) => (cols.has(pref) ? pref : cols.has(alt) ? alt : pref);
    const roomCol = col('room', 'room_type');
    const rateNonACCol = col('rateNonAC', 'rate_non_ac');
    const rateACCol = col('rateAC', 'rate_ac');
    const extraPersonCol = col('extraPerson', 'extra_person');
    const occupancyCol = col('occupancy', 'occupancy');
    const labelCol = col('label', 'label');
    const qtyCol = col('qty', 'qty');

    const sql = `SELECT 
      ${roomCol} AS room,
      ${labelCol} AS label,
      ${qtyCol} AS qty,
      ${rateNonACCol} AS rateNonAC,
      ${rateACCol} AS rateAC,
      ${occupancyCol} AS occupancy,
      ${extraPersonCol} AS extraPerson
    FROM inventory`;
    const { results } = await db.prepare(sql).all();

    return new Response(JSON.stringify(results || []), {
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

    // Detect actual column names in inventory table
    const info = await db.prepare('PRAGMA table_info(inventory)').all();
    const cols = new Set((info.results || []).map((r) => r.name));
    const has = (name) => cols.has(name);
    const roomCol = has('room') ? 'room' : has('room_type') ? 'room_type' : 'room';
    const rateNonACCol = has('rateNonAC') ? 'rateNonAC' : has('rate_non_ac') ? 'rate_non_ac' : 'rateNonAC';
    const rateACCol = has('rateAC') ? 'rateAC' : has('rate_ac') ? 'rate_ac' : 'rateAC';
    const extraPersonCol = has('extraPerson') ? 'extraPerson' : has('extra_person') ? 'extra_person' : 'extraPerson';
    const occupancyCol = has('occupancy') ? 'occupancy' : 'occupancy';
    const labelCol = has('label') ? 'label' : 'label';
    const qtyCol = has('qty') ? 'qty' : 'qty';

    // Clear old inventory (keep table structure intact)
    await db.prepare("DELETE FROM inventory").run();

    // Insert new data using detected column names
    for (const item of itemsToUpdate) {
      await db.prepare(`
        INSERT INTO inventory (${roomCol}, ${labelCol}, ${qtyCol}, ${rateNonACCol}, ${rateACCol}, ${occupancyCol}, ${extraPersonCol})
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.room,
        item.label,
        Number(item.qty ?? 0),
        Number(item.rateNonAC ?? 0),
        Number(item.rateAC ?? 0),
        Number(item.occupancy ?? 2),
        Number(item.extraPerson ?? 500)
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