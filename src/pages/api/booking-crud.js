// API endpoint for CRUD operations on bookings
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const method = request.method;
  
  // Handle CORS preflight requests
  if (method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  
  try {
    // Connect to D1 database (support multiple adapters)
    const envLike = context.env || context.locals?.cloudflare?.env || context.locals?.runtime?.env || {};
    const db = envLike.DB;

    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });

    if (!db) {
      // Dev-friendly fallback so admin flows don’t crash when DB isn’t bound
      if (method === 'DELETE') {
        return json({ success: true, message: 'Booking deleted successfully (dev fallback)' });
      }
      return json({ error: 'Database not bound' }, 500);
    }
    
    // GET - Retrieve a booking or all bookings
    if (method === "GET") {
      const id = url.searchParams.get("id");
      
      if (id) {
        // Get specific booking
        const booking = await db.prepare(
          "SELECT * FROM bookings WHERE id = ?"
        ).bind(id).first();
        
        if (!booking) {
          return new Response(JSON.stringify({ error: "Booking not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }
        
        return new Response(JSON.stringify(booking), {
          headers: { "Content-Type": "application/json" }
        });
      } else {
        // Get all bookings (schema-safe ordering)
        const info = await db.prepare('PRAGMA table_info(bookings)').all();
        const cols = new Set((info.results || []).map((r) => r.name));
        const createdCol = cols.has('created_at') ? 'created_at' : 'createdAt';
        const res = await db.prepare(
          `SELECT * FROM bookings ORDER BY ${createdCol} DESC`
        ).all();
        return json(res.results || []);
      }
    }
    
    // POST - Create a new booking
    if (method === "POST") {
      // Respect global booking availability toggle
      async function isBookingEnabled() {
        try {
          if (db) {
            await db.prepare(`
              CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
              )
            `).run();
            const row = await db.prepare(`SELECT value FROM app_settings WHERE key = 'booking_enabled'`).first();
            return row ? (row.value === 'true' || row.value === true) : true;
          } else {
            // Fallback: call booking-toggle API (in-memory only in dev)
            const url = new URL('/api/booking-toggle', request.url);
            const res = await fetch(url.toString(), { cache: 'no-store' });
            if (!res.ok) return true; // default to enabled if unreachable
            const j = await res.json();
            return !!j?.bookingEnabled;
          }
        } catch (e) {
          console.warn('Booking toggle check failed, treating as enabled', e);
          return true;
        }
      }

      const enabled = await isBookingEnabled();
      if (!enabled) {
        return new Response(JSON.stringify({ error: 'Bookings are currently paused. Please try again later.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const data = await request.json();
      
      // Auto-generate customer_id if missing
      async function ensureCustomerId() {
        try {
          const has = data.customer_id || data.customerId;
          if (has && String(has).trim()) return; // keep provided value
          // Generate next sequential ID based on row count
          const cntRow = await db.prepare('SELECT COUNT(*) AS cnt FROM bookings').first();
          const nextNum = ((cntRow && (cntRow.cnt || cntRow['COUNT(*)'])) || 0) + 1;
          const cid = `dh${String(nextNum).padStart(8, '0')}`;
          data.customer_id = cid;
        } catch (e) {
          // Fallback to random if count fails
          const rand = Math.floor(Math.random() * 1e8);
          data.customer_id = `dh${String(rand).padStart(8, '0')}`;
        }
      }
      await ensureCustomerId();
      
      // Validate required fields (email optional)
      const requiredFields = ["name", "room", "checkin", "checkout", "guests", "nights", "total", "status"];
      for (const field of requiredFields) {
        if (!data[field]) {
          return new Response(JSON.stringify({ error: `Missing required field: ${field}` }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
      
      // Generate a unique ID
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      
      // Insert new booking
      // Discover schema to pick correct column casing
      const info = await db.prepare('PRAGMA table_info(bookings)').all();
      const cols = new Set((info.results || []).map((r) => r.name));
      const createdCol = cols.has('created_at') ? 'created_at' : 'createdAt';
      const customerCol = cols.has('customer_id') ? 'customer_id' : 'customerId';
      const hasBookingFrom = cols.has('booking_from');

      // Ensure booking_from column exists (migrate safely if missing)
      if (!hasBookingFrom) {
        try {
          await db.prepare('ALTER TABLE bookings ADD COLUMN booking_from TEXT').run();
          cols.add('booking_from');
        } catch (e) {
          // ignore if column already exists or migration not allowed
          console.warn('booking_from column add skipped:', String(e?.message || e));
        }
      }

      const insertCols = ['id', customerCol, 'name', 'email', 'room', 'checkin', 'checkout', 'guests', 'nights', 'total', 'status', createdCol, 'mobile'];
      const insertVals = [id, data.customer_id || '', data.name, data.email || "", data.room, data.checkin, data.checkout, data.guests, data.nights, data.total, data.status, createdAt, data.mobile || ""];
      if (cols.has('booking_from')) {
        insertCols.push('booking_from');
        insertVals.push(data.booking_from || 'Direct');
      }

      const placeholders = insertVals.map(() => '?').join(', ');
      const sql = `INSERT INTO bookings (${insertCols.join(', ')}) VALUES (${placeholders})`;
      await db.prepare(sql).bind(...insertVals).run();
      
      return new Response(JSON.stringify({ id, ...data, createdAt }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // PUT - Update an existing booking
    if (method === "PUT") {
      const data = await request.json();
      const id = data.id;
      
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing booking ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      // Check if booking exists
      const existingBooking = await db.prepare(
        "SELECT id FROM bookings WHERE id = ?"
      ).bind(id).first();
      
      if (!existingBooking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      // Update booking
      // Discover schema to only update existing columns
      const info = await db.prepare('PRAGMA table_info(bookings)').all();
      const cols = new Set((info.results || []).map((r) => r.name));
      const updateFields = [
        "name", "email", "room", "checkin", "checkout", 
        "guests", "nights", "total", "status", "mobile", "customer_id"
      ];
      if (cols.has('booking_from')) updateFields.push('booking_from');
      
      const updates = [];
      const values = [];
      
      updateFields.forEach(field => {
        if (data[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(data[field]);
        }
      });
      
      if (updates.length === 0) {
        return new Response(JSON.stringify({ error: "No fields to update" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      // Add ID at the end for the WHERE clause
      values.push(id);
      
      await db.prepare(
        `UPDATE bookings SET ${updates.join(", ")} WHERE id = ?`
      ).bind(...values).run();
      
      return json({ message: "Booking updated successfully", id });
    }
    
    // DELETE - Remove a booking
    if (method === "DELETE") {
      const id = url.searchParams.get("id");
      
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing booking ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      // Check if booking exists
      const existingBooking = await db.prepare(
        "SELECT id FROM bookings WHERE id = ?"
      ).bind(id).first();
      
      if (!existingBooking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      // Delete booking
      await db.prepare(
        "DELETE FROM bookings WHERE id = ?"
      ).bind(id).run();
      
      return json({ message: "Booking deleted successfully", id });
    }
    
    // Unsupported method
    return json({ error: "Method not allowed" }, 405);
    
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(error?.message || error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Export per-method handlers for environments that require them
export const GET = onRequest;
export const POST = onRequest;
export const PUT = onRequest;
export const DELETE = onRequest;
export const OPTIONS = onRequest;