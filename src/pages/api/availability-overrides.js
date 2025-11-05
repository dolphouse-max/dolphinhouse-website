// Per-day availability and rate overrides API
// Dev-friendly: keeps in-memory cache when DB is not bound

let LOCAL_OVERRIDES = new Map(); // key: `${room}|${date}` -> { available, rateNonAC, rateAC }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'OPTIONS') return json(null);

  try {
    const db = env?.DB;

    if (method === 'GET') {
      const start = url.searchParams.get('start');
      const end = url.searchParams.get('end');
      if (!db) {
        const out = [];
        for (const [key, val] of LOCAL_OVERRIDES.entries()) {
          const [room, date] = key.split('|');
          if (start && end) {
            if (date >= start && date < end) out.push({ room, date, ...val });
          } else {
            out.push({ room, date, ...val });
          }
        }
        return json(out);
      }

      // Ensure table exists
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS availability_overrides (
          room TEXT NOT NULL,
          date TEXT NOT NULL,
          available INTEGER NOT NULL,
          rateNonAC REAL,
          rateAC REAL,
          PRIMARY KEY (room, date)
        )
      `).run();

      const res = start && end
        ? await db.prepare(`SELECT room, date, available, rateNonAC, rateAC FROM availability_overrides WHERE date >= ? AND date < ? ORDER BY date`).bind(start, end).all()
        : await db.prepare(`SELECT room, date, available, rateNonAC, rateAC FROM availability_overrides ORDER BY date`).all();
      return json(res.results || []);
    }

    if (method === 'PUT') {
      const body = await request.json();
      const overrides = Array.isArray(body?.overrides) ? body.overrides : [];

      if (!db) {
        overrides.forEach(o => {
          const key = `${o.room}|${o.date}`;
          LOCAL_OVERRIDES.set(key, {
            available: Number(o.available) || 0,
            rateNonAC: Number(o.rateNonAC) || 0,
            rateAC: Number(o.rateAC) || 0,
          });
        });
        return json({ updated: overrides.length });
      }

      // Ensure table exists
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS availability_overrides (
          room TEXT NOT NULL,
          date TEXT NOT NULL,
          available INTEGER NOT NULL,
          rateNonAC REAL,
          rateAC REAL,
          PRIMARY KEY (room, date)
        )
      `).run();

      for (const o of overrides) {
        await db.prepare(`
          INSERT OR REPLACE INTO availability_overrides (room, date, available, rateNonAC, rateAC)
          VALUES (?, ?, ?, ?, ?)
        `).bind(o.room, o.date, Number(o.available) || 0, Number(o.rateNonAC) || 0, Number(o.rateAC) || 0).run();
      }
      return json({ updated: overrides.length });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('availability-overrides error', err);
    return json({ error: 'Internal server error', details: err.message }, 500);
  }
}

export const GET = onRequest;
export const PUT = onRequest;
export const OPTIONS = onRequest;