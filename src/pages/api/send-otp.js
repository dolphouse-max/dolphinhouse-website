// src/pages/api/send-otp.js
export async function POST({ locals, request }) {
  // Prefer Vilpower when configured; fallback to MSG91; else test mode.
  const VILPOWER_API_URL = locals.runtime.env.VILPOWER_API_URL; // e.g., https://api.vilpower.in/v1/sms/send
  const VILPOWER_API_KEY = locals.runtime.env.VILPOWER_API_KEY; // secret key/token
  const VILPOWER_TEMPLATE_ID_OTP = locals.runtime.env.VILPOWER_TEMPLATE_ID_OTP || '1107176121900123714'; // OTP_DolphinHouse
  const VILPOWER_SENDER_ID = locals.runtime.env.VILPOWER_SENDER_ID || 'DLHNOS';
  const VILPOWER_PEID = locals.runtime.env.VILPOWER_PEID; // Principal Entity ID

  const MSG91_AUTH_KEY = locals.runtime.env.MSG91_AUTH_KEY;
  const MSG91_TEMPLATE_ID = locals.runtime.env.MSG91_TEMPLATE_ID;
  
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
      await locals.runtime.env.OTP_STORE.put(otpKey, otp, {
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
    // Provider: VILPOWER (preferred)
    // =============================
    if (VILPOWER_API_KEY && VILPOWER_TEMPLATE_ID_OTP && VILPOWER_SENDER_ID) {
      if (!VILPOWER_API_URL) {
        console.error('❌ VILPOWER_API_URL missing');
        return new Response(JSON.stringify({
          success: false,
          error: 'Vilpower API URL not configured',
          debug: { missing: ['VILPOWER_API_URL'] }
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const payload = {
          template_id: VILPOWER_TEMPLATE_ID_OTP,
          sender_id: VILPOWER_SENDER_ID,
          peid: VILPOWER_PEID || '',
          to: `91${mobile}`,
          variables: [otp] // {#var#} = OTP
        };

        console.log('📦 Vilpower Payload:', JSON.stringify(payload));

        const vpResponse = await fetch(VILPOWER_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Adjust header as per Vilpower spec: Bearer or API key header
            'Authorization': `Bearer ${VILPOWER_API_KEY}`
          },
          body: JSON.stringify(payload)
        });

        const vpResult = await vpResponse.json().catch(() => ({}));
        console.log('📨 Vilpower Response:', JSON.stringify(vpResult));

        const vpOk = vpResponse.ok || vpResult.success === true || /success/i.test(vpResult.message || '');
        if (vpOk) {
          console.log('✅ OTP sent via Vilpower to:', mobile);
          return new Response(JSON.stringify({ 
            success: true,
            message: 'OTP sent successfully',
            provider: 'vilpower'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        console.error('❌ Vilpower error:', vpResult);
        return new Response(JSON.stringify({
          success: false,
          error: vpResult.message || 'Failed to send OTP via Vilpower',
          provider: 'vilpower',
          debug: vpResult
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (vpErr) {
        console.error('❌ Vilpower request error:', vpErr);
        return new Response(JSON.stringify({
          success: false,
          error: 'Vilpower request failed',
          provider: 'vilpower',
          debug: vpErr?.message || String(vpErr)
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // =============================
    // Fallback: MSG91 (if configured)
    // =============================
    if (MSG91_AUTH_KEY && MSG91_TEMPLATE_ID) {
      console.log('📤 Calling MSG91 API...');
      const msg91Url = `https://control.msg91.com/api/v5/otp`;
      const msg91Payload = {
        template_id: MSG91_TEMPLATE_ID,
        mobile: `91${mobile}`,
        otp: otp
      };
      
      console.log('📦 MSG91 Payload:', JSON.stringify(msg91Payload));

      const msg91Response = await fetch(msg91Url, {
        method: 'POST',
        headers: {
          'authkey': MSG91_AUTH_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(msg91Payload)
      });

      console.log('📡 MSG91 Status:', msg91Response.status);
      const result = await msg91Response.json().catch(() => ({}));
      console.log('📨 MSG91 Response:', JSON.stringify(result));
      
      const isSuccess = msg91Response.ok || 
                       result.type === 'success' || 
                       (result.message && /success/i.test(result.message));
      
      if (isSuccess) {
        console.log('✅ OTP sent via MSG91 to:', mobile);
        return new Response(JSON.stringify({ 
          success: true,
          message: 'OTP sent successfully',
          provider: 'msg91'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        console.error('❌ MSG91 returned error:', result);
        return new Response(JSON.stringify({ 
          success: false,
          error: result.message || 'Failed to send OTP via MSG91',
          provider: 'msg91',
          debug: { msg91Response: result, status: msg91Response.status }
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

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