export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  try {
    const config = await env.DB.get("config", "json");
    if (!config || !config.stripePublishableKey) {
       throw new Error("Stripe no está configurado.");
    }
    
    // El secreto debe estar en env.STRIPE_SECRET_KEY configurado en Cloudflare Pages
    if (!env.STRIPE_SECRET_KEY) {
       throw new Error("Falta STRIPE_SECRET_KEY en las variables de entorno.");
    }

    const body = await request.json();
    const amount = (config.upsellPrice || 19) * 100; // En centavos
    const currency = (config.currency || "usd").toLowerCase();

    const stripeData = new URLSearchParams();
    stripeData.append('amount', amount.toString());
    stripeData.append('currency', currency);
    stripeData.append('automatic_payment_methods[enabled]', 'true');

    const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: stripeData.toString()
    });

    const stripeResult = await stripeRes.json();

    if (!stripeRes.ok) {
       throw new Error(stripeResult.error?.message || "Error al comunicarse con Stripe.");
    }

    return new Response(JSON.stringify({
      clientSecret: stripeResult.client_secret,
      paymentIntentId: stripeResult.id
    }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers });
  }
}
