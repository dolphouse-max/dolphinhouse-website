function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST({ request, locals }) {
  try {
    const env = locals.runtime?.env || locals.cloudflare?.env || {};
    const body = await request.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const groupName = String(body.groupName || "").trim();
    const groupSize = Number(body.groupSize || 0);
    const roomsNeeded = Number(body.roomsNeeded || 0);
    const packageType = String(body.packageType || "").trim();
    const checkin = String(body.checkin || "").trim();
    const checkout = String(body.checkout || "").trim();
    const message = String(body.message || "").trim();

    if (!name || !phone || !groupSize || !packageType || !message) {
      return json({ success: false, error: "Missing required fields." }, 400);
    }

    if (!/^[6-9][0-9]{9}$/.test(phone)) {
      return json({ success: false, error: "Enter a valid 10-digit mobile number." }, 400);
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: "Enter a valid email address." }, 400);
    }

    if (checkin && checkout && new Date(checkin) >= new Date(checkout)) {
      return json({ success: false, error: "Check-out must be after check-in." }, 400);
    }

    const db = env.DB;
    let inquiryId = crypto.randomUUID();

    if (db) {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS group_inquiries (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT NOT NULL,
          group_name TEXT,
          group_size INTEGER NOT NULL,
          rooms_needed INTEGER,
          package_type TEXT NOT NULL,
          checkin TEXT,
          checkout TEXT,
          message TEXT NOT NULL
        )
      `).run();

      await db.prepare(`
        INSERT INTO group_inquiries (
          id, created_at, name, email, phone, group_name, group_size,
          rooms_needed, package_type, checkin, checkout, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        inquiryId,
        new Date().toISOString(),
        name,
        email || null,
        phone,
        groupName || null,
        groupSize,
        roomsNeeded || null,
        packageType,
        checkin || null,
        checkout || null,
        message
      ).run();
    }

    const msg91AuthKey = env.MSG91_AUTH_KEY;
    if (!msg91AuthKey) {
      return json({
        success: false,
        error: "Inquiry saved, but email delivery is not configured. Please add MSG91_AUTH_KEY."
      }, 500);
    }

    const recipient = env.GROUP_INQUIRY_EMAIL || env.EMAIL_FROM || "contact@dolphinhouse-alibaug.com";
    const subject = `New Group Booking Inquiry - ${packageType}`;
    const htmlbody = `
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#1f2937;">
        <div style="background:linear-gradient(135deg,#0369a1,#0f766e);padding:24px 28px;color:#fff;border-radius:16px 16px 0 0;">
          <h1 style="margin:0;font-size:28px;">New Group Booking Inquiry</h1>
          <p style="margin:10px 0 0;opacity:.9;">Lead captured from the Group & Corporate Bookings page</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:28px;background:#fff;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;font-weight:700;width:180px;">Inquiry ID</td><td style="padding:8px 0;">${escapeHtml(inquiryId)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Contact Name</td><td style="padding:8px 0;">${escapeHtml(name)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Mobile</td><td style="padding:8px 0;">${escapeHtml(phone)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Email</td><td style="padding:8px 0;">${escapeHtml(email || "-")}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Group / Company</td><td style="padding:8px 0;">${escapeHtml(groupName || "-")}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Group Size</td><td style="padding:8px 0;">${escapeHtml(groupSize)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Rooms Needed</td><td style="padding:8px 0;">${escapeHtml(roomsNeeded || "-")}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Package Type</td><td style="padding:8px 0;">${escapeHtml(packageType)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Check-in</td><td style="padding:8px 0;">${escapeHtml(checkin || "-")}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Check-out</td><td style="padding:8px 0;">${escapeHtml(checkout || "-")}</td></tr>
          </table>
          <div style="margin-top:20px;padding:18px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
            <h2 style="margin:0 0 10px;font-size:18px;">Message</h2>
            <p style="margin:0;white-space:pre-wrap;line-height:1.7;">${escapeHtml(message)}</p>
          </div>
        </div>
      </div>
    `;

    const emailPayload = {
      to: [{ email: recipient, name: "Dolphin House" }],
      from: {
        email: env.MSG91_EMAIL_FROM || "no-reply@mail.dolphinhouse-alibaug.com",
        name: env.MSG91_EMAIL_FROM_NAME || "Dolphin House"
      },
      subject,
      htmlbody,
      domain: env.MSG91_EMAIL_DOMAIN || "mail.dolphinhouse-alibaug.com",
      reply_to: email ? [{ email, name }] : undefined
    };

    const response = await fetch(env.MSG91_EMAIL_API_URL || "https://api.msg91.com/api/v5/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authkey": msg91AuthKey
      },
      body: JSON.stringify(emailPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return json({ success: false, error: `Email delivery failed: ${errorText}` }, 500);
    }

    return json({ success: true, inquiryId });
  } catch (error) {
    return json({ success: false, error: error?.message || "Internal error" }, 500);
  }
}
