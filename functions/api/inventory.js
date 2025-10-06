export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare("SELECT json_data FROM inventory LIMIT 1").all();
    if (results.length === 0) return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } });
    return new Response(results[0].json_data, { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPut({ env, request }) {
  const data = await request.json();
  await env.DB.prepare("DELETE FROM inventory").run();
  await env.DB.prepare("INSERT INTO inventory (json_data) VALUES (?)").bind(JSON.stringify(data)).run();
  return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
}
