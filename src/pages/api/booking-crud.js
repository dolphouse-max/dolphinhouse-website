// API endpoint for CRUD operations on bookings
export async function onRequest(context) {
  const { request, env } = context;
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
    // Connect to D1 database
    const db = env.DB;
    
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
        // Get all bookings
        const bookings = await db.prepare(
          "SELECT * FROM bookings ORDER BY createdAt DESC"
        ).all();
        
        return new Response(JSON.stringify(bookings.results), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    
    // POST - Create a new booking
    if (method === "POST") {
      const data = await request.json();
      
      // Validate required fields
      const requiredFields = ["name", "email", "room", "checkin", "checkout", "guests", "nights", "total", "status"];
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
      await db.prepare(
        "INSERT INTO bookings (id, name, email, room, checkin, checkout, guests, nights, total, status, createdAt, mobile, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        id,
        data.name,
        data.email,
        data.room,
        data.checkin,
        data.checkout,
        data.guests,
        data.nights,
        data.total,
        data.status,
        createdAt,
        data.mobile || "",
        data.customer_id || ""
      ).run();
      
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
      const updateFields = [
        "name", "email", "room", "checkin", "checkout", 
        "guests", "nights", "total", "status", "mobile", "customer_id"
      ];
      
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
      
      return new Response(JSON.stringify({ message: "Booking updated successfully", id }), {
        headers: { "Content-Type": "application/json" }
      });
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
      
      return new Response(JSON.stringify({ message: "Booking deleted successfully", id }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Unsupported method
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}