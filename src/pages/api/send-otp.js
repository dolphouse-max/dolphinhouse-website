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

    // Check if credentials exist
    if (!MSG91_AUTH_KEY || !MSG91_TEMPLATE_ID) {
      console.error('❌ Missing MSG91 credentials');
      return new Response(JSON.stringify({ 
        success: false,
        error: 'OTP service not configured. Please contact support.',
        debug: {
          hasAuthKey: !!MSG91_AUTH_KEY,
          hasTemplateId: !!MSG91_TEMPLATE_ID
        }
      }), {
        status: 500,
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

    // Send OTP via MSG91
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
    
    const result = await msg91Response.json();
    console.log('📨 MSG91 Response:', JSON.stringify(result));
    
    // Check various success conditions
    const isSuccess = msg91Response.ok || 
                     result.type === 'success' || 
                     result.message?.includes('success');
    
    if (isSuccess) {
      console.log('✅ OTP sent successfully to:', mobile);
      return new Response(JSON.stringify({ 
        success: true,
        message: 'OTP sent successfully',
        debug: {
          otp: otp, // TEMPORARY: Remove this in production!
          msg91Status: result.type || result.message
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      console.error('❌ MSG91 returned error:', result);
      return new Response(JSON.stringify({ 
        success: false,
        error: result.message || 'Failed to send OTP',
        debug: {
          msg91Response: result,
          status: msg91Response.status
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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