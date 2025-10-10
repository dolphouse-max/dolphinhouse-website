export async function onRequest() {
  return new Response(`Node version: ${process.version}`);
}
