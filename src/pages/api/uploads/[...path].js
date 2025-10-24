// src/pages/api/uploads/[...path].js
// Proxy route to serve files from R2 (ID_BUCKET) for production.
// Falls back to serving from local filesystem if R2 is not bound.
import { promises as fs } from 'node:fs';
import path from 'node:path';

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

    // Dev fallback: serve from local public/uploads
    const fullPath = path.join(process.cwd(), 'public', 'uploads', key);
    const data = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const ct = (
      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
      ext === '.png' ? 'image/png' :
      ext === '.pdf' ? 'application/pdf' : 'application/octet-stream'
    );
    return new Response(data, { headers: { 'Content-Type': ct } });
  } catch (err) {
    console.error('Uploads proxy error:', err);
    return new Response('Server error', { status: 500 });
  }
}