export async function onRequestGet(context) {
  const db = context.env.DB;
  const { searchParams } = new URL(context.request.url);
  const id = searchParams.get('id');

  if (id) {
    const booking = await db.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
    return new Response(JSON.stringify(booking || {}), { status: 200 });
  }

  const rows = await db.prepare("SELECT * FROM bookings ORDER BY createdAt DESC").all();
  return new Response(JSON.stringify(rows.results), { status: 200 });
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const body = await context.request.json();

  // auto-generate UUID for D1
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const {
    name = "",
    email = "",
    room,
    checkin,
    checkout,
    guests = 2,
    nights,
    total,
    status = "payment_pending"
  } = body;

  await db
    .prepare(
      `INSERT INTO bookings (id, name, email, room, checkin, checkout, guests, nights, total, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, name, email, room, checkin, checkout, guests, nights, total, status, now)
    .run();

  return new Response(JSON.stringify({ success: true, id }), { status: 200 });
}

export async function onRequestPut(context) {
  const db = context.env.DB;
  const body = await context.request.json();
  const { id, status } = body;

  await db.prepare("UPDATE bookings SET status = ? WHERE id = ?").bind(status, id).run();
  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
