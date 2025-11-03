// src/pages/api/bookings.js
export async function GET({ locals, request }) {
  const db = locals.runtime.env.DB;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  try {
    // Discover schema to handle snake_case/camelCase differences
    const info = await db.prepare('PRAGMA table_info(bookings)').all();
    const cols = new Set((info.results || []).map((r) => r.name));
    const col = (pref, alt) => (cols.has(pref) ? pref : cols.has(alt) ? alt : pref);
    const createdCol = col('createdAt', 'created_at');
    const customerIdCol = col('customer_id', 'customer_id');
    const emailCol = col('email', 'email');
    const mobileCol = col('mobile', 'mobile');
    const roomCol = col('room', 'room');
    const checkinCol = col('checkin', 'checkin');
    const checkoutCol = col('checkout', 'checkout');
    const nightsCol = col('nights', 'nights');
    const guestsCol = col('guests', 'guests');
    const totalCol = col('total', 'total');
    const statusCol = col('status', 'status');

    if (id) {
      // Fetch single booking
      const booking = await db
        .prepare(`SELECT 
          id,
          ${customerIdCol} AS customer_id,
          name,
          ${emailCol} AS email,
          ${mobileCol} AS mobile,
          ${roomCol} AS room,
          ${checkinCol} AS checkin,
          ${checkoutCol} AS checkout,
          ${nightsCol} AS nights,
          ${guestsCol} AS guests,
          ${totalCol} AS total,
          ${statusCol} AS status,
          ${createdCol} AS createdAt
        FROM bookings WHERE id = ?`)
        .bind(id)
        .first();
      return new Response(JSON.stringify(booking || {}), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Date-range filtering (optional)
    if (start || end) {
      const clauses = [];
      const values = [];
      if (start) {
        clauses.push(`date(${checkoutCol}) > date(?)`);
        values.push(start);
      }
      if (end) {
        // end is exclusive in callers
        clauses.push(`date(${checkinCol}) < date(?)`);
        values.push(end);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const sql = `SELECT 
        id,
        ${customerIdCol} AS customer_id,
        name,
        ${emailCol} AS email,
        ${mobileCol} AS mobile,
        ${roomCol} AS room,
        ${checkinCol} AS checkin,
        ${checkoutCol} AS checkout,
        ${nightsCol} AS nights,
        ${guestsCol} AS guests,
        ${totalCol} AS total,
        ${statusCol} AS status,
        ${createdCol} AS createdAt
      FROM bookings ${where} ORDER BY date(${checkinCol}) ASC`;
      const res = await db.prepare(sql).bind(...values).all();
      return new Response(JSON.stringify(res.results || []), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch all bookings when no range params provided
    const { results } = await db
      .prepare(`SELECT 
        id,
        ${customerIdCol} AS customer_id,
        name,
        ${emailCol} AS email,
        ${mobileCol} AS mobile,
        ${roomCol} AS room,
        ${checkinCol} AS checkin,
        ${checkoutCol} AS checkout,
        ${nightsCol} AS nights,
        ${guestsCol} AS guests,
        ${totalCol} AS total,
        ${statusCol} AS status,
        ${createdCol} AS createdAt
      FROM bookings ORDER BY ${createdCol} DESC`)
      .all();

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("GET /api/bookings failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST({ locals, request }) {
  const db = locals.runtime.env.DB;
  const body = await request.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const {
    name = "",
    email = "",
    room,
    checkin,
    checkout,
    guests = 2,
    nights = 1,
    total = 0,
    status = "payment_pending",
  } = body;

  // Generate Customer ID: DH-YYYYMMDD-XXXX
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const shortId = id.substring(0, 4).toUpperCase();
  const customerId = `DH-${today}-${shortId}`;

  console.log('Creating booking with Customer ID:', customerId);

  try {
    await db
      .prepare(
        `INSERT INTO bookings (
          id, customer_id, name, email, room, checkin, checkout,
          guests, nights, total, status, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        customerId,
        name,
        email,
        room,
        checkin,
        checkout,
        guests,
        nights,
        total,
        status,
        now
      )
      .run();

    console.log('Booking created successfully:', { id, customerId });

    return new Response(JSON.stringify({ success: true, id, customerId }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("POST /api/bookings failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function PUT({ locals, request }) {
  const db = locals.runtime.env.DB;
  const body = await request.json();
  const { id, name, email, mobile, guests, total, screenshot, status } = body;

  try {
    // Build dynamic SQL based on what fields are provided
    const updates = [];
    const values = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);
    }
    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (mobile) {
      updates.push('mobile = ?');
      values.push(mobile);
    }
    if (guests) {
      updates.push('guests = ?');
      values.push(guests);
    }
    if (total) {
      updates.push('total = ?');
      values.push(total);
    }

    values.push(id); // ID for WHERE clause

    await db.prepare(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("PUT /api/bookings failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}