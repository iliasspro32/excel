export async function onRequestPost(context) {
  const { request, env } = context;
  
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  try {
    const body = await request.json();
    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2,5).toUpperCase()}`;
    
    // Aquí iría la lógica de verificación real con Stripe (Retrieve Payment Intent)
    // O verificación con PayPal (Orders API)
    
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

    if (env.DB) {
      let orders = await env.DB.get("orders", "json") || [];
      orders.push(mockOrder);
      await env.DB.put("orders", JSON.stringify(orders));
    }

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
