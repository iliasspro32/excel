export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // Parse state
  let lang = "es";
  let returnPath = "/portal.html";
  try {
    const parsed = JSON.parse(atob(stateParam || ""));
    lang = parsed.lang || "es";
    returnPath = parsed.return || "/portal.html";
  } catch (_) {}

  const redirectBase = `${url.origin}${returnPath}?lang=${lang}`;

  if (errorParam === "access_denied") {
    return Response.redirect(`${redirectBase}&error=cancelled`, 302);
  }

  if (!code) {
    return Response.redirect(`${redirectBase}&error=auth_failed`, 302);
  }

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const sessionSecret = env.SESSION_SECRET || "default-secret-change-me";

  if (!clientId || !clientSecret) {
    return Response.redirect(`${redirectBase}&error=auth_not_configured`, 302);
  }

  // Verify state cookie
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookieState = cookieHeader.match(/oauth_state=([^;]+)/)?.[1];
  if (!cookieState || cookieState !== stateParam) {
    return Response.redirect(`${redirectBase}&error=invalid_state`, 302);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${url.origin}/auth/callback`,
        grant_type: "authorization_code"
      })
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      const errCode = tokenData.error === "invalid_client" ? "google_invalid_client"
        : tokenData.error === "redirect_uri_mismatch" ? "google_redirect_mismatch"
        : tokenData.error === "invalid_grant" ? "google_invalid_grant"
        : "auth_failed";
      return Response.redirect(`${redirectBase}&error=${errCode}`, 302);
    }

    // Get user info from id_token
    const idToken = tokenData.id_token;
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userInfo = await userInfoRes.json();

    if (!userInfo.email) {
      return Response.redirect(`${redirectBase}&error=no_email`, 302);
    }

    // Create session token (simple base64 of user data + secret signature)
    const sessionData = {
      email: userInfo.email,
      name: userInfo.name || "",
      picture: userInfo.picture || "",
      sub: userInfo.sub,
      iat: Date.now()
    };

    const sessionJson = JSON.stringify(sessionData);
    const sessionToken = btoa(sessionJson) + "." + await sign(sessionJson, sessionSecret);

    const responseHeaders = new Headers({ "Location": redirectBase });
    responseHeaders.append("Set-Cookie", `oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    responseHeaders.append("Set-Cookie", `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);

    return new Response(null, {
      status: 302,
      headers: responseHeaders
    });

  } catch (err) {
    return Response.redirect(`${redirectBase}&error=auth_failed`, 302);
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
