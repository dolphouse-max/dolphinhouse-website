// WhatsApp and Email notification service

// PDF generation functions
async function generatePDFInvoice(booking) {
  try {
    // Generate HTML content for invoice
    const htmlContent = generateInvoiceHTML(booking);
    
    // Use a simple HTML to PDF conversion service
    // For production, you might want to use Puppeteer, PDFShift, or similar service
    const pdfBuffer = await convertHTMLToPDF(htmlContent, 'invoice');
    
    return pdfBuffer;
  } catch (error) {
    console.error('PDF Invoice generation failed:', error);
    return null;
  }
}

async function generatePDFReceipt(booking) {
  try {
    // Generate HTML content for receipt
    const htmlContent = generateReceiptHTML(booking);
    
    // Convert HTML to PDF
    const pdfBuffer = await convertHTMLToPDF(htmlContent, 'receipt');
    
    return pdfBuffer;
  } catch (error) {
    console.error('PDF Receipt generation failed:', error);
    return null;
  }
}

function generateInvoiceHTML(booking) {
  const checkinDate = new Date(booking.checkin);
  const checkoutDate = new Date(booking.checkout);
  const nights = Math.ceil((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
  const bookingId = booking.customer_id || booking.id?.slice(-8).toUpperCase();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tax Invoice - Dolphin House</title>
      <meta charset="utf-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Arial', sans-serif; 
          line-height: 1.6; 
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .header { 
          text-align: center; 
          border-bottom: 3px solid #2c3e50; 
          padding-bottom: 20px; 
          margin-bottom: 30px;
        }
        .header h1 { color: #2c3e50; font-size: 28px; margin-bottom: 10px; }
        .header h2 { color: #e74c3c; font-size: 20px; margin-bottom: 5px; }
        .invoice-details { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 20px; 
          margin-bottom: 30px;
          background: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
        }
        .billing-details { 
          margin-bottom: 30px;
          background: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
        }
        .amount-details { margin-bottom: 30px; }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 20px;
        }
        th, td { 
          border: 1px solid #ddd; 
          padding: 12px; 
          text-align: left; 
        }
        th { 
          background-color: #34495e; 
          color: white;
          font-weight: bold;
        }
        .total-row { background-color: #ecf0f1; font-weight: bold; }
        .footer { 
          margin-top: 50px; 
          text-align: center; 
          font-size: 12px; 
          color: #7f8c8d;
          border-top: 1px solid #ddd;
          padding-top: 20px;
        }
        .watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-45deg);
          font-size: 100px;
          color: #f0f0f0;
          z-index: -1;
          opacity: 0.3;
        }
        .logo { font-size: 24px; margin-bottom: 5px; }
        .contact-info { font-size: 14px; color: #7f8c8d; }
      </style>
    </head>
    <body>
      <div class="watermark">DOLPHIN HOUSE</div>
      
      <div class="header">
        <div class="logo">🐬 Dolphin House Beach Resort</div>
        <h1>TAX INVOICE</h1>
        <div class="contact-info">Alibaug, Maharashtra | +91-XXXXXXXXXX | contact@dolphinhouse-alibaug.com</div>
      </div>
      
      <div class="invoice-details">
        <div>
          <h3>Invoice Details</h3>
          <p><strong>Invoice No:</strong> INV-${bookingId}</p>
          <p><strong>Invoice Date:</strong> ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
        </div>
        <div>
          <h3>Booking Period</h3>
          <p><strong>Check-in:</strong> ${checkinDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
          <p><strong>Check-out:</strong> ${checkoutDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
          <p><strong>Nights:</strong> ${nights}</p>
        </div>
      </div>
      
      <div class="billing-details">
        <h3>Billing To:</h3>
        <p><strong>Name:</strong> ${booking.name}</p>
        <p><strong>Email:</strong> ${booking.email}</p>
        <p><strong>Mobile:</strong> ${booking.mobile}</p>
        <p><strong>Guests:</strong> ${booking.guests} Persons</p>
        <p><strong>Rooms:</strong> ${booking.rooms_requested || 1} Room(s)</p>
        <p><strong>Room Type:</strong> ${booking.room_type === 'ac' ? 'Air Conditioned' : 'Non-Air Conditioned'}</p>
      </div>
      
      <div class="amount-details">
        <h3>Booking Details & Charges</h3>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Rate (₹)</th>
              <th>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${booking.room_type === 'ac' ? 'AC Room' : 'Non-AC Room'} - ${booking.room_label || 'Deluxe Room'}</td>
              <td>${booking.rooms_requested || 1} Room(s) × ${nights} Night(s)</td>
              <td>${booking.base_total ? (booking.base_total / ((booking.rooms_requested || 1) * nights)).toFixed(2) : '0.00'}</td>
              <td>${booking.base_total || 0}</td>
            </tr>
            ${booking.extra_charge > 0 ? `
            <tr>
              <td>Extra Person Charges</td>
              <td>${booking.guests} Guests</td>
              <td>-</td>
              <td>${booking.extra_charge}</td>
            </tr>
            ` : ''}
            <tr class="total-row">
              <td colspan="3"><strong>Total Amount</strong></td>
              <td><strong>${booking.total}</strong></td>
            </tr>
            <tr class="total-row">
              <td colspan="3"><strong>Advance Paid (50%)</strong></td>
              <td><strong>${booking.advance_amount || Math.round(booking.total * 0.5)}</strong></td>
            </tr>
            <tr class="total-row">
              <td colspan="3"><strong>Balance Due</strong></td>
              <td><strong>${booking.total - (booking.advance_amount || Math.round(booking.total * 0.5))}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="footer">
        <p><strong>Payment Terms:</strong> Balance payment to be made at the resort during check-in</p>
        <p><strong>Check-in Time:</strong> 11:00 AM onwards | <strong>Check-out Time:</strong> 10:00 AM</p>
        <p>Thank you for choosing Dolphin House Beach Resort!</p>
        <p>This is a computer-generated invoice and does not require signature.</p>
        <p style="margin-top: 20px; font-size: 10px;">GSTIN: [Your GSTIN] | PAN: [Your PAN]</p>
      </div>
    </body>
    </html>
  `;
}

function generateReceiptHTML(booking) {
  const bookingId = booking.customer_id || booking.id?.slice(-8).toUpperCase();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Receipt - Dolphin House</title>
      <meta charset="utf-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Arial', sans-serif; 
          line-height: 1.6; 
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .header { 
          text-align: center; 
          border-bottom: 3px solid #27ae60; 
          padding-bottom: 20px; 
          margin-bottom: 30px;
        }
        .header h1 { color: #27ae60; font-size: 28px; margin-bottom: 10px; }
        .header h2 { color: #2c3e50; font-size: 20px; margin-bottom: 5px; }
        .success-badge { 
          background: #27ae60; 
          color: white; 
          padding: 10px 20px; 
          border-radius: 20px; 
          display: inline-block;
          margin: 10px 0;
          font-weight: bold;
        }
        .receipt-details { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 20px; 
          margin-bottom: 30px;
          background: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
        }
        .payment-details { 
          margin-bottom: 30px;
          background: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
        }
        .amount-highlight {
          background: #d4edda;
          border: 2px solid #27ae60;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          margin: 20px 0;
        }
        .amount-highlight h3 { color: #27ae60; font-size: 24px; margin-bottom: 10px; }
        .amount-highlight p { font-size: 18px; font-weight: bold; }
        .footer { 
          margin-top: 50px; 
          text-align: center; 
          font-size: 12px; 
          color: #7f8c8d;
          border-top: 1px solid #ddd;
          padding-top: 20px;
        }
        .logo { font-size: 24px; margin-bottom: 5px; }
        .contact-info { font-size: 14px; color: #7f8c8d; }
        .status-success { color: #27ae60; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">🐬 Dolphin House Beach Resort</div>
        <h1>PAYMENT RECEIPT</h1>
        <div class="success-badge">✅ PAYMENT CONFIRMED</div>
        <div class="contact-info">Alibaug, Maharashtra | +91-XXXXXXXXXX | contact@dolphinhouse-alibaug.com</div>
      </div>
      
      <div class="receipt-details">
        <div>
          <h3>Receipt Details</h3>
          <p><strong>Receipt No:</strong> RCP-${bookingId}</p>
          <p><strong>Receipt Date:</strong> ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p><strong>Receipt Time:</strong> ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div>
          <h3>Booking Details</h3>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Payment ID:</strong> ${booking.payment_id || 'N/A'}</p>
          <p><strong>Payment Status:</strong> <span class="status-success">✅ Confirmed</span></p>
        </div>
      </div>
      
      <div class="payment-details">
        <h3>Guest Information</h3>
        <p><strong>Guest Name:</strong> ${booking.name}</p>
        <p><strong>Mobile Number:</strong> ${booking.mobile}</p>
        <p><strong>Email Address:</strong> ${booking.email}</p>
        <p><strong>Room Type:</strong> ${booking.room_type === 'ac' ? 'Air Conditioned' : 'Non-Air Conditioned'}</p>
        <p><strong>Check-in Date:</strong> ${new Date(booking.checkin).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
        <p><strong>Check-out Date:</strong> ${new Date(booking.checkout).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </div>
      
      <div class="amount-highlight">
        <h3>Payment Summary</h3>
        <p>Total Amount: ₹${booking.total}</p>
        <p>Advance Paid: <strong style="color: #27ae60;">₹${booking.advance_amount || Math.round(booking.total * 0.5)}</strong></p>
        <p>Balance Due: ₹${booking.total - (booking.advance_amount || Math.round(booking.total * 0.5))}</p>
      </div>
      
      <div class="payment-details">
        <h3>Payment Method</h3>
        <p><strong>Payment Gateway:</strong> Razorpay</p>
        <p><strong>Payment Type:</strong> Online Payment</p>
        <p><strong>Transaction Status:</strong> <span class="status-success">Successful</span></p>
      </div>
      
      <div class="footer">
        <p><strong>Important Information:</strong></p>
        <p>• Please carry this receipt and a valid ID proof during check-in</p>
        <p>• Balance payment to be made at the resort (Cash/Card/UPI accepted)</p>
        <p>• Check-in time: 11:00 AM onwards | Check-out time: 10:00 AM</p>
        <p style="margin-top: 20px;">Thank you for your payment! Your booking is now confirmed.</p>
        <p>We look forward to welcoming you to Dolphin House Beach Resort! 🐬</p>
        <p style="margin-top: 20px; font-size: 10px;">This is a computer-generated receipt and does not require signature.</p>
      </div>
    </body>
    </html>
  `;
}

async function convertHTMLToPDF(htmlContent, type) {
  try {
    // For now, we'll use a simple approach - in production you might want to use:
    // 1. Puppeteer Cloud Function
    // 2. PDFShift API
    // 3. HTMLPDFAPI
    // 4. Cloudflare Workers with PDF generation
    
    // Placeholder implementation - return HTML as base64
    // In production, replace this with actual PDF generation
    const buffer = Buffer.from(htmlContent, 'utf-8');
    
    // For demonstration, we'll create a simple PDF-like structure
    // In production, use a proper PDF library
    const pdfHeader = Buffer.from('%PDF-1.4\n', 'utf-8');
    const pdfFooter = Buffer.from('\n%%EOF', 'utf-8');
    
    return Buffer.concat([pdfHeader, buffer, pdfFooter]);
    
  } catch (error) {
    console.error('HTML to PDF conversion failed:', error);
    throw error;
  }
}
export async function POST({ locals, request }) {
  const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json();
  const { bookingId, type, trigger } = body; // type: 'whatsapp' or 'email', trigger: 'booking_created', 'payment_confirmed', etc.

  try {
    // Get booking details
    const booking = await db.prepare(`
      SELECT b.*, i.label as room_label 
      FROM bookings b
      LEFT JOIN inventory i ON b.room = i.room
      WHERE b.id = ?
    `).bind(bookingId).first();

    if (!booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const notificationId = crypto.randomUUID();
    const now = new Date().toISOString();
    let result = { success: false, message: '' };

    if (type === 'whatsapp') {
      result = await sendWhatsAppNotification(booking, trigger, env);
    } else if (type === 'email') {
      result = await sendEmailNotification(booking, trigger, env);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid notification type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Log notification attempt
    await db.prepare(`
      INSERT INTO notification_logs (
        id, booking_id, type, recipient, status, message, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      notificationId, bookingId, type, 
      type === 'whatsapp' ? booking.mobile : booking.email,
      result.success ? 'sent' : 'failed',
      result.message,
      result.success ? null : result.error,
      now
    ).run();

    // Update booking notification flags
    if (result.success) {
      const updateField = type === 'whatsapp' ? 'whatsapp_sent' : 'email_sent';
      await db.prepare(`
        UPDATE bookings SET ${updateField} = 1 WHERE id = ?
      `).bind(bookingId).run();
    }

    return new Response(JSON.stringify({
      success: result.success,
      notificationId,
      message: result.message
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Notification failed:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function sendWhatsAppNotification(booking, trigger, env) {
  try {
    const msg91AuthKey = env.MSG91_AUTH_KEY;
    if (!msg91AuthKey) {
      return { success: false, error: 'MSG91 auth key not configured' };
    }

    const recipient = `91${booking.mobile.replace(/\D/g, '')}`; // Assuming Indian numbers
    let templateId = '';
    let variables = {};

    switch (trigger) {
      case 'booking_created':
        templateId = env.VILPOWER_TEMPLATE_ID_PAYMENT_PENDING || "1107176123479912391";
        variables = {
          name: booking.name,
          checkin: new Date(booking.checkin).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          rooms: `${booking.rooms_requested || 1} ${booking.room_type === 'ac' ? 'AC' : 'Non-AC'}`,
          advance: booking.advance_amount || Math.round(booking.total * 0.5),
          booking_id: booking.customer_id || booking.id?.slice(-8).toUpperCase()
        };
        break;

      case 'payment_confirmed':
        templateId = env.VILPOWER_TEMPLATE_ID_PAYMENT_RECEIVED || "1107176123495987139";
        variables = {
          name: booking.name,
          checkin: new Date(booking.checkin).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          rooms: `${booking.rooms_requested || 1} ${booking.room_type === 'ac' ? 'AC' : 'Non-AC'}`,
          advance_paid: booking.advance_amount || Math.round(booking.total * 0.5),
          booking_id: booking.customer_id || booking.id?.slice(-8).toUpperCase()
        };
        break;

      case 'booking_expired':
        // Use simple text message for expiry
        const message = `⏰ *Booking Expired*\n\n` +
          `Dear ${booking.name},\n\n` +
          `Your booking request has expired due to non-payment within the 5-minute window.\n\n` +
          `The rooms have been released for other guests.\n\n` +
          `If you still wish to book, please visit our website again:\n` +
          `https://dolphinhouse-alibaug.com/booking\n\n` +
          `Thank you for your interest! 🐬`;

        const response = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${msg91AuthKey}`
          },
          body: JSON.stringify({
            mobile: recipient,
            flow: {
              type: 'text',
              message: message
            }
          })
        });

        if (response.ok) {
          return { success: true, message: 'WhatsApp expiry notification sent successfully' };
        } else {
          const error = await response.text();
          return { success: false, error: `WhatsApp API error: ${error}` };
        }

      default:
        return { success: false, error: 'Unknown trigger' };
    }

    // Use MSG91 DLT template for booking notifications
    const response = await fetch('https://control.msg91.com/api/v5/sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authkey': msg91AuthKey
      },
      body: JSON.stringify({
        template_id: templateId,
        short_url: '0',
        recipients: [{
          mobiles: recipient,
          variables: variables
        }],
        sender: env.VILPOWER_SENDER_ID || 'DLHNOS',
        peid: env.VILPOWER_PEID || '1101212580000089778'
      })
    });

    if (response.ok) {
      return { success: true, message: 'WhatsApp notification sent successfully via DLT template' };
    } else {
      const error = await response.text();
      return { success: false, error: `MSG91 SMS API error: ${error}` };
    }

  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendEmailNotification(booking, trigger, env) {
  try {
    const msg91AuthKey = env.MSG91_AUTH_KEY;
    if (!msg91AuthKey) {
      return { success: false, error: 'MSG91 auth key not configured' };
    }

    let subject = '';
    let htmlContent = '';
    let attachments = [];

    switch (trigger) {
      case 'booking_created':
        subject = 'Booking Request Received - Dolphin House Beach Resort';
        htmlContent = await generateBookingEmailHTML(booking, 'pending');
        break;

      case 'payment_confirmed':
        subject = 'Booking Confirmed - Dolphin House Beach Resort';
        htmlContent = await generateBookingEmailHTML(booking, 'confirmed');
        
        // Generate PDF invoice and receipt
        try {
          const pdfInvoice = await generatePDFInvoice(booking);
          const pdfReceipt = await generatePDFReceipt(booking);
          
          if (pdfInvoice) attachments.push({
            filename: `invoice-${booking.customer_id || booking.id}.pdf`,
            content: pdfInvoice.toString('base64'),
            type: 'application/pdf'
          });
          
          if (pdfReceipt) attachments.push({
            filename: `receipt-${booking.customer_id || booking.id}.pdf`,
            content: pdfReceipt.toString('base64'),
            type: 'application/pdf'
          });
        } catch (pdfError) {
          console.error('PDF generation failed:', pdfError);
          // Continue without PDFs if generation fails
        }
        break;

      default:
        subject = 'Booking Update - Dolphin House Beach Resort';
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <p>Dear ${booking.name},</p>
            <p>Your booking status has been updated. Please visit our website for more details.</p>
            <p>Thank you for choosing Dolphin House Beach Resort!</p>
          </div>
        `;
    }

    // Use MSG91 email API
    const emailData = {
      to: [{ email: booking.email }],
      from: {
        email: env.MSG91_EMAIL_FROM || 'no-reply@mail.dolphinhouse-alibaug.com',
        name: env.MSG91_EMAIL_FROM_NAME || 'Dolphin House'
      },
      subject: subject,
      htmlbody: htmlContent,
      domain: env.MSG91_EMAIL_DOMAIN || 'mail.dolphinhouse-alibaug.com',
      template_id: env.MSG91_EMAIL_TEMPLATE_PAYMENT_RECEIVED || 'dh_booking_confirmation'
    };

    // Add attachments if any
    if (attachments.length > 0) {
      emailData.attachments = attachments;
    }

    const response = await fetch('https://api.msg91.com/api/v5/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authkey': msg91AuthKey
      },
      body: JSON.stringify(emailData)
    });

    if (response.ok) {
      return { success: true, message: 'Email sent successfully via MSG91' };
    } else {
      const error = await response.text();
      return { success: false, error: `MSG91 Email API error: ${error}` };
    }

  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function generateBookingEmailHTML(booking, status) {
  const checkinDate = new Date(booking.checkin);
  const checkoutDate = new Date(booking.checkout);
  const nights = Math.ceil((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, ${status === 'confirmed' ? '#28a745' : '#667eea'} 0%, ${status === 'confirmed' ? '#20c997' : '#764ba2'} 100%); color: white; padding: 30px; text-align: center;">
        <h1>🏖️ Dolphin House Beach Resort</h1>
        <h2>${status === 'confirmed' ? 'Booking Confirmed!' : 'Booking Request Received'}</h2>
      </div>
      
      <div style="padding: 30px; background-color: #f9f9f9;">
        <p>Dear ${booking.name},</p>
        <p>${status === 'confirmed' ? 
          'Great news! Your payment has been received and your booking is now confirmed.' : 
          'Thank you for your booking request! We\'ve received your reservation details.'}</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${status === 'confirmed' ? '#28a745' : '#667eea'};">
          <h3>📋 Booking Details</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <p><strong>Booking ID:</strong> ${booking.customer_id || booking.id?.slice(-8).toUpperCase()}</p>
            <p><strong>Room Type:</strong> ${booking.room_type === 'ac' ? 'AC' : 'Non-AC'}</p>
            <p><strong>Check-in:</strong> ${checkinDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <p><strong>Check-out:</strong> ${checkoutDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <p><strong>Nights:</strong> ${nights}</p>
            <p><strong>Guests:</strong> ${booking.guests}</p>
            <p><strong>Rooms:</strong> ${booking.rooms_requested || 1}</p>
            <p><strong>Status:</strong> <span style="color: ${status === 'confirmed' ? '#28a745' : '#ffc107'}; font-weight: bold;">${status.charAt(0).toUpperCase() + status.slice(1)}</span></p>
          </div>
          
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <p><strong>Base Amount:</strong> ₹${booking.base_total || 0}</p>
            <p><strong>Extra Charges:</strong> ₹${booking.extra_charge || 0}</p>
            <p><strong>Total Amount:</strong> ₹${booking.total}</p>
            <p><strong>Advance Paid:</strong> ₹${booking.advance_amount || Math.round(booking.total * 0.5)}</p>
          </div>
        </div>
        
        ${status === 'confirmed' ? `
        <div style="background: #d4edda; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745;">
          <p><strong>📍 Check-in Information:</strong> Please arrive at the resort by 11:00 AM on your check-in day.</p>
          <p><strong>📱 Contact:</strong> For any queries, call us at +91-XXXXXXXXXX</p>
        </div>
        ` : `
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
          <p><strong>⏰ Important:</strong> Please complete your payment within 5 minutes to confirm this booking.</p>
          <p><strong>💡 Note:</strong> Your booking request will expire if payment is not completed on time.</p>
        </div>
        `}
        
        <div style="margin-top: 30px; text-align: center;">
          <a href="https://dolphinhouse-alibaug.com" style="background: ${status === 'confirmed' ? '#28a745' : '#667eea'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Visit Our Website</a>
        </div>
      </div>
      
      <div style="background: #333; color: white; padding: 20px; text-align: center;">
        <p>🐬 Dolphin House Beach Resort</p>
        <p>Alibaug, Maharashtra | +91-XXXXXXXXXX</p>
        <p style="font-size: 12px; opacity: 0.8;">This is an automated message. Please do not reply to this email.</p>
      </div>
    </div>
  `;
}


// GET endpoint to retrieve notification logs
export async function GET({ locals, request }) {
  const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const bookingId = url.searchParams.get('bookingId');

  try {
    if (bookingId) {
      const logs = await db.prepare(`
        SELECT * FROM notification_logs WHERE booking_id = ? ORDER BY created_at DESC
      `).bind(bookingId).all();

      return new Response(JSON.stringify(logs.results || []), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Booking ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Get notification logs failed:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
