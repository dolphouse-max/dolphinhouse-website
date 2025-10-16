// src/pages/api/send-otp.js - TEST VERSION
export async function POST({ locals, request }) {
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

    console.log('📱 TEST MODE: Generating OTP for:', mobile);

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
        error: 'Failed to store OTP. KV binding missing?',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // TEMPORARY: Return success with OTP visible (for testing)
    console.log('✅ TEST MODE: OTP generated and stored');
    return new Response(JSON.stringify({ 
      success: true,
      message: 'OTP sent successfully (TEST MODE)',
      testMode: true,
      testOtp: otp  // VISIBLE FOR TESTING ONLY!
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('❌ Send OTP error:', err.message);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to send OTP. Please try again.',
      debug: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}