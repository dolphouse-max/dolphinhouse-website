import type { APIRoute } from "astro";

function hmacSHA256(key: string, message: string) {
  const enc = new TextEncoder();

  return crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  ).then(keyObj =>
    crypto.subtle.sign("HMAC", keyObj, enc.encode(message))
  ).then(signature =>
    Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export const POST: APIRoute = async ({ request, locals }) => {

  const body = await request.json();
  const env = (locals as any)?.cloudflare?.env || (locals as any)?.runtime?.env || {};

  if (!env.RAZORPAY_KEY_SECRET) {
    console.error("RAZORPAY_KEY_SECRET missing in environment variables. Available keys:", Object.keys(env));
    return new Response(JSON.stringify({ success: false, error: "Payment verification configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const generatedSignature = await hmacSHA256(
    env.RAZORPAY_KEY_SECRET,
    body.razorpay_order_id + "|" + body.razorpay_payment_id
  );

  if (generatedSignature !== body.razorpay_signature) {
    console.error("Razorpay signature verification failed");
    return new Response(JSON.stringify({ success: false, error: "Invalid payment signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const db = env.DB;

  const bookingId = body.bookingData.bookingId; // Get existing bookingId
  const now = new Date().toISOString();

  if (bookingId) {
    // Update existing pending booking to confirmed
    await db.prepare(`
      UPDATE bookings 
      SET status = 'confirmed', 
          payment_id = ?
      WHERE id = ?
    `).bind(
      body.razorpay_payment_id,
      bookingId
    ).run();

    // Release the lock now that payment is confirmed
    await db.prepare(`
      DELETE FROM booking_locks WHERE booking_id = ?
    `).bind(bookingId).run();
  } else {
    // Fallback: create new booking if bookingId missing (should not happen with new flow)
    const newBookingId = crypto.randomUUID();
    const customerId = `dh${String(Math.floor(10000000 + Math.random() * 90000000))}`;
    
    await db.prepare(`
      INSERT INTO bookings 
      (id, customer_id, name, email, mobile, room, checkin, checkout, guests, nights, total, rooms_requested, room_type, base_total, extra_charge, advance_amount, status, payment_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newBookingId,
      customerId,
      body.bookingData.name,
      body.bookingData.email,
      body.bookingData.mobile,
      body.bookingData.room,
      body.bookingData.checkin,
      body.bookingData.checkout,
      body.bookingData.guests,
      body.bookingData.nights,
      body.bookingData.grandTotal,
      body.bookingData.roomsRequested,
      body.bookingData.type,
      body.bookingData.baseTotal,
      body.bookingData.extraCharge,
      body.bookingData.advance,
      "confirmed",
      body.razorpay_payment_id,
      now
    ).run();
  }

  const finalBookingId = bookingId || null; // Return the ID used
  
  // Send notifications
  try {
    // Get the created/updated booking details for notifications
    const createdBooking = await db.prepare(`
      SELECT b.*, i.label as room_label 
      FROM bookings b
      LEFT JOIN inventory i ON b.room = i.room
      WHERE b.id = ?
    `).bind(finalBookingId).first();
    
    if (createdBooking) {
      // Send WhatsApp notification via MSG91
      await fetch(`${new URL(request.url).origin}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: finalBookingId,
          type: 'whatsapp',
          trigger: 'payment_confirmed'
        })
      });
      
      // Send Email notification via MSG91
      await fetch(`${new URL(request.url).origin}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: finalBookingId,
          type: 'email',
          trigger: 'payment_confirmed'
        })
      });
    }
  } catch (err) {
    console.error('Failed to send notifications:', err);
    // Don't fail the payment if notifications fail
  }

  return new Response(JSON.stringify({
    success: true,
    bookingId: finalBookingId
  }), {
    headers: { "Content-Type": "application/json" }
  });
};