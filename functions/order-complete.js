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
      
      // Update cart recovery status
      let carts = await DB.get("carts", "json") || [];
      const cartIndex = carts.findIndex(c => c.email.toLowerCase() === mockOrder.email.toLowerCase());
      if (cartIndex !== -1 && !carts[cartIndex].recovered) {
        carts[cartIndex].recovered = true;
        await DB.put("carts", JSON.stringify(carts));
      }
      
      // Send Welcome Email via Resend
      try {
        const config = await DB.get("config", "json") || {};
        const resendKey = config.resendApiKey || env.RESEND_API_KEY;
        if (resendKey && mockOrder.email !== "cliente@ejemplo.com") {
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; direction: rtl; text-align: right;">
              <h2 style="color: #0f8a5f;">¡Gracias por tu compra!</h2>
              <p>Tu pedido ha sido procesado exitosamente. Puedes acceder a todo el material descargable y a tus bonos exclusivos directamente desde tu panel de usuario.</p>
              <a href="${env.SITE_URL || "https://digital.raqmiy.com"}/panel.html" style="display: inline-block; background-color: #0f8a5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 15px;">
                Ir a mi Panel de Usuario
              </a>
              <p style="margin-top: 20px;">Tu correo asociado para acceder es: <strong>${mockOrder.email}</strong></p>
            </div>
          `;
          
          context.waitUntil(
            fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: `Soporte <${config.fromEmail || "onboarding@resend.dev"}>`,
                to: [mockOrder.email],
                subject: "¡Bienvenido! Acceso a tu compra",
                html: emailHtml
              })
            })
            .then(res => res.text())
            .then(text => console.log("Post-purchase Email Response:", text))
            .catch(e => console.error("Post-purchase Email Error:", e))
          );
        }
      } catch (emailErr) {
        console.error("Error preparing welcome email:", emailErr);
      }
    }

    // --- Facebook Conversions API (CAPI) Integration ---
    const pixelId = env.FB_PIXEL_ID || body.pixelId;
    const token = env.FB_ACCESS_TOKEN || env.META_CAPI_ACCESS_TOKEN;
    
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
