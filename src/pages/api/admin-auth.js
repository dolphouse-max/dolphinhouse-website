// Admin Authentication API (ID + Password)
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

export const POST = async ({ request, cookies, locals }) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const contentType = request.headers.get('content-type') || '';
    let login_id, password;
    if (contentType.includes('application/json')) {
      const data = await request.json().catch(() => ({}));
      login_id = data?.login_id || data?.loginId || '';
      password = data?.password || '';
    } else {
      const form = await request.formData().catch(() => null);
      login_id = form ? (form.get('login_id') || form.get('loginId') || '') : '';
      password = form ? (form.get('password') || '') : '';
    }

    const loginId = String(login_id || '').trim();
      console.log('[admin-auth] contentType=', contentType, 'login_id=', loginId, 'hasPassword=', !!password);
      if (!loginId || loginId !== 'owner') {
        return new Response(JSON.stringify({ error: 'Invalid login ID' }), { status: 400, headers });
      }
      if (!password) {
        return new Response(JSON.stringify({ error: 'Password required' }), { status: 400, headers });
      }

    const secret = locals?.runtime?.env?.SESSION_SECRET || 'dev-secret';
    const db = locals?.runtime?.env?.DB;

    let storedHash = null;
    const defaultPwd = locals?.runtime?.env?.ADMIN_DEFAULT_PASSWORD || 'owner-dolphin123';
    if (db) {
      await ensureTable(db);
      const row = await db.prepare('SELECT password_hash FROM admin_credentials WHERE login_id = ?').bind(loginId).first();
      if (row && row.password_hash) {
        storedHash = row.password_hash;
      } else {
        // Initialize default password when DB exists but no record
        const defaultHash = await hmacHex(secret, defaultPwd);
        await db.prepare('INSERT OR REPLACE INTO admin_credentials (login_id, password_hash, updated_at) VALUES (?, ?, ?)')
          .bind(loginId, defaultHash, new Date().toISOString()).run();
        storedHash = defaultHash;
      }
    } else {
      // No DB available: fall back to hardcoded default
      storedHash = await hmacHex(secret, defaultPwd);
    }
    console.log('[admin-auth] DB present:', !!db, 'storedHash set:', !!storedHash);

    const candidateHash = await hmacHex(secret, password);
    console.log('[admin-auth] candidateHash match:', candidateHash === storedHash);
    if (candidateHash !== storedHash) {
      // Accept either the configured default or legacy default to avoid lockout
      const defaultHash = await hmacHex(secret, defaultPwd);
      const legacyHash = await hmacHex(secret, 'dolphin123');
      if (candidateHash !== defaultHash && candidateHash !== legacyHash) {
        return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401, headers });
      }
    }

    const valueSig = await hmacHex(secret, loginId);
    const value = `${loginId}.${valueSig}`;

    const isHttps = (() => {
      try {
        return new URL(request.url).protocol === 'https:';
      } catch {
        return true;
      }
    })();

    console.log('[admin-auth] Setting cookie', { isHttps, secure: isHttps, valuePreview: value.slice(0, 20) + '...' });
    cookies.set('admin_session', value, {
      path: '/',
      httpOnly: true,
      secure: isHttps,
      sameSite: 'Strict',
      maxAge: 60 * 60 * 24
    });

    if ((request.headers.get('content-type') || '').includes('application/json')) {
      return new Response(JSON.stringify({ success: true, message: 'Login successful', login_id: loginId }), { headers });
    } else {
      return new Response(null, { status: 303, headers: { Location: '/admin' } });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return new Response(JSON.stringify({ error: 'Authentication failed', details: error.message }), { status: 500, headers });
  }
};

export const DELETE = async ({ cookies }) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  cookies.delete('admin_session', { path: '/' });
  return new Response(JSON.stringify({ success: true, message: 'Logged out successfully' }), { headers });
};

export const OPTIONS = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  return new Response(null, { headers });
};