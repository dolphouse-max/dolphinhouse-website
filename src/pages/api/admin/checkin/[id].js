// src/pages/api/admin/checkin/[id].js
async function ensureColumns(db) {
  const info = await db.prepare('PRAGMA table_info(precheckin)').all();
  const cols = info.results?.map((r) => r.name) || [];
  const needed = [
    { name: 'car_reg_number', type: 'TEXT' },
    { name: 'id_type', type: 'TEXT' },
    { name: 'id_number', type: 'TEXT' },
    { name: 'id_front_url', type: 'TEXT' },
    { name: 'id_back_url', type: 'TEXT' },
    { name: 'id_image_url', type: 'TEXT' },
  ];
  for (const col of needed) {
    if (!cols.includes(col.name)) {
      await db.prepare(`ALTER TABLE precheckin ADD COLUMN ${col.name} ${col.type}`).run();
    }
  }
}

export async function GET({ locals, params }) {
  const db = locals.runtime.env.DB;
  const bookingId = params.id;

  try {
    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'Booking ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ensure table exists (safe if already created)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS precheckin (
        id TEXT PRIMARY KEY,
        booking_id TEXT,
        guest_name TEXT,
        phone_e164 TEXT,
        email TEXT,
        checkin_date TEXT,
        checkout_date TEXT,
        adults INTEGER,
        children INTEGER,
        arrival_time TEXT,
        id_type TEXT,
        id_number TEXT,
        special_requests TEXT,
        whatsapp_opt_in INTEGER,
        created_at TEXT
      )
    `).run();

    await ensureColumns(db);

    const record = await db.prepare(`
      SELECT * FROM precheckin
      WHERE booking_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(bookingId).first();

    if (!record) {
      return new Response(JSON.stringify({ error: 'Pre check-in not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(record), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Admin checkin GET error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}