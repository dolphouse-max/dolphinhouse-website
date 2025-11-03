// src/pages/api/diag.js
export async function GET({ locals }) {
  try {
    const env = locals?.cloudflare?.env || locals?.runtime?.env || {};
    const envKeys = Object.keys(env || {});
    const hasDB = !!env.DB;
    const diag = { envKeys, hasDB };

    if (hasDB) {
      try {
        const res = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
        diag.tables = (res.results || []).map((r) => r.name);
      } catch (e) {
        diag.dbError = e.message || String(e);
      }
    }

    return new Response(JSON.stringify(diag), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}