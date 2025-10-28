export async function GET({ locals, request }) {
  const db = locals.runtime.env.DB;
  const url = new URL(request.url);

  // Simple auth check: validate admin_session cookie HMAC
  try {
    const cookieHeader = request.headers.get('Cookie') || '';
    const match = /admin_session=([^;]+)/.exec(cookieHeader);
    const raw = match ? decodeURIComponent(match[1]) : '';
    if (!raw) return new Response('Unauthorized', { status: 401 });
    const parts = String(raw).split('.');
    if (parts.length !== 2) return new Response('Unauthorized', { status: 401 });
    const [loginId, sig] = parts;
    if (loginId !== 'owner') return new Response('Unauthorized', { status: 401 });
    const secret = locals?.runtime?.env?.SESSION_SECRET || 'dev-secret';
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expectBuf = await crypto.subtle.sign('HMAC', key, enc.encode(loginId));
    const bytes = new Uint8Array(expectBuf);
    let expect = '';
    for (let i = 0; i < bytes.length; i++) expect += bytes[i].toString(16).padStart(2, '0');
    if (expect !== sig) return new Response('Unauthorized', { status: 401 });
  } catch (e) {
    return new Response('Unauthorized', { status: 401 });
  }

  const q = url.searchParams.get('q') || '';
  const status = url.searchParams.get('status') || '';
  const room = url.searchParams.get('room') || '';
  const start = url.searchParams.get('start') || '';
  const end = url.searchParams.get('end') || '';

  function buildWhere(){
    const clauses = [];
    const values = [];
    if (q) {
      clauses.push('(name LIKE ? OR email LIKE ? OR mobile LIKE ? OR customer_id LIKE ?)');
      const like = `%${q}%`;
      values.push(like, like, like, like);
    }
    if (status) {
      clauses.push('LOWER(status) = LOWER(?)');
      values.push(status);
    }
    if (room) {
      clauses.push('room = ?');
      values.push(room);
    }
    if (start && end) {
      clauses.push('NOT (date(checkout) <= date(?) OR date(checkin) >= date(?))');
      values.push(start, end);
    } else if (start) {
      clauses.push('date(checkout) > date(?)');
      values.push(start);
    } else if (end) {
      clauses.push('date(checkin) < date(?)');
      values.push(end);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return { where, values };
  }

  try {
    if (!db) throw new Error('DB binding unavailable');
    const { where, values } = buildWhere();
    const sql = `SELECT id, customer_id, name, email, mobile, room, checkin, checkout, nights, guests, total, status, createdAt
                 FROM bookings ${where}
                 ORDER BY date(checkin) DESC`;
    const res = await db.prepare(sql).bind(...values).all();
    const rows = res.results || [];

    const headers = ['id','customer_id','name','email','mobile','room','checkin','checkout','nights','guests','total','status','createdAt'];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => esc(r[h])).join(','))).join('\n');
    const fname = `guest-register-${new Date().toISOString().slice(0,10)}.csv`;
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=${fname}`
      }
    });
  } catch (e) {
    console.error('[api/guest-register.csv] error', e);
    return new Response('Error generating CSV', { status: 500 });
  }
}