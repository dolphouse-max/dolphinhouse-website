// src/pages/api/submit-payment-proof.js
export async function POST({ request, locals }) {
  try {
    const formData = await request.formData();
    const bookingId = formData.get('booking_id');
    const paymentProofMethod = formData.get('payment_proof_method');

    // Validate
    if (!bookingId || !paymentProofMethod) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const db = locals.runtime.env.DB;
    
    // Get booking
    const booking = await db.prepare(`
      SELECT * FROM bookings WHERE id = ?
    `).bind(bookingId).first();

    if (!booking) {
      return new Response(JSON.stringify({ 
        error: 'Booking not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let paymentScreenshotUrl = null;
    let upiTransactionId = null;
    let upiFrom = null;

    // Handle different methods
    if (paymentProofMethod === 'upload') {
      const file = formData.get('payment_screenshot');
      
      if (!file) {
        return new Response(JSON.stringify({ 
          error: 'Screenshot required' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // For now, just log (you can add R2 upload later)
      console.log('File uploaded:', file.name, file.size);
      paymentScreenshotUrl = `temp-url/${file.name}`;

    } else if (paymentProofMethod === 'upi') {
      upiTransactionId = formData.get('upi_transaction_id');
      upiFrom = formData.get('upi_from');

      if (!upiTransactionId || !upiFrom) {
        return new Response(JSON.stringify({ 
          error: 'UPI details required' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Update booking
    await db.prepare(`
      UPDATE bookings 
      SET 
        payment_proof_method = ?,
        payment_screenshot_url = ?,
        upi_transaction_id = ?,
        upi_from = ?,
        payment_proof_submitted_at = ?,
        status = 'payment_submitted',
        updated_at = ?
      WHERE id = ?
    `).bind(
      paymentProofMethod,
      paymentScreenshotUrl,
      upiTransactionId,
      upiFrom,
      new Date().toISOString(),
      new Date().toISOString(),
      bookingId
    ).run();

    console.log('Payment proof submitted:', {
      bookingId,
      method: paymentProofMethod,
      customer: booking.name
    });

    // Fire-and-forget: send Payment Received confirmation via Vilpower
    try {
      const origin = new URL(request.url).origin;
      await fetch(`${origin}/api/notify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, type: 'received' })
      });
    } catch (notifyErr) {
      console.warn('notify-payment failed:', notifyErr?.message || notifyErr);
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Payment proof submitted successfully',
      booking_id: bookingId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Payment proof error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}