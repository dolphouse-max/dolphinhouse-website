// Admin Authentication API (Google Sign-In)
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

export const POST = async ({ request, cookies, locals }) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const data = await request.json();
    const { id_token } = data;

    if (!id_token) {
      return new Response(
        JSON.stringify({ error: 'Missing id_token' }),
        { status: 400, headers }
      );
    }

    // Verify the ID token with Google
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`);
    const tokenInfo = await tokenInfoRes.json().catch(() => ({}));

    if (!tokenInfoRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Invalid Google ID token', debug: tokenInfo }),
        { status: 401, headers }
      );
    }

    const email = tokenInfo.email;
    const emailVerified = tokenInfo.email_verified === 'true' || tokenInfo.email_verified === true;

    // Optional: check audience/client id if available via env
    const expectedAud = locals?.runtime?.env?.GOOGLE_CLIENT_ID;
    if (expectedAud && tokenInfo.aud && tokenInfo.aud !== expectedAud) {
      return new Response(
        JSON.stringify({ error: 'Token audience mismatch' }),
        { status: 401, headers }
      );
    }

    // Allow only the specific admin email
    const allowedEmail = 'gjpatil@gmail.com';
    if (!emailVerified || email !== allowedEmail) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized email' }),
        { status: 403, headers }
      );
    }

    const secret = locals?.runtime?.env?.SESSION_SECRET;
    if (!secret) {
      return new Response(
        JSON.stringify({ error: 'Missing SESSION_SECRET' }),
        { status: 500, headers }
      );
    }

    const sig = await hmacHex(secret, email);
    const value = `${email}.${sig}`;

    // Set a secure session cookie with signed value
    cookies.set('admin_session', value, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 60 * 60 * 24 // 24 hours
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Login successful', email }),
      { headers }
    );
  } catch (error) {
    console.error('Auth error:', error);
    return new Response(
      JSON.stringify({ error: 'Authentication failed', details: error.message }),
      { status: 500, headers }
    );
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
  return new Response(
    JSON.stringify({ success: true, message: 'Logged out successfully' }),
    { headers }
  );
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