import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, locals }) => {

  const { amount } = await request.json();
  const env = locals?.cloudflare?.env || locals?.runtime?.env || {};

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    console.error("Razorpay keys missing in environment variables. Available keys:", Object.keys(env));
    return new Response(JSON.stringify({ error: "Razorpay keys missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);

  console.log(`Creating order for amount: ${amount}`);

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`
    },
    body: JSON.stringify({
      amount: amount * 100,
      currency: "INR",
      receipt: crypto.randomUUID()
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error("Razorpay order creation failed:", data);
    return new Response(JSON.stringify({ error: data.error?.description || "Order creation failed" }), {
      status: response.status,
      headers: { "Content-Type": "application/json" }
    });
  }

  console.log("Order created successfully:", data.id);

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  });
};