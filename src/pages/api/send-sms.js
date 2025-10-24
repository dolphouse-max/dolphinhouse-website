// src/pages/api/send-sms.js
// Generic Vilpower SMS sender for approved DLT templates
export async function POST({ locals, request }) {
  try {
    const {
      mobile,            // 10-digit string
      template_id,       // DLT Template ID (e.g., 1107176123495987139)
      variables = []     // Array of values matching {#var#} count
    } = await request.json();

    // Validate inputs
    if (!mobile || !/^[6-9][0-9]{9}$/.test(mobile)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid mobile number' }), { status: 400 });
    }
    if (!template_id) {
      return new Response(JSON.stringify({ success: false, error: 'template_id is required' }), { status: 400 });
    }

    const VILPOWER_API_URL = locals.runtime.env.VILPOWER_API_URL;
    const VILPOWER_API_KEY = locals.runtime.env.VILPOWER_API_KEY;
    const VILPOWER_SENDER_ID = locals.runtime.env.VILPOWER_SENDER_ID || 'DLHNOS';
    const VILPOWER_PEID = locals.runtime.env.VILPOWER_PEID || '';

    if (!VILPOWER_API_URL || !VILPOWER_API_KEY) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Vilpower not configured',
        debug: { hasUrl: !!VILPOWER_API_URL, hasKey: !!VILPOWER_API_KEY }
      }), { status: 500 });
    }

    const payload = {
      template_id,
      sender_id: VILPOWER_SENDER_ID,
      peid: VILPOWER_PEID,
      to: `91${mobile}`,
      variables
    };

    const vpResponse = await fetch(VILPOWER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VILPOWER_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const vpResult = await vpResponse.json().catch(() => ({}));
    const ok = vpResponse.ok || vpResult.success === true || /success/i.test(vpResult.message || '');

    if (!ok) {
      return new Response(JSON.stringify({ success: false, error: vpResult.message || 'Vilpower error', debug: vpResult }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, provider: 'vilpower' }));
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Internal error', debug: err?.message || String(err) }), { status: 500 });
  }
}