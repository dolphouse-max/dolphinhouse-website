export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      message: "✅ Cloudflare Functions are working for Dolphin House!",
      time: new Date().toISOString(),
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}
