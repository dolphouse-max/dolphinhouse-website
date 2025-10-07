export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare("SELECT * FROM inventory").all();
  return Response.json(results);
}

export async function onRequestPut({ env, request }) {
  const data = await request.json();

  // Clear and reinsert data
  await env.DB.prepare("DELETE FROM inventory").run();

  for (const [key, val] of Object.entries(data)) {
    await env.DB.prepare(
      `INSERT INTO inventory (room, label, qty, rateNonAC, rateAC)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(key, val.label, val.qty, val.rateNonAC, val.rateAC).run();
  }

  return Response.json({ success: true });
}
