// src/pages/api/uploads/[...path].js
// Proxy route to serve files from R2 (ID_BUCKET) for production.
// In Cloudflare Workers/Pages Functions, Node fs/path are not used.

export async function GET({ locals, params }) {
  const r2Bucket = locals.runtime.env.ID_BUCKET;
  const key = (params.path || '').toString();

  if (!key || !key.startsWith('precheckin/')) {
    return new Response('Not found', { status: 404 });
  }

  try {
    if (r2Bucket) {
      const obj = await r2Bucket.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      const body = await obj.arrayBuffer();
      const ct = obj.httpMetadata?.contentType || 'application/octet-stream';
      return new Response(body, { headers: { 'Content-Type': ct } });
    }

    // No R2 binding: in production, uploads should be served statically from /uploads.
    // Return 404 to avoid relying on Node-only fs/path fallback in Workers.
    return new Response('Not found', { status: 404 });
  } catch (err) {
    console.error('Uploads proxy error:', err);
    return new Response('Server error', { status: 500 });
  }
}