// Temporary script to generate password hash for dolphin123
async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// Generate hash for default password
const secret = 'dev-secret'; // This is the fallback secret used in development
const password = 'dolphin123';

hmacHex(secret, password).then(hash => {
  console.log('Password hash for "dolphin123":', hash);
});