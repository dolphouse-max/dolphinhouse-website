// src/pages/api/verify-otp.js
export async function POST({ locals, request }) {
  try {
    const { mobile, otp } = await request.json();
    
    if (!mobile || !otp) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Mobile and OTP are required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('🔍 Verifying OTP for:', mobile);

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

    // Get stored OTP
    const otpKey = `otp:${mobile}`;
    const storedOtp = await otpStore.get(otpKey);
    
    if (!storedOtp) {
      console.log('❌ OTP not found or expired');
      return new Response(JSON.stringify({ 
        success: false,
        error: 'OTP expired or not found. Please request a new OTP.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('📝 Stored OTP:', storedOtp, 'Provided OTP:', otp);

    // Verify OTP
    if (storedOtp === otp) {
      // Delete used OTP
      await otpStore.delete(otpKey);
      
      // Mark mobile as verified (store for 30 minutes)
      const verifiedKey = `verified:${mobile}`;
      await otpStore.put(verifiedKey, 'true', {
        expirationTtl: 1800 // 30 minutes
      });
      
      console.log('✅ OTP verified successfully for:', mobile);
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Mobile verified successfully' 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      console.log('❌ Invalid OTP provided');
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Invalid OTP. Please try again.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (err) {
    console.error('❌ Verify OTP error:', err);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to verify OTP. Please try again.' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}