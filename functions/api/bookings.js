export async function onRequestGet({ env, request }) {
  const db = env.DB;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  try {
    if (id) {
      const booking = await db
        .prepare("SELECT * FROM bookings WHERE id = ?")
        .bind(id)
        .first();
      return Response.json(booking || {});
    }

    const { results } = await db
      .prepare("SELECT * FROM bookings ORDER BY createdAt DESC")
      .all();
    return Response.json(results);
  } catch (err) {
    console.error("GET /api/bookings failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function onRequestPost({ env, request }) {
  const db = env.DB;
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

  try {
    await db
      .prepare(
        `INSERT INTO bookings (
          id, name, email, room, checkin, checkout,
          guests, nights, total, status, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, name, email, room, checkin, checkout, guests, nights, total, status, now)
      .run();

    return Response.json({ success: true, id });
  } catch (err) {
    console.error("POST /api/bookings failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function onRequestPut({ env, request }) {
  const db = env.DB;
  const body = await request.json();
  const { id, status } = body;

  try {
    await db.prepare("UPDATE bookings SET status = ? WHERE id = ?")
      .bind(status, id)
      .run();
    return Response.json({ success: true });
  } catch (err) {
    console.error("PUT /api/bookings failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
