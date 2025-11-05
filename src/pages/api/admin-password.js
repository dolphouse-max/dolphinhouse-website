// API to change owner password
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

async function validateSessionCookie(raw, secret) {
  if (!raw) return false;
  const parts = String(raw).split('.');
  if (parts.length !== 2) return false;
  const [loginId, sig] = parts;
  if (loginId !== 'owner') return false;
  const expectedSig = await hmacHex(secret, loginId);
  return sig === expectedSig;
}

export const POST = async ({ request, cookies, locals }) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const secret = locals?.runtime?.env?.SESSION_SECRET || 'dev-secret';
    const db = locals?.runtime?.env?.DB;

    const raw = cookies.get('admin_session')?.value;
    if (!(await validateSessionCookie(raw, secret))) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    const body = await request.json().catch(() => ({}));
    const { new_password } = body || {};
    if (!new_password || String(new_password).length < 6) {
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), { status: 400, headers });
    }

    if (!db) {
      return new Response(JSON.stringify({ error: 'Database not available' }), { status: 500, headers });
    }

    await ensureTable(db);
    const hash = await hmacHex(secret, new_password);
    await db.prepare('INSERT OR REPLACE INTO admin_credentials (login_id, password_hash, updated_at) VALUES (?, ?, ?)')
      .bind('owner', hash, new Date().toISOString()).run();

    return new Response(JSON.stringify({ success: true }), { headers });
  } catch (err) {
    console.error('Change password error:', err);
    return new Response(JSON.stringify({ error: 'Server error', details: err.message }), { status: 500, headers });
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