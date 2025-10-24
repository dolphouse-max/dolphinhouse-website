// src/pages/api/notify-payment.js
// Sends Payment Received or Payment Pending messages using Vilpower templates
export async function POST({ locals, request }) {
  try {
    const { booking_id, type } = await request.json(); // type: 'received' | 'pending'
    if (!booking_id || !type) {
      return new Response(JSON.stringify({ success: false, error: 'booking_id and type are required' }), { status: 400 });
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

    // Approved template IDs from user
    const TEMPLATE_RECEIVED = locals.runtime.env.VILPOWER_TEMPLATE_ID_PAYMENT_RECEIVED || '1107176123495987139';
    const TEMPLATE_PENDING  = locals.runtime.env.VILPOWER_TEMPLATE_ID_PAYMENT_PENDING  || '1107176123479912391';

    let template_id = '';
    let variables = [];

    if (type === 'received') {
      // DH_PAYMENT_RECEIVED_TXN: {#var#} = Name, Amount, Booking ID, Link
      template_id = TEMPLATE_RECEIVED;
      variables = [name, amount, id, PRECHECKIN_URL];
    } else if (type === 'pending') {
      // DH_PAYMENT_PENDING_REMINDER: {#var#} = Name, Booking ID, Outstanding, Payment Link
      template_id = TEMPLATE_PENDING;
      const outstanding = amount || '';
      variables = [name, id, outstanding, paymentLink];
    } else {
      return new Response(JSON.stringify({ success: false, error: 'Unsupported type' }), { status: 400 });
    }

    // Send directly via Vilpower
    const VILPOWER_API_URL = locals.runtime.env.VILPOWER_API_URL;
    const VILPOWER_API_KEY = locals.runtime.env.VILPOWER_API_KEY;
    const VILPOWER_SENDER_ID = locals.runtime.env.VILPOWER_SENDER_ID || 'DLHNOS';
    const VILPOWER_PEID = locals.runtime.env.VILPOWER_PEID || '';

    if (!VILPOWER_API_URL || !VILPOWER_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'Vilpower not configured' }), { status: 500 });
    }

    const payload = {
      template_id,
      sender_id: VILPOWER_SENDER_ID,
      peid: VILPOWER_PEID,
      to: `91${mobile}`,
      variables
    };

    const vpResponse = await fetch(VILPOWER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VILPOWER_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const vpResult = await vpResponse.json().catch(() => ({}));
    const ok = vpResponse.ok || vpResult.success === true || /success/i.test(vpResult.message || '');

    if (!ok) {
      return new Response(JSON.stringify({ success: false, error: vpResult.message || 'Vilpower error', debug: vpResult }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, type, booking_id }));
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Internal error', debug: err?.message || String(err) }), { status: 500 });
  }
}