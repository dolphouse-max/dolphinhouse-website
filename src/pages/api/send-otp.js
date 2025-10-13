// src/pages/api/send-otp.js
export async function POST({ locals, request }) {
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
    await locals.runtime.env.OTP_STORE.put(otpKey, otp, {
      expirationTtl: 300 // 5 minutes
    });
    console.log('✅ OTP stored in KV');

    // Send OTP via MSG91
    const msg91Url = `https://control.msg91.com/api/v5/otp`;
    const msg91Response = await fetch(msg91Url, {
      method: 'POST',
      headers: {
        'authkey': MSG91_AUTH_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        template_id: MSG91_TEMPLATE_ID,
        mobile: `91${mobile}`, // Add country code
        otp: otp
      })
    });

    const result = await msg91Response.json();
    console.log('MSG91 Response:', result);
    
    if (msg91Response.ok && result.type === 'success') {
      console.log('✅ OTP sent successfully to:', mobile);
      return new Response(JSON.stringify({ 
        success: true,
        message: 'OTP sent successfully'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      console.error('❌ MSG91 error:', result);
      throw new Error(result.message || 'Failed to send OTP');
    }

  } catch (err) {
    console.error('❌ Send OTP error:', err);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to send OTP. Please try again.',
      details: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}