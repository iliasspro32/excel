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

  // Si DB no está configurado, lanzar error informativo
  if (!env.DB) {
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
        let config = await env.DB.get("config", "json");
        if (!config) config = {};
        return new Response(JSON.stringify(config), { headers });
      } else if (request.method === "POST") {
        checkAuth();
        const data = await request.json();
        await env.DB.put("config", JSON.stringify(data));
        return new Response(JSON.stringify({ ok: true, config: data }), { headers });
      }
    }
    
    if (path.startsWith("/api/products")) {
      let products = await env.DB.get("products", "json");
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
        await env.DB.put("products", JSON.stringify(products));
        return new Response(JSON.stringify(products), { headers });
      }
    }
    
    if (path.startsWith("/api/portal-products")) {
       let products = await env.DB.get("products", "json") || [];
       let config = await env.DB.get("config", "json") || {};
       return new Response(JSON.stringify({ products: products.filter(p => p.active), config }), { headers });
    }

    if (path.startsWith("/api/orders")) {
      if (request.method === "GET") {
        checkAuth();
        let orders = await env.DB.get("orders", "json") || [];
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
