// src/pages/api/send-otp.js
export async function POST({ locals, request }) {
  // Simplified: use MSG91 OTP endpoint with DLT template ID only.
  const API_URL = locals.runtime.env.MSG91_OTP_API_URL; // expected: https://api.msg91.com/api/v5/otp
  const AUTH_KEY = locals.runtime.env.MSG91_AUTH_KEY;  // MSG91 auth key
  const TEMPLATE_ID = locals.runtime.env.MSG91_TEMPLATE_ID; // DLT template ID for OTP
  const SENDER_ID = locals.runtime.env.VILPOWER_SENDER_ID;

  // KV fallback for local/dev when OTP_STORE binding is missing
  const KV = locals.runtime.env?.OTP_STORE;
  const memoryStore = (() => {
    const k = '__otpStore';
    globalThis[k] = globalThis[k] || new Map();
    return {
      async put(key, value, _opts) { globalThis[k].set(key, value); },
      async get(key) { return globalThis[k].get(key) || null; },
      async delete(key) { globalThis[k].delete(key); }
    };
  })();
  const otpStore = KV || memoryStore;
  
  try {
    const { mobile } = await request.json();
    
    // Validate mobile number
    if (!mobile || !/^[6-9][0-9]{9}$/.test(mobile)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid mobile number' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('📱 Sending OTP to:', mobile);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('🔢 Generated OTP:', otp);
    
    // Store OTP in KV with 5-minute expiry
    const otpKey = `otp:${mobile}`;
    
    try {
      await otpStore.put(otpKey, otp, {
        expirationTtl: 300 // 5 minutes
      });
      console.log('✅ OTP stored in KV');
    } catch (kvError) {
      console.error('❌ KV Storage error:', kvError);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to store OTP. Please try again.',
        debug: 'KV_ERROR'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // =============================
    // Send via MSG91 OTP using DLT template ID
    // =============================
    if (!API_URL || !AUTH_KEY || !TEMPLATE_ID) {
      console.error('❌ Missing configuration for OTP send:', { hasApiUrl: !!API_URL, hasAuth: !!AUTH_KEY, hasTemplate: !!TEMPLATE_ID });
      return new Response(JSON.stringify({ success: false, error: 'OTP provider not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    console.log('📤 Calling MSG91 OTP API...');
    const payload = {
      template_id: TEMPLATE_ID,
      mobile: `91${mobile}`,
      otp: otp,
      sender: SENDER_ID
    };
    console.log('📦 OTP Payload:', JSON.stringify(payload));
    console.log('Using template_id:', (TEMPLATE_ID||'').slice(0,4)+'…'+(TEMPLATE_ID||'').slice(-4));
    console.log('API URL:', API_URL);


    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'authkey': AUTH_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('📡 OTP Status:', resp.status);
    let data = {};
    try {
      data = await resp.json();
    } catch (_jsonErr) {
      const text = await resp.text().catch(() => '');
      data = { raw: text };
    }
    console.log('📨 OTP Response:', JSON.stringify(data));

    const ok = resp.ok || data.type === 'success' || /success/i.test(data.message || '');
    if (ok) {
      console.log('✅ OTP sent via MSG91 to:', mobile);
      return new Response(JSON.stringify({ success: true, message: 'OTP sent successfully', provider: 'msg91' }), { headers: { 'Content-Type': 'application/json' } });
    }

    console.error('❌ OTP send failed:', data);
    return new Response(JSON.stringify({ success: false, error: data.message || 'Failed to send OTP', provider: 'msg91', debug: { status: resp.status, response: data } }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    // =============================
    // Last resort: Test mode
    // =============================
    console.warn('⚠️ No OTP provider configured; returning test mode OTP');
    return new Response(JSON.stringify({ 
      success: true,
      message: 'OTP generated (TEST MODE)',
      provider: 'test',
      testOtp: otp
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('❌ Send OTP error:', err.message);
    console.error('Stack:', err.stack);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to send OTP. Please try again.',
      debug: {
        errorMessage: err.message,
        errorType: err.name
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}