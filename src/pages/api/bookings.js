// src/pages/api/bookings.js
export async function GET({ locals, request }) {
  const db = locals.runtime.env.DB;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  try {
    if (id) {
      // Fetch single booking
      const booking = await db
        .prepare("SELECT * FROM bookings WHERE id = ?")
        .bind(id)
        .first();
      return new Response(JSON.stringify(booking || {}), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch all bookings
    const { results } = await db
      .prepare("SELECT * FROM bookings ORDER BY createdAt DESC")
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