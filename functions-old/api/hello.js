// functions/api/hello.js
export async function onRequestGet() {
  return new Response(JSON.stringify({
    ok: true,
    msg: "Cloudflare function is live",
    time: new Date().toISOString()
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
