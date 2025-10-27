// Simple authentication middleware for admin pages using login ID
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

export async function isAuthenticated(context) {
  const rawCookie = context.cookies.get('admin_session');
  console.log('[isAuthenticated] raw cookie:', rawCookie);
  const raw = rawCookie?.value || '';
  if (!raw) return false;
  const parts = String(raw).split('.');
  if (parts.length !== 2) return false;
  const [loginId, sig] = parts;
  const allowedLoginId = 'owner';
  console.log('[isAuthenticated] parts length:', parts.length, 'loginId:', loginId);
  if (loginId !== allowedLoginId) return false;
  const secret = context.locals?.runtime?.env?.SESSION_SECRET || 'dev-secret';
  const expect = await hmacHex(secret, loginId);
  console.log('[isAuthenticated] expect prefix:', expect.slice(0, 16), 'sig prefix:', String(sig).slice(0,16), 'match:', sig === expect);
  return sig === expect;
}

export async function requireAuth({ cookies, redirect, locals }) {
  const rawCookie = cookies.get('admin_session');
  console.log('[requireAuth] raw cookie:', rawCookie);
  const raw = rawCookie?.value || '';
  if (!raw) return redirect('/admin/login');
  const parts = String(raw).split('.');
  const [loginId, sig] = parts;
  console.log('[requireAuth] partsLen:', parts.length, 'loginId:', loginId);
  if (parts.length !== 2) return redirect('/admin/login');
  const allowedLoginId = 'owner';
  if (loginId !== allowedLoginId) return redirect('/admin/login');
  const secret = locals?.runtime?.env?.SESSION_SECRET || 'dev-secret';
  const expect = await hmacHex(secret, loginId);
  console.log('[requireAuth] match:', sig === expect);
  if (sig !== expect) return redirect('/admin/login');
}