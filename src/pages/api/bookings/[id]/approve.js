// src/pages/api/bookings/[id]/approve.js
export async function POST({ locals, params, request }) {
  try {
    const db = locals.runtime.env.DB;
    const bookingId = params.id;
    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'Booking ID is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Fetch booking
    const booking = await db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(bookingId).first();
    if (!booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // Update status to approved
    await db.prepare(`UPDATE bookings SET status = 'approved' WHERE id = ?`).bind(bookingId).run();

    const name = (booking.name || 'Guest').toString().trim();
    const amount = String(booking.total || '');
    // Normalize mobile: strip non-digits, drop leading country code 91 or 0
    const rawMobile = (booking.mobile || '').toString().trim();
    const digits = rawMobile.replace(/\D+/g, '');
    let mobile = digits;
    if (mobile.startsWith('91') && mobile.length === 12) {
      mobile = mobile.slice(2);
    }
    if (mobile.startsWith('0') && mobile.length === 11) {
      mobile = mobile.slice(1);
    }
    const email = (booking.email || '').toString().trim();
    const precheckinUrl = locals.runtime.env.PRECHECKIN_URL || 'https://dolphinhouse-alibaug.com/pre-checkin';

    let sms_sent = false;
    let email_sent = false;

    // Helper: build variables with environment-configured keys
    const env = locals.runtime?.env || {};
    const emailVarKeys = {
      name: env.MSG91_EMAIL_VAR_NAME || 'var1',
      amount: env.MSG91_EMAIL_VAR_AMOUNT || 'var2',
      booking_id: env.MSG91_EMAIL_VAR_BOOKING_ID || 'var3',
      precheckin_link: env.MSG91_EMAIL_VAR_PRECHECKIN_LINK || 'var4'
    };
    const buildEmailVars = () => {
      const vars = {};
      // Primary mapping driven by env-configured keys
      vars[emailVarKeys.name] = name;
      vars[emailVarKeys.amount] = amount;
      vars[emailVarKeys.booking_id] = bookingId;
      vars[emailVarKeys.precheckin_link] = precheckinUrl;
      // Redundant common keys to maximize template compatibility
      vars.var1 = name;
      vars.var2 = amount;
      vars.var3 = bookingId;
      vars.var4 = precheckinUrl;
      vars.name = name;
      vars.amount = amount;
      vars.booking_id = bookingId;
      vars.link = precheckinUrl;
      vars.precheckin_link = precheckinUrl;
      return vars;
    };

    const smsVarKeys = {
      name: env.MSG91_SMS_VAR_NAME || 'var1',
      amount: env.MSG91_SMS_VAR_AMOUNT || 'var2',
      booking_id: env.MSG91_SMS_VAR_BOOKING_ID || 'var3',
      link: env.MSG91_SMS_VAR_LINK || 'var4'
    };
    const buildSmsVars = () => {
      const vars = {};
      if (smsVarKeys.name) vars[smsVarKeys.name] = name;
      if (smsVarKeys.amount) vars[smsVarKeys.amount] = amount;
      if (smsVarKeys.booking_id) vars[smsVarKeys.booking_id] = bookingId;
      if (smsVarKeys.link) vars[smsVarKeys.link] = precheckinUrl;
      return vars;
    };

    // ===============
    // MSG91 SMS (Flow) with fallback to DLT template sender
    // ===============
    if (mobile && /^[6-9][0-9]{9}$/.test(mobile)) {
      const FLOW_ID = locals.runtime.env.MSG91_SMS_FLOW_ID_PAYMENT_RECEIVED || '690d57d2cb3bc6022e4920b3';
      const SMS_API_URL = locals.runtime.env.MSG91_FLOW_API_URL || 'https://api.msg91.com/api/v5/flow';
      const AUTH_KEY = locals.runtime.env.MSG91_AUTH_KEY;
      const SENDER_ID = locals.runtime.env.MSG91_SENDER_ID || locals.runtime.env.VILPOWER_SENDER_ID || 'DLHNOS';

      if (AUTH_KEY && FLOW_ID) {
        const smsPayload = {
          flow_id: FLOW_ID,
          sender: SENDER_ID,
          mobiles: `91${mobile}`,
          // Common variable keys used in flows; include multiple to maximize compatibility
          VAR1: name,
          VAR2: amount,
          VAR3: bookingId,
          VAR4: precheckinUrl,
          // Lowercase variant often used in flows/templates
          var1: name,
          var2: amount,
          var3: bookingId,
          var4: precheckinUrl,
          name,
          amount,
          booking_id: bookingId,
          link: precheckinUrl,
          ...buildSmsVars()
        };

        try {
          const resp = await fetch(SMS_API_URL, {
            method: 'POST',
            headers: {
              'authkey': AUTH_KEY,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(smsPayload)
          });
          let result = {};
          try { result = await resp.json(); } catch { result = { status: resp.status }; }
          const ok = resp.ok || result.type === 'success' || /success/i.test(result.message || '');
          sms_sent = !!ok;
          // Fallback: if Flow fails to substitute variables, try DLT template sender via internal API
          if (!sms_sent) {
            try {
              const notifyUrl = new URL('/api/notify-payment', request.url);
              const nResp = await fetch(notifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'received',
                  id: bookingId,
                  name,
                  amount,
                  mobile,
                  email
                })
              });
              sms_sent = nResp.ok;
            } catch (_fallbackErr) {
              // keep sms_sent as false
            }
          }
        } catch (e) {
          // Fallback on network or API errors
          try {
            const notifyUrl = new URL('/api/notify-payment', request.url);
            const nResp = await fetch(notifyUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'received',
                id: bookingId,
                name,
                amount,
                mobile,
                email
              })
            });
            sms_sent = nResp.ok;
          } catch (_fallbackErr) {
            sms_sent = false;
          }
        }
      }
    }

    // ===============
    // MSG91 Email
    // ===============
    if (email) {
      const EMAIL_API_URL = locals.runtime.env.MSG91_EMAIL_API_URL || 'https://control.msg91.com/api/v5/email/send';
      const AUTH_KEY = locals.runtime.env.MSG91_AUTH_KEY;
      const FROM_EMAIL = locals.runtime.env.MSG91_EMAIL_FROM || 'no-reply@mail.dolphinhouse-alibaug.com';
      const FROM_NAME = locals.runtime.env.MSG91_EMAIL_FROM_NAME || 'Dolphin House';
      const TEMPLATE_ID = locals.runtime.env.MSG91_EMAIL_TEMPLATE_PAYMENT_RECEIVED || 'dh_booking_confirmation';
      const DOMAIN = locals.runtime.env.MSG91_EMAIL_DOMAIN || 'mail.dolphinhouse-alibaug.com';

      if (AUTH_KEY && TEMPLATE_ID) {
        // MSG91 expects variables per-recipient when using the recipients array.
        const emailPayload = {
          recipients: [
            { 
              to: [ { email, name } ],
              variables: buildEmailVars()
            }
          ],
          from: { email: FROM_EMAIL, name: FROM_NAME },
          ...(DOMAIN ? { domain: DOMAIN } : {}),
          template_id: TEMPLATE_ID
        };
        try {
          const resp = await fetch(EMAIL_API_URL, {
            method: 'POST',
            headers: {
              'authkey': AUTH_KEY,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(emailPayload)
          });
          let result = {};
          try { result = await resp.json(); } catch { result = { status: resp.status }; }
          const ok = resp.ok || result.type === 'success' || /success/i.test(result.message || '');
          email_sent = !!ok;
        } catch (e) {
          email_sent = false;
        }
      }
    }

    return new Response(JSON.stringify({ success: true, booking_id: bookingId, sms_sent, email_sent }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}