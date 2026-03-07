// API endpoint for auto-expiring payment pending bookings
export async function POST({ locals, request }) {
  const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const now = new Date().toISOString();
  const expiryTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago

  try {
    // Create tables if they don't exist
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
    
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        type TEXT NOT NULL,
        recipient TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      )
    `).run();
    
    // Find expired payment_pending bookings
    const expiredBookings = await db.prepare(`
      SELECT * FROM bookings 
      WHERE status = 'payment_pending' AND created_at < ?
    `).bind(expiryTime).all();

    let expiredCount = 0;
    let releasedLocks = 0;

    for (const booking of expiredBookings.results || []) {
      // Update booking status to expired
      await db.prepare(`
        UPDATE bookings SET status = 'expired' WHERE id = ?
      `).bind(booking.id).run();

      // Release associated lock if exists
      if (booking.lock_id) {
        const lockResult = await db.prepare(`
          DELETE FROM booking_locks WHERE id = ?
        `).bind(booking.lock_id).run();
        releasedLocks += lockResult.changes;
      }

      expiredCount++;
    }

    // Also clean up any orphaned locks
    const orphanedLocks = await db.prepare(`
      DELETE FROM booking_locks WHERE lock_expiry < ?
    `).bind(now).run();

    return new Response(JSON.stringify({
      success: true,
      expiredBookings: expiredCount,
      releasedLocks: releasedLocks,
      cleanedOrphanedLocks: orphanedLocks.changes
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Auto-expiry failed:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// GET endpoint to check expiry status
export async function GET({ locals, request }) {
  const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const bookingId = url.searchParams.get('bookingId');

  try {
    if (bookingId) {
      const booking = await db.prepare(`
        SELECT *, CASE 
          WHEN status = 'payment_pending' AND created_at < datetime('now', '-5 minutes') THEN 'expired'
          ELSE status 
        END as current_status
        FROM bookings WHERE id = ?
      `).bind(bookingId).first();

      return new Response(JSON.stringify(booking), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return count of payment_pending bookings near expiry
    const nearExpiry = await db.prepare(`
      SELECT COUNT(*) as count FROM bookings 
      WHERE status = 'payment_pending' AND created_at < datetime('now', '-4 minutes')
    `).first();

    return new Response(JSON.stringify({
      nearExpiryCount: nearExpiry?.count || 0
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Check expiry failed:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
