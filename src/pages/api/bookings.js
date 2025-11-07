// src/pages/api/bookings.js
export async function GET({ locals, request }) {
  const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
  const db = env.DB;
  // Local fallback: generate sample bookings when DB is unavailable
  if (!db) {
    const url = new URL(request.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");

    // Helper to generate ISO date strings
    const iso = (d) => new Date(d).toISOString().slice(0, 10);
    const addDays = (d, n) => {
      const dt = new Date(d);
      dt.setDate(dt.getDate() + n);
      return dt;
    };

    const today = new Date();
    const startBase = start ? new Date(start) : today;
    const endBase = end ? new Date(end) : addDays(today, 28);
    const rooms = [
      { key: 'standard', label: 'Standard Room', base: 2500 },
      { key: 'deluxe', label: 'Deluxe Room', base: 3500 },
      { key: 'family', label: 'Family Room', base: 4000 },
      { key: 'deluxeFamily', label: 'Deluxe Family Room', base: 5000 }
    ];

    const statuses = ['pending', 'payment_pending', 'approved', 'confirmed', 'checked_in'];
    const names = ['Amit', 'Priya', 'Rahul', 'Sneha', 'Vikram', 'Neha', 'Arjun', 'Pooja'];

    const samples = [];
    let seq = 1;
    // Create bookings across date range with varied lengths and statuses
    for (let d = new Date(startBase); d < endBase; d = addDays(d, 2)) {
      for (const room of rooms) {
        // roughly 50% fill rate
        if (Math.random() < 0.5) {
          const nights = 1 + Math.floor(Math.random() * 3);
          const checkin = new Date(d);
          const checkout = addDays(checkin, nights);
          const status = statuses[Math.floor(Math.random() * statuses.length)];
          const id = `local-${Date.now()}-${seq++}`;
          const customerId = `DH-${iso(today).replace(/-/g, '')}-${(seq + '').padStart(4, '0')}`;
          const name = names[Math.floor(Math.random() * names.length)] + ' ' + ['Patil','Sharma','Desai','Iyer','Gupta'][Math.floor(Math.random()*5)];
          const email = `${name.split(' ')[0].toLowerCase()}@example.com`;
          const mobile = `98${Math.floor(10000000 + Math.random()*89999999)}`;
          samples.push({
            id,
            customer_id: customerId,
            name,
            email,
            mobile,
            room: room.key,
            checkin: iso(checkin),
            checkout: iso(checkout),
            nights,
            guests: 2 + Math.floor(Math.random()*2),
            total: nights * room.base,
            status,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // Filter based on provided range if any: checkout > start AND checkin < end
    const filtered = samples.filter(b => {
      if (start && !(new Date(b.checkout) > new Date(start))) return false;
      if (end && !(new Date(b.checkin) < new Date(end))) return false;
      return true;
    });

    return new Response(JSON.stringify(filtered), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  try {
    // Discover schema to handle snake_case/camelCase differences
    const info = await db.prepare('PRAGMA table_info(bookings)').all();
    const cols = new Set((info.results || []).map((r) => r.name));
    // If the bookings table doesn't exist, return an empty list to avoid 500s in local/dev
    if (!info.results || info.results.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      });
    }
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
    const bookingFromCol = cols.has('booking_from') ? 'booking_from' : null;

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
          ${bookingFromCol ? `, ${bookingFromCol} AS booking_from` : ''}
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
        ${bookingFromCol ? `${bookingFromCol} AS booking_from,` : ''}
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
        ${bookingFromCol ? `${bookingFromCol} AS booking_from,` : ''}
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
  const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
  const db = env.DB;
  if (!db) {
    // Local fallback: accept booking and return a mock ID so flows can be tested
    const body = await request.json();
    const id = `local-${crypto.randomUUID()}`;
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const shortId = id.substring(6, 10).toUpperCase();
    const customerId = `DH-${today}-${shortId}`;
    console.warn('POST /api/bookings (local fallback) returning mock booking id');
    return new Response(JSON.stringify({ success: true, id, customerId }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
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
    // Discover schema for insert column names (camelCase vs snake_case)
    const info = await db.prepare('PRAGMA table_info(bookings)').all();
    const cols = new Set((info.results || []).map((r) => r.name));
    const has = (c) => cols.has(c);
    const customerIdCol = has('customer_id') ? 'customer_id' : 'customerId';
    const createdCol = has('created_at') ? 'created_at' : 'createdAt';

    await db
      .prepare(
        `INSERT INTO bookings (
          id, ${customerIdCol}, name, email, room, checkin, checkout,
          guests, nights, total, status, ${createdCol}
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
  const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
  const db = env.DB;
  if (!db) {
    // Local fallback: accept update request without persistence
    const body = await request.json().catch(() => ({}));
    console.warn('PUT /api/bookings (local fallback) received update:', body?.id);
    return new Response(JSON.stringify({ success: true, note: 'Local fallback: no DB, no persistence' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
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