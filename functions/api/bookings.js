// functions/api/bookings.js
export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB; // make sure you bound your D1 database to the Pages project with the binding name "DB"

  // GET: list bookings
  if (request.method === "GET") {
    const results = await db.prepare("SELECT * FROM bookings ORDER BY created_at DESC").all();
    return new Response(JSON.stringify(results.results || []), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST: create booking
  if (request.method === "POST") {
    const body = await request.json();
    const id = body.id || crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO bookings (id, name, email, room, checkin, checkout, guests, nights, total, status, screenshot, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        body.name || "",
        body.email || "",
        body.room || "",
        body.checkin || "",
        body.checkout || "",
        body.guests || 0,
        body.nights || 0,
        body.total || 0,
        body.status || "pending",
        body.screenshot || null,
        new Date().toISOString()
      )
      .run();

    return new Response(JSON.stringify({ id }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  // PUT: update booking (expects full booking object with id)
  if (request.method === "PUT") {
    const body = await request.json();
    await db
      .prepare(
        `UPDATE bookings SET name=?, email=?, room=?, checkin=?, checkout=?, guests=?, nights=?, total=?, status=?, screenshot=? WHERE id=?`
      )
      .bind(
        body.name,
        body.email,
        body.room,
        body.checkin,
        body.checkout,
        body.guests,
        body.nights,
        body.total,
        body.status,
        body.screenshot || null,
        body.id
      )
      .run();

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // DELETE: delete booking (expects { id: "<id>" } in JSON body)
  if (request.method === "DELETE") {
    const body = await request.json();
    await db.prepare("DELETE FROM bookings WHERE id = ?").bind(body.id).run();
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
}
