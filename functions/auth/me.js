export async function onRequest(context) {
  const { request, env } = context;
  const sessionSecret = env.SESSION_SECRET || "default-secret-change-me";

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  const cookieHeader = request.headers.get("Cookie") || "";
  const sessionToken = cookieHeader.match(/session=([^;]+)/)?.[1];

  if (!sessionToken) {
    return new Response(JSON.stringify({ authenticated: false }), { headers });
  }

  try {
    const [dataB64, signature] = sessionToken.split(".");
    if (!dataB64 || !signature) throw new Error("invalid");

    const sessionJson = atob(dataB64);
    const expectedSig = await sign(sessionJson, sessionSecret);

    if (signature !== expectedSig) throw new Error("invalid signature");

    const sessionData = JSON.parse(sessionJson);

    // Session valid for 30 days
    if (Date.now() - sessionData.iat > 30 * 24 * 60 * 60 * 1000) {
      throw new Error("expired");
    }

    return new Response(JSON.stringify({
      authenticated: true,
      email: sessionData.email,
      name: sessionData.name,
      picture: sessionData.picture
    }), { headers });

  } catch (_) {
    return new Response(JSON.stringify({ authenticated: false }), { headers });
  }
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
