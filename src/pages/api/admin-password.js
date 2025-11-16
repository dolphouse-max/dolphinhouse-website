// Admin password update API
import { isAuthenticated } from '../../middleware/auth.js';

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function ensureTable(db) {
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS admin_credentials (login_id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, updated_at TEXT NOT NULL)'
  ).run();
}

export const POST = async (ctx) => {
  const { request, locals } = ctx;
  // Require auth
  const ok = await isAuthenticated(ctx);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const contentType = request.headers.get('content-type') || '';
    let login_id = 'owner';
    let new_password = '';
    if (contentType.includes('application/json')) {
      const data = await request.json().catch(() => ({}));
      login_id = String(data?.login_id || data?.loginId || 'owner').trim();
      new_password = String(data?.new_password || data?.newPassword || '').trim();
    } else {
      const form = await request.formData().catch(() => null);
      login_id = String(form?.get('login_id') || form?.get('loginId') || 'owner').trim();
      new_password = String(form?.get('new_password') || form?.get('newPassword') || '').trim();
    }

    if (!login_id || login_id !== 'owner') {
      return new Response(JSON.stringify({ error: 'Invalid login ID' }), { status: 400, headers });
    }
    if (!new_password || new_password.length < 6) {
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), { status: 400, headers });
    }

    const secret = locals?.runtime?.env?.SESSION_SECRET || 'dev-secret';
    const db = locals?.runtime?.env?.DB;
    const hash = await hmacHex(secret, new_password);

    if (!db) {
      return new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 500, headers });
    }
    await ensureTable(db);
    await db.prepare('INSERT OR REPLACE INTO admin_credentials (login_id, password_hash, updated_at) VALUES (?, ?, ?)')
      .bind(login_id, hash, new Date().toISOString())
      .run();

    return new Response(JSON.stringify({ success: true }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to update password', details: err?.message || String(err) }), { status: 500, headers });
  }
};

export const OPTIONS = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  return new Response(null, { headers });
};