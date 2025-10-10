export async function GET({ env }) { 
  const db = env.DB;
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

export async function POST({ env, request }) {
  const db = env.DB;
  const body = await request.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const {
    name = "",
    email = "",
    room,
    acType = "nonac",
    checkin,
    checkout,
    guests = 2,
    nights = 1,
    total = 0,
    status = "payment_pending",
  } = body;

  try {
    await db
      .prepare(
        `INSERT INTO bookings (
          id, name, email, room, ac_type, checkin, checkout,
          guests, nights, total, status, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        name,
        email,
        room,
        acType,
        checkin,
        checkout,
        guests,
        nights,
        total,
        status,
        now
      )
      .run();

    return new Response(JSON.stringify({ success: true, id }), {
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

export async function PUT({ env, request }) {
  const db = env.DB;
  const body = await request.json();
  const { id, status } = body;

  try {
    await db.prepare("UPDATE bookings SET status = ? WHERE id = ?")
      .bind(status, id)
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