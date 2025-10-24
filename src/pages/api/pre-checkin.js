// src/pages/api/pre-checkin.js
import { promises as fs } from 'node:fs';
import path from 'node:path';

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

async function saveFileToR2(bucket, key, file) {
  const arrayBuffer = await file.arrayBuffer();
  const contentType = file.type || 'application/octet-stream';
  await bucket.put(key, arrayBuffer, { httpMetadata: { contentType } });
  // Serve via proxy route to avoid needing a public R2 domain
  return `/api/uploads/${key}`;
}

async function saveFileToFS(baseDir, bookingId, file, suffix) {
  const arrayBuffer = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeSuffix}-${Date.now()}`;
  const ext = (file.name && path.extname(file.name)) || '';
  const fullName = filename + ext;
  const filePath = path.join(baseDir, bookingId, fullName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buf);
  return `/uploads/precheckin/${bookingId}/${fullName}`;
}

export async function POST({ locals, request }) {
  const db = locals.runtime.env.DB;
  const r2Bucket = locals.runtime.env.ID_BUCKET; // Configure this binding in wrangler

  try {
    const formData = await request.formData();

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

    // Ensure table exists
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
        created_at TEXT
      )
    `).run();

    await ensureColumns(db);

    let idFrontUrl = null;
    let idBackUrl = null;
    let idImageUrl = null;

    // Save helper chooses R2 if available, else filesystem
    const baseDir = path.join(process.cwd(), 'public', 'uploads', 'precheckin');
    const saver = async (file, suffix) => {
      if (!file) return null;
      const key = `precheckin/${bookingId}/${suffix}-${Date.now()}${(file.name && path.extname(file.name)) || ''}`;
      if (r2Bucket) {
        return await saveFileToR2(r2Bucket, key, file);
      }
      return await saveFileToFS(baseDir, bookingId, file, suffix);
    };

    if (idType === 'Aadhaar') {
      idFrontUrl = await saver(formData.get('idFront'), 'aadhaar-front');
      idBackUrl = await saver(formData.get('idBack'), 'aadhaar-back');
    } else if (idType) {
      idImageUrl = await saver(formData.get('idImage'), 'id-image');
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

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

    return new Response(JSON.stringify({ success: true, id, idFrontUrl, idBackUrl, idImageUrl }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Pre-checkin POST error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}