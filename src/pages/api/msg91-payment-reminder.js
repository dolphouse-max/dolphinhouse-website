// src/pages/api/msg91-payment-reminder.js
// Sends Payment Pending Reminder via MSG91 Flow API using provided template (flow) ID
export async function POST({ locals, request }) {
  try {
    const { booking_id } = await request.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ success: false, error: 'booking_id is required' }), { status: 400 });
    }

    const db = locals.runtime.env.DB;
    const booking = await db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(booking_id).first();
    if (!booking) {
      return new Response(JSON.stringify({ success: false, error: 'Booking not found' }), { status: 404 });
    }

    const mobile = (booking.mobile || '').toString().trim();
    if (!mobile || !/^[6-9][0-9]{9}$/.test(mobile)) {
      return new Response(JSON.stringify({ success: false, error: 'Valid mobile not available for booking' }), { status: 400 });
    }

    const name = (booking.name || 'Guest').toString().trim();
    const amount = String(booking.total || '');
    const id = booking.id;

    const PRECHECKIN_URL = locals.runtime.env.PRECHECKIN_URL || 'https://dolphinhouse-alibaug.com/pre-checkin';
    const PAY_URL_PREFIX = locals.runtime.env.PAY_URL_PREFIX || 'https://dolphinhouse-alibaug.com/pay?bookingId=';
    const paymentLink = `${PAY_URL_PREFIX}${encodeURIComponent(id)}`;

    // MSG91 Flow configuration
    const FLOW_ID = locals.runtime.env.MSG91_SMS_FLOW_ID_PAYMENT_PENDING || '6919502d00f53247e2477df2';
    const SMS_API_URL = locals.runtime.env.MSG91_FLOW_API_URL || 'https://api.msg91.com/api/v5/flow';
    const AUTH_KEY = locals.runtime.env.MSG91_AUTH_KEY;
    const SENDER_ID = locals.runtime.env.MSG91_SENDER_ID || locals.runtime.env.VILPOWER_SENDER_ID || 'DLHNOS';

    if (!AUTH_KEY || !FLOW_ID) {
      return new Response(JSON.stringify({ success: false, error: 'MSG91 not configured' }), { status: 500 });
    }

    // Build payload with multiple variable keys for compatibility with flow mappings
    const smsPayload = {
      flow_id: FLOW_ID,
      sender: SENDER_ID,
      mobiles: `91${mobile}`,
      // Common variable keys used in flows
      VAR1: name,
      VAR2: id,
      VAR3: amount,
      VAR4: paymentLink,
      // Lowercase variants
      var1: name,
      var2: id,
      var3: amount,
      var4: paymentLink,
      // Semantic keys
      name,
      booking_id: id,
      outstanding: amount,
      link: paymentLink,
      precheckin: PRECHECKIN_URL
    };

    let resp;
    try {
      resp = await fetch(SMS_API_URL, {
        method: 'POST',
        headers: {
          'authkey': AUTH_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(smsPayload)
      });
    } catch (networkErr) {
      return new Response(JSON.stringify({ success: false, error: 'Network error sending SMS', debug: networkErr?.message || String(networkErr) }), { status: 500 });
    }

    let result = {};
    try { result = await resp.json(); } catch { result = { status: resp.status }; }
    const ok = resp.ok || result.type === 'success' || /success/i.test(result.message || '');

    if (!ok) {
      return new Response(JSON.stringify({ success: false, error: result.message || 'MSG91 flow error', debug: result }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, provider: 'msg91', booking_id }));
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Internal error', debug: err?.message || String(err) }), { status: 500 });
  }
}