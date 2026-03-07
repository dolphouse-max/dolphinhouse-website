// API endpoint for managing booking locks
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
  const { room, checkin, checkout, guests, roomsRequested, roomType, customerName, customerMobile, customerEmail, 
    // New pricing fields
    total, baseTotal, extraCharge, advanceAmount, nights 
  } = body;

  const lockId = crypto.randomUUID();
  const bookingId = crypto.randomUUID();
  const customerId = `dh${String(Math.floor(10000000 + Math.random() * 90000000))}`;
  const now = new Date().toISOString();
  const lockExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now

  try {
    // Create booking_locks table if it doesn't exist
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS booking_locks (
        id TEXT PRIMARY KEY,
        booking_id TEXT,
        room TEXT NOT NULL,
        checkin TEXT NOT NULL,
        checkout TEXT NOT NULL,
        guests INTEGER NOT NULL,
        rooms_requested INTEGER NOT NULL,
        room_type TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_mobile TEXT NOT NULL,
        customer_email TEXT,
        lock_expiry TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(room, checkin, checkout, room_type)
      )
    `).run();
    
    // Ensure booking_id column exists if table was created by an older version
    const info = await db.prepare("PRAGMA table_info(booking_locks)").all();
    const columnExists = info.results.some(col => col.name === 'booking_id');
    if (!columnExists) {
      try {
        await db.prepare("ALTER TABLE booking_locks ADD COLUMN booking_id TEXT").run();
      } catch (e) {
        console.warn("Failed to add booking_id column (it may already exist):", e.message);
      }
    }

    // NEW: Also ensure the 'bookings' table has the necessary columns
    const bookingsInfo = await db.prepare("PRAGMA table_info(bookings)").all();
    const bCols = new Set(bookingsInfo.results.map(c => c.name));
    
    const needed = [
      ['rooms_requested', 'INTEGER DEFAULT 1'],
      ['room_type', 'TEXT DEFAULT \'ac\''],
      ['base_total', 'REAL DEFAULT 0'],
      ['extra_charge', 'REAL DEFAULT 0'],
      ['advance_amount', 'REAL DEFAULT 0'],
      ['payment_id', 'TEXT'],
      ['lock_id', 'TEXT'],
      ['whatsapp_sent', 'INTEGER DEFAULT 0'],
      ['email_sent', 'INTEGER DEFAULT 0']
    ];

    for (const [col, def] of needed) {
      if (!bCols.has(col)) {
        try {
          await db.prepare(`ALTER TABLE bookings ADD COLUMN ${col} ${def}`).run();
        } catch (e) {
          console.warn(`Failed to add column ${col} to bookings:`, e.message);
        }
      }
    }
    
    // Create indexes for performance
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_booking_locks_expiry ON booking_locks(lock_expiry)
    `).run();
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_booking_locks_room_dates ON booking_locks(room, checkin, checkout)
    `).run();
    
    // Clean up expired locks AND their associated pending bookings
    const expiredLocks = await db.prepare(`
      SELECT booking_id FROM booking_locks WHERE lock_expiry < ?
    `).bind(now).all();
    
    if (expiredLocks.results && expiredLocks.results.length > 0) {
      const expiredBookingIds = expiredLocks.results.map(l => l.booking_id).filter(id => !!id);
      if (expiredBookingIds.length > 0) {
        // Only delete bookings that are still 'pending' or 'payment_pending'
        const placeholders = expiredBookingIds.map(() => '?').join(',');
        await db.prepare(`
          DELETE FROM bookings 
          WHERE id IN (${placeholders}) 
          AND status IN ('pending', 'payment_pending')
        `).bind(...expiredBookingIds).run();
      }
    }
    
    await db.prepare(`
      DELETE FROM booking_locks WHERE lock_expiry < ?
    `).bind(now).run();

    // Check if there's an existing lock for the same room and dates
    const existingLock = await db.prepare(`
      SELECT id FROM booking_locks 
      WHERE room = ? AND checkin = ? AND checkout = ? AND room_type = ? AND lock_expiry > ?
    `).bind(room, checkin, checkout, roomType, now).first();

    if (existingLock) {
      return new Response(JSON.stringify({ 
        error: 'Room is temporarily locked by another user. Please try again in a few minutes.' 
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check actual availability considering existing confirmed OR pending bookings
    const existingBookings = await db.prepare(`
      SELECT COUNT(*) as count FROM bookings 
      WHERE room = ? AND status IN ('confirmed', 'checked_in', 'payment_pending', 'pending')
      AND checkin < ? AND checkout > ?
    `).bind(room, checkout, checkin).first();

    const inventory = await db.prepare(`
      SELECT qty FROM inventory WHERE room = ?
    `).bind(room).first();

    if (!inventory) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const availableRooms = inventory.qty - (existingBookings?.count || 0);
    
    if (availableRooms < roomsRequested) {
      return new Response(JSON.stringify({ 
        error: 'Not enough rooms available for selected dates' 
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create the booking record with status 'pending'
    await db.prepare(`
      INSERT INTO bookings 
      (id, customer_id, name, email, mobile, room, checkin, checkout, guests, nights, total, rooms_requested, room_type, base_total, extra_charge, advance_amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      bookingId, customerId, customerName, customerEmail || '', customerMobile,
      room, checkin, checkout, guests, nights || 1, total || 0, roomsRequested, roomType,
      baseTotal || 0, extraCharge || 0, advanceAmount || 0, "pending", now
    ).run();

    // Create the lock associated with the bookingId
    await db.prepare(`
      INSERT INTO booking_locks (
        id, booking_id, room, checkin, checkout, guests, rooms_requested, room_type,
        customer_name, customer_mobile, customer_email, lock_expiry, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      lockId, bookingId, room, checkin, checkout, guests, roomsRequested, roomType,
      customerName, customerMobile, customerEmail, lockExpiry, now
    ).run();

    return new Response(JSON.stringify({
      success: true,
      lockId,
      bookingId,
      lockExpiry
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Create booking lock failed:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function DELETE({ locals, request }) {
  const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const lockId = url.searchParams.get('lockId');

  if (!lockId) {
    return new Response(JSON.stringify({ error: 'Lock ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Get the booking_id associated with this lock before deleting it
    const lock = await db.prepare(`
      SELECT booking_id FROM booking_locks WHERE id = ?
    `).bind(lockId).first();
    
    if (lock && lock.booking_id) {
      // Delete the associated booking if it's still 'pending' or 'payment_pending'
      await db.prepare(`
        DELETE FROM bookings 
        WHERE id = ? AND status IN ('pending', 'payment_pending')
      `).bind(lock.booking_id).run();
    }
    
    const result = await db.prepare(`
      DELETE FROM booking_locks WHERE id = ?
    `).bind(lockId).run();

    return new Response(JSON.stringify({
      success: true,
      deleted: result.changes
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Delete booking lock failed:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function GET({ locals, request }) {
  const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const lockId = url.searchParams.get('lockId');

  try {
    // Create table if it doesn't exist (to avoid errors)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS booking_locks (
        id TEXT PRIMARY KEY,
        room TEXT NOT NULL,
        checkin TEXT NOT NULL,
        checkout TEXT NOT NULL,
        guests INTEGER NOT NULL,
        rooms_requested INTEGER NOT NULL,
        room_type TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_mobile TEXT NOT NULL,
        customer_email TEXT,
        lock_expiry TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(room, checkin, checkout, room_type)
      )
    `).run();
    
    // Clean up expired locks first
    const now = new Date().toISOString();
    await db.prepare(`
      DELETE FROM booking_locks WHERE lock_expiry < ?
    `).bind(now).run();

    if (lockId) {
      const lock = await db.prepare(`
        SELECT * FROM booking_locks WHERE id = ?
      `).bind(lockId).first();

      return new Response(JSON.stringify(lock || null), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return all active locks
    const locks = await db.prepare(`
      SELECT * FROM booking_locks WHERE lock_expiry > ? ORDER BY created_at DESC
    `).bind(now).all();

    return new Response(JSON.stringify(locks.results || []), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Get booking locks failed:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
