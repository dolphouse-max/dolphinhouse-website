// Global booking availability toggle API
// GET: returns { bookingEnabled: boolean, notice: string }
// PUT: accepts { bookingEnabled?: boolean, notice?: string, contact?: { phone1?: string, phone2?: string, whatsapp?: string, email?: string } }
// - If fields are omitted, they are left unchanged.

let DEV_BOOKING_ENABLED = true; // in-memory fallback when DB is not bound
let DEV_BOOKING_NOTICE = "Bookings are temporarily paused. Please check back later.";
let DEV_BOOKING_CONTACT = { phone1: "+918554871073", phone2: "+917276171735", whatsapp: "+918554871073", email: "booking@dolphinhouse-alibaug.com" };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;
  if (method === 'OPTIONS') return json(null);

  const db = env?.DB;

  try {
    if (method === 'GET') {
      if (!db) {
        return json({ bookingEnabled: DEV_BOOKING_ENABLED, notice: DEV_BOOKING_NOTICE });
      }
      // Ensure settings table
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `).run();
      const enabledRow = await db.prepare(`SELECT value FROM app_settings WHERE key = 'booking_enabled'`).first();
      const noticeRow = await db.prepare(`SELECT value FROM app_settings WHERE key = 'booking_notice'`).first();
      const contactRow = await db.prepare(`SELECT value FROM app_settings WHERE key = 'booking_contact'`).first();
      const enabled = enabledRow?.value === 'true' || enabledRow?.value === true;
      const notice = typeof noticeRow?.value === 'string' ? noticeRow.value : '';
      let contact = {};
      try { contact = contactRow?.value ? JSON.parse(contactRow.value) : {}; } catch {}
      return json({ bookingEnabled: enabled, notice, contact });
    }

    if (method === 'PUT') {
      const body = await request.json();
      const hasEnabled = Object.prototype.hasOwnProperty.call(body, 'bookingEnabled');
      const hasNotice = Object.prototype.hasOwnProperty.call(body, 'notice');
      const hasContact = Object.prototype.hasOwnProperty.call(body, 'contact');
      const nextEnabled = hasEnabled ? Boolean(body.bookingEnabled) : undefined;
      const nextNotice = hasNotice ? String(body.notice || '') : undefined;
      const nextContact = hasContact ? (body.contact || {}) : undefined;
      if (!db) {
        if (hasEnabled) DEV_BOOKING_ENABLED = nextEnabled;
        if (hasNotice) DEV_BOOKING_NOTICE = nextNotice;
        if (hasContact) DEV_BOOKING_CONTACT = { ...DEV_BOOKING_CONTACT, ...nextContact };
        return json({ success: true, bookingEnabled: DEV_BOOKING_ENABLED, notice: DEV_BOOKING_NOTICE, contact: DEV_BOOKING_CONTACT });
      }
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `).run();
      if (hasEnabled) {
        await db.prepare(`
          INSERT INTO app_settings (key, value) VALUES ('booking_enabled', ?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value
        `).bind(nextEnabled ? 'true' : 'false').run();
      }
      if (hasNotice) {
        await db.prepare(`
          INSERT INTO app_settings (key, value) VALUES ('booking_notice', ?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value
        `).bind(nextNotice).run();
      }
      if (hasContact) {
        const mergedContact = await (async () => {
          // Merge with existing stored contact to avoid losing unspecified fields
          const row = await db.prepare(`SELECT value FROM app_settings WHERE key = 'booking_contact'`).first();
          let current = {};
          try { current = row?.value ? JSON.parse(row.value) : {}; } catch {}
          return { ...current, ...nextContact };
        })();
        await db.prepare(`
          INSERT INTO app_settings (key, value) VALUES ('booking_contact', ?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value
        `).bind(JSON.stringify(mergedContact)).run();
      }
      // Return current values after update
      const enabledRow = await db.prepare(`SELECT value FROM app_settings WHERE key = 'booking_enabled'`).first();
      const noticeRow = await db.prepare(`SELECT value FROM app_settings WHERE key = 'booking_notice'`).first();
      const contactRow = await db.prepare(`SELECT value FROM app_settings WHERE key = 'booking_contact'`).first();
      const enabled = enabledRow?.value === 'true' || enabledRow?.value === true;
      const notice = typeof noticeRow?.value === 'string' ? noticeRow.value : '';
      let contact = {};
      try { contact = contactRow?.value ? JSON.parse(contactRow.value) : {}; } catch {}
      return json({ success: true, bookingEnabled: enabled, notice, contact });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('booking-toggle error', err);
    return json({ error: 'Internal server error', details: String(err?.message || err) }, 500);
  }
}

export const GET = onRequest;
export const PUT = onRequest;
export const OPTIONS = onRequest;