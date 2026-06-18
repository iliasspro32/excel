async function hashData(string) {
  if (!string) return undefined;
  const msgBuffer = new TextEncoder().encode(string.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  try {
    const body = await request.json();
    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2,5).toUpperCase()}`;
    
    // Mock de verificación para asegurar que success.html reciba el pedido exitoso:
    const mockOrder = {
      orderId: orderId,
      email: body.email || "cliente@ejemplo.com",
      status: "completed",
      amount: 29, // Default
      currency: "USD",
      method: body.method || "stripe",
      date: new Date().toISOString()
    };

    const DB = env.SITE_CONFIG_KV || env.DB;
    if (DB) {
      let orders = await DB.get("orders", "json") || [];
      orders.push(mockOrder);
      await DB.put("orders", JSON.stringify(orders));
    }

    // --- Facebook Conversions API (CAPI) Integration ---
    const pixelId = env.FB_PIXEL_ID || body.pixelId;
    const token = env.FB_ACCESS_TOKEN;
    
    if (pixelId && token) {
      try {
        const hashedEmail = await hashData(mockOrder.email);
        const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip");
        const userAgent = request.headers.get("user-agent");

        const eventData = {
          data: [{
            event_name: "Purchase",
            event_time: Math.floor(Date.now() / 1000),
            action_source: "website",
            event_source_url: body.sourceUrl || "https://tusitio.com",
            event_id: orderId, // Usamos orderId como event_id para deduplicación
            user_data: {
              em: hashedEmail ? [hashedEmail] : undefined,
              client_ip_address: clientIp,
              client_user_agent: userAgent,
              fbp: body.fbp || undefined,
              fbc: body.fbc || undefined
            },
            custom_data: {
              currency: mockOrder.currency,
              value: mockOrder.amount
            }
          }]
        };

        if (env.FB_TEST_EVENT_CODE) {
           eventData.test_event_code = env.FB_TEST_EVENT_CODE;
        }

        // Ejecutar en background para no retrasar la respuesta al cliente
        context.waitUntil(
          fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
          })
          .then(res => res.text())
          .then(text => console.log("CAPI Response:", text))
          .catch(e => console.error("CAPI Error:", e))
        );
      } catch (e) {
        console.error("Failed to prepare CAPI event:", e);
      }
    }
    // ---------------------------------------------------

    return new Response(JSON.stringify({
      orderId: orderId,
      email: mockOrder.email,
      invoiceUrl: "",
      downloadUrl: "./panel.html",
      metaEventId: orderId
    }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers });
  }
}
