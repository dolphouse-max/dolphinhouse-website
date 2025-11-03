// Secure bootstrap endpoint to initialize D1 tables and seed default data
// Usage: Login to /admin first (cookie 'admin_session' set), then GET /api/bootstrap-d1

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

function parseCookie(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = v;
    }
  });
  return out;
}

async function verifyAdmin(request, env) {
  const cookies = parseCookie(request.headers.get('cookie') || '');
  const raw = cookies['admin_session'] || '';
  if (!raw) return false;
  const parts = String(raw).split('.');
  if (parts.length !== 2) return false;
  const [loginId, sig] = parts;
  if (loginId !== 'owner') return false;
  const secret = (env?.SESSION_SECRET) || 'dev-secret';
  const expect = await hmacHex(secret, loginId);
  return sig === expect;
}

export async function GET({ locals, request }) {
  const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
  const db = env.DB;
  try {
    if (!db) {
      return new Response(JSON.stringify({ error: 'DB binding missing. Ensure Cloudflare Pages has D1 binding "DB".' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Require admin session
    const ok = await verifyAdmin(request, env);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Please login to /admin first.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create tables if they do not exist
    const createInventorySQL = `
      CREATE TABLE IF NOT EXISTS inventory (
        room TEXT PRIMARY KEY,
        label TEXT,
        qty INTEGER,
        rateNonAC INTEGER,
        rateAC INTEGER,
        occupancy INTEGER,
        extraPerson INTEGER
      )
    `;

    const createBookingsSQL = `
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        mobile TEXT,
        room TEXT NOT NULL,
        checkin TEXT NOT NULL,
        checkout TEXT NOT NULL,
        guests INTEGER NOT NULL DEFAULT 2,
        nights INTEGER NOT NULL DEFAULT 1,
        total REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'payment_pending',
        created_at TEXT NOT NULL
      )
    `;

    await db.prepare(createInventorySQL).run();
    await db.prepare(createBookingsSQL).run();

    // Seed inventory if empty
    const countRes = await db.prepare('SELECT COUNT(*) AS c FROM inventory').first();
    let seeded = 0;
    if ((countRes?.c ?? 0) === 0) {
      const defaults = {
        standard: { label: 'Standard Room', qty: 5, rateNonAC: 2000, rateAC: 2300, occupancy: 2, extraPerson: 700 },
        deluxe: { label: 'Deluxe Room', qty: 2, rateNonAC: 2300, rateAC: 2600, occupancy: 3, extraPerson: 700 },
        family: { label: 'Family Room', qty: 1, rateNonAC: 3000, rateAC: 3500, occupancy: 4, extraPerson: 700 },
        deluxeFamily: { label: 'Deluxe Family Room', qty: 1, rateNonAC: 3300, rateAC: 3800, occupancy: 4, extraPerson: 700 }
      };
      for (const [room, r] of Object.entries(defaults)) {
        await db.prepare(
          'INSERT INTO inventory (room, label, qty, rateNonAC, rateAC, occupancy, extraPerson) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(room, r.label, r.qty, r.rateNonAC, r.rateAC, r.occupancy, r.extraPerson).run();
        seeded += 1;
      }
    }

    return new Response(JSON.stringify({ ok: true, tables: ['inventory', 'bookings'], seeded }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Bootstrap D1 error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}