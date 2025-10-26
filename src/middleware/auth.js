// Simple authentication middleware for admin pages
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
  const raw = context.cookies.get('admin_session');
  if (!raw) return false;
  const parts = String(raw).split('.');
  if (parts.length !== 2) return false;
  const [email, sig] = parts;
  const allowedEmail = 'gjpatil@gmail.com';
  if (email !== allowedEmail) return false;
  const secret = context.locals?.runtime?.env?.SESSION_SECRET || '';
  if (!secret) return false;
  const expect = await hmacHex(secret, email);
  return sig === expect;
}

export async function requireAuth({ cookies, redirect, locals }) {
  const raw = cookies.get('admin_session');
  if (!raw) return redirect('/admin/login');
  const parts = String(raw).split('.');
  if (parts.length !== 2) return redirect('/admin/login');
  const [email, sig] = parts;
  const allowedEmail = 'gjpatil@gmail.com';
  if (email !== allowedEmail) return redirect('/admin/login');
  const secret = locals?.runtime?.env?.SESSION_SECRET || '';
  if (!secret) return redirect('/admin/login');
  const expect = await hmacHex(secret, email);
  if (sig !== expect) return redirect('/admin/login');
}