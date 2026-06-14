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
    if (pwd !== MASTER_PASSWORD) {
      throw new Error("Unauthorized");
    }
  };

  try {
    if (path.startsWith("/api/config")) {
      if (request.method === "GET") {
        let config = await DB.get("config", "json");
        if (!config) config = {};
        
        const pwd = request.headers.get("x-admin-password");
        if (pwd) {
          checkAuth();
          return new Response(JSON.stringify(config), { headers });
        } else {
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
      let products = await DB.get("products", "json");
      if (!products) products = [];
      
      if (request.method === "GET") {
        return new Response(JSON.stringify(products), { headers });
      } else if (request.method === "POST" || request.method === "DELETE") {
        checkAuth();
        const data = await request.json();
        if (data.action === "delete") {
           products = products.filter(p => p.id !== data.id);
        } else {
           const idx = products.findIndex(p => p.id === data.id);
           if (idx >= 0) products[idx] = data;
           else products.push(data);
        }
        await DB.put("products", JSON.stringify(products));
        return new Response(JSON.stringify(products), { headers });
      }
    }
    
    if (path.startsWith("/api/portal-products")) {
       let products = await DB.get("products", "json") || [];
       let config = await DB.get("config", "json") || {};
       return new Response(JSON.stringify({ products: products.filter(p => p.active), config }), { headers });
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
        return new Response(JSON.stringify([]), { headers });
      } else if (request.method === "POST") {
        checkAuth();
        return new Response(JSON.stringify({ ok: true }), { headers });
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
