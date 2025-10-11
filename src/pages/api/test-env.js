// src/pages/api/test-env.js
export async function GET({ locals }) {
  const key = locals.runtime.env.OPENAI_API_KEY;
  
  return new Response(JSON.stringify({
    hasKey: !!key,
    keyPrefix: key ? key.substring(0, 8) + '...' : 'NOT FOUND',
    envKeys: Object.keys(locals.runtime.env)
  }), {
    headers: { "Content-Type": "application/json" }
  });
}