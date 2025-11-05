// Inventory Management API Endpoint
// Handles CRUD operations for room inventory

export async function onRequest(context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const roomId = url.searchParams.get('room');

    // GET request - retrieve inventory
    if (request.method === 'GET') {
      // Dev fallback when DB is missing
      if (!env.DB) {
        const defaults = [
          { room: 'standard', label: 'Standard Room', qty: 5, rateNonAC: 2000, rateAC: 2500 },
          { room: 'deluxe', label: 'Deluxe Room', qty: 3, rateNonAC: 3000, rateAC: 3500 },
          { room: 'family', label: 'Family Room', qty: 1, rateNonAC: 3500, rateAC: 4000 },
          { room: 'deluxeFamily', label: 'Deluxe Family Room', qty: 1, rateNonAC: 4500, rateAC: 5000 }
        ];
        if (roomId) {
          const one = defaults.find((r) => r.room === roomId);
          if (!one) return new Response(JSON.stringify({ error: 'Room not found' }), { status: 404, headers });
          return new Response(JSON.stringify(one), { headers });
        }
        return new Response(JSON.stringify(defaults), { headers });
      }
      if (roomId) {
        // Get specific room
        const room = await env.DB.prepare(`
          SELECT * FROM inventory WHERE room = ?
        `).bind(roomId).first();

        if (!room) {
          return new Response(
            JSON.stringify({ error: 'Room not found' }),
            { status: 404, headers }
          );
        }

        return new Response(JSON.stringify(room), { headers });
      } else {
        // Get all rooms
        const rooms = await env.DB.prepare(`
          SELECT * FROM inventory ORDER BY label
        `).all();

        return new Response(JSON.stringify(rooms.results), { headers });
      }
    }

    // POST request - create new room
    if (request.method === 'POST') {
      const data = await request.json();
      if (!env.DB) {
        // Dev fallback: accept and echo back
        return new Response(
          JSON.stringify({ success: true, message: 'Room added successfully (dev)' }),
          { headers }
        );
      }
      
      // Validate required fields
      if (!data.room || !data.label || data.qty === undefined) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: room, label, and qty are required' }),
          { status: 400, headers }
        );
      }

      // Check if room already exists
      const existingRoom = await env.DB.prepare(`
        SELECT * FROM inventory WHERE room = ?
      `).bind(data.room).first();

      if (existingRoom) {
        return new Response(
          JSON.stringify({ error: 'Room with this ID already exists' }),
          { status: 409, headers }
        );
      }

      // Insert new room
      await env.DB.prepare(`
        INSERT INTO inventory (room, label, qty, rateNonAC, rateAC)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        data.room,
        data.label,
        data.qty,
        data.rateNonAC || 0,
        data.rateAC || 0
      ).run();

      return new Response(
        JSON.stringify({ success: true, message: 'Room added successfully' }),
        { headers }
      );
    }

    // PUT request - update existing room
    if (request.method === 'PUT') {
      const data = await request.json();
      if (!env.DB) {
        return new Response(
          JSON.stringify({ success: true, message: 'Room updated successfully (dev)' }),
          { headers }
        );
      }
      
      // Validate required fields
      if (!data.room) {
        return new Response(
          JSON.stringify({ error: 'Room ID is required' }),
          { status: 400, headers }
        );
      }

      // Check if room exists
      const existingRoom = await env.DB.prepare(`
        SELECT * FROM inventory WHERE room = ?
      `).bind(data.room).first();

      if (!existingRoom) {
        return new Response(
          JSON.stringify({ error: 'Room not found' }),
          { status: 404, headers }
        );
      }

      // Update room
      await env.DB.prepare(`
        UPDATE inventory
        SET label = ?, qty = ?, rateNonAC = ?, rateAC = ?
        WHERE room = ?
      `).bind(
        data.label || existingRoom.label,
        data.qty !== undefined ? data.qty : existingRoom.qty,
        data.rateNonAC !== undefined ? data.rateNonAC : existingRoom.rateNonAC,
        data.rateAC !== undefined ? data.rateAC : existingRoom.rateAC,
        data.room
      ).run();

      return new Response(
        JSON.stringify({ success: true, message: 'Room updated successfully' }),
        { headers }
      );
    }

    // DELETE request - remove room
    if (request.method === 'DELETE') {
      if (!env.DB) {
        return new Response(
          JSON.stringify({ success: true, message: 'Room deleted successfully (dev)' }),
          { headers }
        );
      }
      if (!roomId) {
        return new Response(
          JSON.stringify({ error: 'Room ID is required' }),
          { status: 400, headers }
        );
      }

      // Check if room exists
      const existingRoom = await env.DB.prepare(`
        SELECT * FROM inventory WHERE room = ?
      `).bind(roomId).first();

      if (!existingRoom) {
        return new Response(
          JSON.stringify({ error: 'Room not found' }),
          { status: 404, headers }
        );
      }

      // Check if room is used in any bookings
      const bookings = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM bookings WHERE room = ?
      `).bind(roomId).first();

      if (bookings.count > 0) {
        return new Response(
          JSON.stringify({ 
            error: 'Cannot delete room that has bookings. Update or delete the associated bookings first.' 
          }),
          { status: 409, headers }
        );
      }

      // Delete room
      await env.DB.prepare(`
        DELETE FROM inventory WHERE room = ?
      `).bind(roomId).run();

      return new Response(
        JSON.stringify({ success: true, message: 'Room deleted successfully' }),
        { headers }
      );
    }

    // If we get here, the method is not supported
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers }
    );

  } catch (error) {
    console.error('Inventory API Error:', error);
    
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Export per-method handlers for environments that require them
export const GET = onRequest;
export const POST = onRequest;
export const PUT = onRequest;
export const DELETE = onRequest;
export const OPTIONS = onRequest;