export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "x-admin-password, Content-Type"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  const DB = env.SITE_CONFIG_KV || env.DB;

  // Si DB no está configurado, lanzar error informativo
  if (!DB) {
    return new Response(JSON.stringify({ error: "La base de datos (DB KV Namespace) no está configurada en Cloudflare." }), { status: 500, headers });
  }

  const MASTER_PASSWORD = env.ADMIN_PASSWORD || "admin123";
  
  const checkAuth = () => {
    const pwd = request.headers.get("x-admin-password");
    if (pwd === MASTER_PASSWORD) return;

    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Basic ")) {
      try {
        const credentials = atob(authHeader.split(" ")[1]);
        const [username, password] = credentials.split(":");
        if (password === MASTER_PASSWORD) return;
      } catch (e) {}
    }

    throw new Error("Unauthorized");
  };

  try {
    if (path.startsWith("/api/config")) {
      if (request.method === "GET") {
        let config = await DB.get("config", "json");
        if (!config) config = {};
        
        try {
          checkAuth();
          return new Response(JSON.stringify(config), { headers });
        } catch(e) {
          const publicConfig = {
            productName: config.productName,
            price: config.price,
            currency: config.currency,
            countdownHours: config.countdownHours,
            successUrl: config.successUrl,
            supportEmail: config.supportEmail,
            stripePublishableKey: config.stripePublishableKey,
            orderBumpEnabled: config.orderBumpEnabled,
            orderBumpName: config.orderBumpName,
            orderBumpDescription: config.orderBumpDescription,
            orderBumpImageUrl: config.orderBumpImageUrl,
            orderBumpPrice: config.orderBumpPrice,
            upsellEnabled: config.upsellEnabled,
            upsellName: config.upsellName,
            upsellDescription: config.upsellDescription,
            upsellImageUrl: config.upsellImageUrl,
            upsellPrice: config.upsellPrice,
            metaPixelId: config.metaPixelId,
            gtmId: config.gtmId
          };
          return new Response(JSON.stringify(publicConfig), { headers });
        }
      } else if (request.method === "POST") {
        checkAuth();
        const data = await request.json();
        await DB.put("config", JSON.stringify(data));
        return new Response(JSON.stringify({ ok: true, config: data }), { headers });
      }
    }
    
    if (path.startsWith("/api/products")) {
      let products = await DB.get("products", "json") || [];
      let categories = await DB.get("categories", "json") || [
        "Canva Templates", "Design", "Ebook", "Video", "Audio", "Software", "Social Media", "Marketing", "Otros"
      ];
      
      if (request.method === "GET") {
        return new Response(JSON.stringify({ products, categories }), { headers });
      } else if (request.method === "POST" || request.method === "PUT") {
        checkAuth();
        const data = await request.json();
        
        if (data.type === "category") {
          if (request.method === "POST") {
            if (!categories.includes(data.name)) categories.push(data.name);
          } else if (request.method === "PUT") {
            const idx = categories.indexOf(data.from);
            if (idx >= 0) categories[idx] = data.to;
            products = products.map(p => p.category === data.from ? { ...p, category: data.to } : p);
            await DB.put("products", JSON.stringify(products));
          }
          await DB.put("categories", JSON.stringify(categories));
          return new Response(JSON.stringify({ products, categories }), { headers });
        } else {
          data.active = data.active !== false;
          if (!data.id) data.id = "p_" + Date.now();
          
          if (request.method === "POST") {
             products.push(data);
          } else {
             const idx = products.findIndex(p => p.id === data.id);
             if (idx >= 0) products[idx] = data;
             else products.push(data);
          }
          await DB.put("products", JSON.stringify(products));
          return new Response(JSON.stringify({ products, categories }), { headers });
        }
      } else if (request.method === "DELETE") {
        checkAuth();
        const id = url.searchParams.get("id");
        const category = url.searchParams.get("category");
        const fallback = url.searchParams.get("fallback") || "Sin categoría";
        
        if (id) {
          products = products.filter(p => p.id !== id);
          await DB.put("products", JSON.stringify(products));
          return new Response(JSON.stringify({ products, categories }), { headers });
        } else if (category) {
          categories = categories.filter(c => c !== category);
          products = products.map(p => p.category === category ? { ...p, category: fallback } : p);
          if (!categories.includes(fallback)) categories.push(fallback);
          await DB.put("categories", JSON.stringify(categories));
          await DB.put("products", JSON.stringify(products));
          return new Response(JSON.stringify({ products, categories }), { headers });
        }
        return new Response(JSON.stringify({ products, categories }), { headers });
      }
    }
    
    if (path.startsWith("/api/portal-products")) {
       let products = await DB.get("products", "json") || [];
       let config = await DB.get("config", "json") || {};
       let orders = await DB.get("orders", "json") || [];

       let user = null;
       let isPurchaser = false;

       // 1. Check Google session cookie
       const cookieHeader = request.headers.get("Cookie") || "";
       const sessionToken = cookieHeader.match(/session=([^;]+)/)?.[1];
       if (sessionToken) {
         try {
           const sessionSecret = env.SESSION_SECRET || "excel-portal-session-secret-2026-secure-xyz789";
           const [dataB64, sig] = sessionToken.split(".");
           const sessionJson = atob(dataB64);
           const key = await crypto.subtle.importKey(
             "raw", new TextEncoder().encode(sessionSecret),
             { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
           );
           const computed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sessionJson));
           const expectedSig = btoa(String.fromCharCode(...new Uint8Array(computed)));
           if (sig === expectedSig) {
             const sd = JSON.parse(sessionJson);
             user = { email: sd.email, name: sd.name, picture: sd.picture };
             isPurchaser = orders.some(o =>
               o.email?.toLowerCase() === sd.email?.toLowerCase()
             );
           }
         } catch (_) {}
       }

       // 2. Check order-based access headers (x-order-email + x-order-id)
       if (!isPurchaser) {
         const orderEmail = (request.headers.get("x-order-email") || "").toLowerCase().trim();
         const orderId = (request.headers.get("x-order-id") || "").toUpperCase().trim();
         if (orderEmail && orderId) {
           const match = orders.find(o =>
             o.email?.toLowerCase() === orderEmail &&
             (o.orderId?.toUpperCase() === orderId || o.id?.toUpperCase() === orderId)
           );
           if (match) {
             isPurchaser = true;
             if (!user) user = { email: orderEmail };
           }
         }
       }

       const activeProducts = products.filter(p => p.active);
       return new Response(JSON.stringify({
         products: activeProducts,
         config,
         isPurchaser,
         user,
         code: isPurchaser ? "OK" : "NO_PURCHASE"
       }), { headers });
    }

    if (path.startsWith("/api/orders")) {
      if (request.method === "GET") {
        checkAuth();
        let orders = await DB.get("orders", "json") || [];
        return new Response(JSON.stringify({ 
          orders, 
          stats: { total: orders.length, revenue: orders.reduce((acc, o) => acc + (o.amount || 0), 0), stripe: 0, paypal: 0 } 
        }), { headers });
      } else if (request.method === "POST") {
        checkAuth();
        return new Response(JSON.stringify({ ok: true }), { headers });
      }
    }

    if (path.startsWith("/api/carts")) {
      if (request.method === "GET") {
        checkAuth();
        return new Response(JSON.stringify({ carts: [], recovered: [], stats: {} }), { headers });
      } else if (request.method === "POST") {
        checkAuth();
        return new Response(JSON.stringify({ ok: true }), { headers });
      }
    }
    
    if (path.startsWith("/api/messages")) {
      if (request.method === "GET") {
        checkAuth();
        let msgs = await DB.get("messages", "json") || [];
        return new Response(JSON.stringify(msgs), { headers });
      } else if (request.method === "POST") {
        checkAuth();
        return new Response(JSON.stringify({ ok: true }), { headers });
      }
    }

    if (path.startsWith("/api/contact")) {
      if (request.method === "POST") {
        const data = await request.json();
        let msgs = await DB.get("messages", "json") || [];
        msgs.push({ ...data, id: "msg_" + Date.now(), date: new Date().toISOString(), read: false });
        await DB.put("messages", JSON.stringify(msgs));

        try {
          const emailPayload = {
            personalizations: [
              { to: [{ email: "info@excel.ivomarket.com", name: "Soporte Excel" }] }
            ],
            from: {
              email: "no-reply@excel.ivomarket.com",
              name: "Soporte Web Excel"
            },
            reply_to: { email: data.email || "no-reply@excel.ivomarket.com", name: data.name || "Cliente" },
            subject: "Nuevo Mensaje de Contacto: " + (data.subject || "Sin asunto"),
            content: [{
              type: "text/html",
              value: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                  <h2 style="color: #0f8a5f;">Nuevo Mensaje de Contacto</h2>
                  <p><strong>Nombre:</strong> ${data.name || "N/A"}</p>
                  <p><strong>Email:</strong> ${data.email || "N/A"}</p>
                  <p><strong>Asunto:</strong> ${data.subject || "N/A"}</p>
                  <div style="margin-top: 20px; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #d4af37;">
                    <p style="white-space: pre-wrap;">${data.message || ""}</p>
                  </div>
                  <hr style="margin-top: 30px; border: 0; border-top: 1px solid #eee;" />
                  <p style="font-size: 12px; color: #888;">Este mensaje fue enviado desde el formulario de tu página web (excel.ivomarket.com).</p>
                </div>
              `
            }]
          };

          await fetch("https://api.mailchannels.net/tx/v1/send", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(emailPayload)
          });
        } catch (e) {}

        return new Response(JSON.stringify({ ok: true, success: true }), { headers });
      }
    }
    
    if (path.startsWith("/api/cart-leads") || path.startsWith("/api/chat-lead")) {
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    return new Response(JSON.stringify({ error: "Ruta no encontrada." }), { status: 404, headers });
  } catch (err) {
    if (err.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Contraseña incorrecta." }), { status: 401, headers });
    }
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
