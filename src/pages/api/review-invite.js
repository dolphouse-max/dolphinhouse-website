// src/pages/api/review-invite.js
// Sends a manual "Write Review" SMS using Vilpower template for a booking
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
    const id = booking.id;

    // Template and optional review link
    const TEMPLATE_REVIEW = locals.runtime.env.VILPOWER_TEMPLATE_ID_REVIEW || '1107176129217558125';
    const REVIEW_URL = locals.runtime.env.REVIEW_URL || '';

    // Variables order must match the approved Vilpower template fields.
    // Assumption: [Name, Booking ID, Review Link?]
    // If REVIEW_URL is not set, we send only [Name, Booking ID].
    const variables = REVIEW_URL ? [name, id, REVIEW_URL] : [name, id];

    // Vilpower config
    const VILPOWER_API_URL = locals.runtime.env.VILPOWER_API_URL;
    const VILPOWER_API_KEY = locals.runtime.env.VILPOWER_API_KEY;
    const VILPOWER_SENDER_ID = locals.runtime.env.VILPOWER_SENDER_ID || 'DLHNOS';
    const VILPOWER_PEID = locals.runtime.env.VILPOWER_PEID || '';

    if (!VILPOWER_API_URL || !VILPOWER_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'Vilpower not configured' }), { status: 500 });
    }

    const payload = {
      template_id: TEMPLATE_REVIEW,
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

    return new Response(JSON.stringify({ success: true, booking_id }));
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Internal error', debug: err?.message || String(err) }), { status: 500 });
  }
}