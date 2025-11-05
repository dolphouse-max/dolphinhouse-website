// src/pages/api/inventory.js
// src/pages/api/inventory.js
let LOCAL_INVENTORY_CACHE = null;

export async function GET({ locals }) {
  try {
    const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
    const db = env.DB;
    if (!db) {
      // Local fallback: return cached inventory or sensible defaults when DB is not bound
      const defaults = [
        { room: 'standard', label: 'Standard Room', qty: 5, rateNonAC: 2000, rateAC: 2500, occupancy: 2, extraPerson: 500 },
        { room: 'deluxe', label: 'Deluxe Room', qty: 3, rateNonAC: 3000, rateAC: 3500, occupancy: 2, extraPerson: 500 },
        { room: 'family', label: 'Family Room', qty: 1, rateNonAC: 3500, rateAC: 4000, occupancy: 4, extraPerson: 700 },
        { room: 'deluxeFamily', label: 'Deluxe Family Room', qty: 1, rateNonAC: 4500, rateAC: 5000, occupancy: 4, extraPerson: 700 }
      ];
      const payload = Array.isArray(LOCAL_INVENTORY_CACHE) && LOCAL_INVENTORY_CACHE.length > 0
        ? LOCAL_INVENTORY_CACHE
        : defaults;
      return new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" }
      });
    }
    // Detect actual column names in inventory table
    const info = await db.prepare('PRAGMA table_info(inventory)').all();
    // If table doesn't exist, return cached or defaults to avoid 500s
    if (!info.results || info.results.length === 0) {
      const payload = Array.isArray(LOCAL_INVENTORY_CACHE) && LOCAL_INVENTORY_CACHE.length > 0
        ? LOCAL_INVENTORY_CACHE
        : [
            { room: 'standard', label: 'Standard Room', qty: 5, rateNonAC: 2000, rateAC: 2500, occupancy: 2, extraPerson: 500 },
            { room: 'deluxe', label: 'Deluxe Room', qty: 3, rateNonAC: 3000, rateAC: 3500, occupancy: 2, extraPerson: 500 },
            { room: 'family', label: 'Family Room', qty: 1, rateNonAC: 3500, rateAC: 4000, occupancy: 4, extraPerson: 700 },
            { room: 'deluxeFamily', label: 'Deluxe Family Room', qty: 1, rateNonAC: 4500, rateAC: 5000, occupancy: 4, extraPerson: 700 }
          ];
      return new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" }
      });
    }
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
    // Fallback to defaults instead of 500 to keep admin UI usable in dev
    const payload = Array.isArray(LOCAL_INVENTORY_CACHE) && LOCAL_INVENTORY_CACHE.length > 0
      ? LOCAL_INVENTORY_CACHE
      : [
          { room: 'standard', label: 'Standard Room', qty: 5, rateNonAC: 2000, rateAC: 2500, occupancy: 2, extraPerson: 500 },
          { room: 'deluxe', label: 'Deluxe Room', qty: 3, rateNonAC: 3000, rateAC: 3500, occupancy: 2, extraPerson: 500 },
          { room: 'family', label: 'Family Room', qty: 1, rateNonAC: 3500, rateAC: 4000, occupancy: 4, extraPerson: 700 },
          { room: 'deluxeFamily', label: 'Deluxe Family Room', qty: 1, rateNonAC: 4500, rateAC: 5000, occupancy: 4, extraPerson: 700 }
        ];
    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function PUT({ locals, request }) {
  try {
    const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
    const db = env.DB;
    const data = await request.json();

    // If DB is not available, store inventory in local memory for dev
    if (!db) {
      let itemsToUpdate = [];
      if (Array.isArray(data)) {
        itemsToUpdate = data;
      } else if (data && typeof data === 'object') {
        itemsToUpdate = Object.entries(data).map(([key, val]) => ({ room: key, ...val }));
      }
      // Basic normalization to ensure required fields exist
      LOCAL_INVENTORY_CACHE = (itemsToUpdate || []).map((it) => ({
        room: String(it.room || ''),
        label: String(it.label || it.room || ''),
        qty: Number(it.qty ?? 0),
        rateNonAC: Number(it.rateNonAC ?? 0),
        rateAC: Number(it.rateAC ?? 0),
        occupancy: Number(it.occupancy ?? 2),
        extraPerson: Number(it.extraPerson ?? 500)
      }));
      return new Response(JSON.stringify({ success: true, devCached: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

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