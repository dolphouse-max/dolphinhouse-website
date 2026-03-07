// Scheduled task to auto-expire payment pending bookings
// This should be called by a cron job every 2-3 minutes

export async function POST({ locals, request }) {
  const env = locals?.runtime?.env || {};
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: 'Database unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Call the expiry endpoint
    const expiryResponse = await fetch(`${request.url.replace('/scheduled-expiry', '/booking-expiry')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await expiryResponse.json();

    // Send expiry notifications for expired bookings
    if (result.expiredBookings > 0) {
      console.log(`Expired ${result.expiredBookings} bookings and released ${result.releasedLocks} locks`);
    }

    return new Response(JSON.stringify({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Scheduled expiry failed:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// GET endpoint to check system health
export async function GET({ locals }) {
  const env = locals?.runtime?.env || {};
  const db = env.DB;

  try {
    const now = new Date().toISOString();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Count active locks
    const activeLocks = db ? await db.prepare(`
      SELECT COUNT(*) as count FROM booking_locks WHERE lock_expiry > ?
    `).bind(fiveMinutesAgo).first() : { count: 0 };

    // Count payment pending bookings
    const pendingBookings = db ? await db.prepare(`
      SELECT COUNT(*) as count FROM bookings WHERE status = 'payment_pending'
    `).first() : { count: 0 };

    return new Response(JSON.stringify({
      status: 'healthy',
      timestamp: now,
      activeLocks: activeLocks?.count || 0,
      pendingBookings: pendingBookings?.count || 0,
      databaseAvailable: !!db
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
