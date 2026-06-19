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
       throw new Error("PayPal no está configurado. Faltan las credenciales en el panel de administrador.");
    }

    const body = await request.json();
    
    let amount = Number(config.price) || 0;
    
    if (body.orderBump && config.orderBumpEnabled) {
      amount += (Number(config.orderBumpPrice) || 0);
    }
    
    const currency = (config.currency || "usd").toUpperCase();

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
      const errorText = await tokenRes.text();
      throw new Error("Error autenticando con PayPal. Verifica que el Client ID y Secret sean correctos.");
    }
    
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Crear la Orden en PayPal
    const orderRes = await fetch("https://api-m.paypal.com/v2/checkout/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: currency,
            value: amount.toFixed(2)
          },
          description: config.productName || "Producto Digital"
        }]
      })
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      throw new Error(orderData.message || "Error al crear la orden en PayPal.");
    }

    return new Response(JSON.stringify({ id: orderData.id }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers });
  }
}
