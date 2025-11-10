// src/pages/api/pre-checkin.js

// REMOVED: Incompatible imports for Node.js modules 'node:fs' and 'node:path'

/**
 * Ensures the precheckin table has all necessary columns for the latest version.
 * @param {D1Database} db 
 */
async function ensureColumns(db) {
  const info = await db.prepare('PRAGMA table_info(precheckin)').all();
  const cols = info.results?.map((r) => r.name) || [];
  const needed = [
    { name: 'car_reg_number', type: 'TEXT' },
    { name: 'id_type', type: 'TEXT' },
    { name: 'id_number', type: 'TEXT' },
    { name: 'id_front_url', type: 'TEXT' },
    { name: 'id_back_url', type: 'TEXT' },
    { name: 'id_image_url', type: 'TEXT' },
  ];
  for (const col of needed) {
    if (!cols.includes(col.name)) {
      await db.prepare(`ALTER TABLE precheckin ADD COLUMN ${col.name} ${col.type}`).run();
    }
  }
}

/**
 * Saves a file to the configured R2 bucket.
 * This function is now the ONLY file saving method.
 * @param {R2Bucket} bucket 
 * @param {string} key 
 * @param {File} file 
 * @returns {Promise<string>} The public URL (proxy route) for the file.
 */
async function saveFileToR2(bucket, key, file) {
  const arrayBuffer = await file.arrayBuffer();
  // Attempt to use the file's Content-Type, default to octet-stream
  const contentType = file.type || 'application/octet-stream';
  await bucket.put(key, arrayBuffer, { httpMetadata: { contentType } });
  // Serve via proxy route /api/uploads/ to avoid needing a public R2 domain
  return `/api/uploads/${key}`;
}

export async function POST({ locals, request }) {
  const db = locals.runtime.env.DB;
  const r2Bucket = locals.runtime.env.ID_BUCKET; 
  
  // CRITICAL CHECK: R2 bucket must be bound for this file saving logic to work
  if (!r2Bucket) {
    return new Response(JSON.stringify({ error: 'R2 bucket binding (ID_BUCKET) is missing. Cannot save files.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const formData = await request.formData();

    // --- Data Extraction (Unchanged) ---
    const bookingId = (formData.get('bookingId') || '').toString().trim();
    const guestName = (formData.get('guestName') || '').toString().trim();
    const phoneE164 = (formData.get('phone') || '').toString().trim();
    const email = (formData.get('email') || '').toString().trim();
    const checkinDate = (formData.get('checkinDate') || '').toString();
    const checkoutDate = (formData.get('checkoutDate') || '').toString();
    const adults = Number(formData.get('adults') || 0);
    const children = Number(formData.get('children') || 0);
    const arrivalTime = (formData.get('arrivalTime') || '').toString();
    const specialRequests = (formData.get('specialRequests') || '').toString();
    const whatsappOptIn = !!formData.get('whatsappOptIn');

    const carRegNumber = (formData.get('carRegNumber') || '').toString().trim();
    const idType = (formData.get('idType') || '').toString();
    const idNumber = (formData.get('idNumber') || '').toString();

    const required = ['bookingId', 'guestName', 'checkinDate', 'checkoutDate'];
    for (const key of required) {
      if (!formData.get(key)) {
        return new Response(JSON.stringify({ error: `Missing field: ${key}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    if (!adults || !phoneE164) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }
    // --- End Data Extraction ---

    // Ensure table exists (Unchanged)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS precheckin (
        id TEXT PRIMARY KEY,
        booking_id TEXT,
        guest_name TEXT,
        phone_e164 TEXT,
        email TEXT,
        checkin_date TEXT,
        checkout_date TEXT,
        adults INTEGER,
        children INTEGER,
        arrival_time TEXT,
        id_type TEXT,
        id_number TEXT,
        special_requests TEXT,
        whatsapp_opt_in INTEGER,
        created_at TEXT,
        car_reg_number TEXT,
        id_front_url TEXT,
        id_back_url TEXT,
        id_image_url TEXT
      )
    `).run();

    await ensureColumns(db);

    let idFrontUrl = null;
    let idBackUrl = null;
    let idImageUrl = null;

    // --- File Saving Logic (CRITICAL CHANGE) ---
    const saver = async (file, suffix) => {
      if (!(file instanceof File) || file.size === 0) return null;

      // Extract extension without using node:path
      const fileName = file.name || '';
      const ext = fileName.lastIndexOf('.') > 0 ? fileName.substring(fileName.lastIndexOf('.')) : '';
      
      // Construct the R2 key (path)
      const key = `precheckin/${bookingId}/${suffix}-${Date.now()}${ext}`;
      
      return await saveFileToR2(r2Bucket, key, file);
    };

    if (idType === 'Aadhaar') {
      idFrontUrl = await saver(formData.get('idFront'), 'aadhaar-front');
      idBackUrl = await saver(formData.get('idBack'), 'aadhaar-back');
    } else if (idType) {
      idImageUrl = await saver(formData.get('idImage'), 'id-image');
    }
    // --- End File Saving Logic ---

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // --- DB Insertion (Slightly cleaner due to column additions) ---
    await db.prepare(`
      INSERT INTO precheckin (
        id, booking_id, guest_name, phone_e164, email,
        checkin_date, checkout_date, adults, children, arrival_time,
        id_type, id_number, special_requests, whatsapp_opt_in, created_at,
        car_reg_number, id_front_url, id_back_url, id_image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      bookingId,
      guestName,
      phoneE164,
      email || null,
      checkinDate,
      checkoutDate,
      adults,
      children,
      arrivalTime || null,
      idType || null,
      idNumber || null,
      specialRequests || null,
      whatsappOptIn ? 1 : 0,
      now,
      carRegNumber || null,
      idFrontUrl,
      idBackUrl,
      idImageUrl
    ).run();

    // --- Sync core guest details back to bookings table ---
    try {
      const info = await db.prepare('PRAGMA table_info(bookings)').all();
      const cols = new Set((info.results || []).map((r) => r.name));
      const customerIdCol = cols.has('customer_id') ? 'customer_id' : (cols.has('customerId') ? 'customerId' : null);

      // Try match by bookings.id (UUID) first, then by customer_id (DH-YYYYMMDD-XXXX)
      let bookingRow = await db.prepare('SELECT id FROM bookings WHERE id = ?').bind(bookingId).first();
      if (!bookingRow && customerIdCol) {
        bookingRow = await db.prepare(`SELECT id FROM bookings WHERE ${customerIdCol} = ?`).bind(bookingId).first();
      }

      if (bookingRow) {
        // Build dynamic update only for provided non-empty fields
        const updates = [];
        const values = [];
        if (guestName) { updates.push('name = ?'); values.push(guestName); }
        if (email) { updates.push('email = ?'); values.push(email); }
        if (phoneE164) { updates.push('mobile = ?'); values.push(phoneE164); }

        if (updates.length > 0) {
          values.push(bookingRow.id);
          await db.prepare(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
        }
      }
    } catch (syncErr) {
      // Non-fatal: log but do not fail the pre-checkin flow
      console.warn('Pre-checkin: failed to sync guest details to bookings:', syncErr?.message || syncErr);
    }

    // The successful completion of this logic allows any subsequent email logic to run.
    return new Response(JSON.stringify({ success: true, id, idFrontUrl, idBackUrl, idImageUrl }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Pre-checkin POST error:', err);
    // Return a 500 error that includes the actual error message
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}