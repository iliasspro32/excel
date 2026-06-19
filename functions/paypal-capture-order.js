export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  try {
    const DB = env.SITE_CONFIG_KV || env.DB;
    const config = await DB.get("config", "json") || {};
    
    if (!config.paypalClientId || !config.paypalClientSecret) {
       throw new Error("PayPal no está configurado. Faltan las credenciales.");
    }

    const body = await request.json();
    const orderId = body.orderId;
    
    if (!orderId) {
       throw new Error("Falta el ID de la orden de PayPal.");
    }

    // 1. Obtener Token de Acceso de PayPal
    const auth = btoa(`${config.paypalClientId}:${config.paypalClientSecret}`);
    const tokenRes = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });
    
    if (!tokenRes.ok) {
      throw new Error("Error autenticando con PayPal al capturar la orden.");
    }
    
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Capturar la Orden en PayPal
    const captureRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    const captureData = await captureRes.json();
    
    if (!captureRes.ok) {
      throw new Error(captureData.message || "Error al capturar el pago en PayPal.");
    }

    const status = captureData.status; // Debería ser "COMPLETED"

    return new Response(JSON.stringify({ status }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers });
  }
}
