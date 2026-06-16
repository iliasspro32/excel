// v3 - google oauth handler with hardcoded fallback
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // CLIENT_ID is public - safe to hardcode as fallback
  const clientId = env.GOOGLE_CLIENT_ID || "158887462780-n6o6cgdbenbbhtabgrcl831u0gi6arlu.apps.googleusercontent.com";
  if (!clientId) {
    const returnUrl = url.searchParams.get("return") || "/panel.html";
    return Response.redirect(`${url.origin}${returnUrl}?error=auth_not_configured`, 302);
  }

  const lang = url.searchParams.get("lang") || "es";
  const returnPath = url.searchParams.get("return") || "/panel.html";

  // State anti-CSRF: encode lang + return path
  const state = btoa(JSON.stringify({ lang, return: returnPath, nonce: crypto.randomUUID() }));

  const redirectUri = `${url.origin}/auth/callback`;

  const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleUrl.searchParams.set("client_id", clientId);
  googleUrl.searchParams.set("redirect_uri", redirectUri);
  googleUrl.searchParams.set("response_type", "code");
  googleUrl.searchParams.set("scope", "openid email profile");
  googleUrl.searchParams.set("state", state);
  googleUrl.searchParams.set("prompt", "select_account");

  // Store state in cookie for verification
  return new Response(null, {
    status: 302,
    headers: {
      "Location": googleUrl.toString(),
      "Set-Cookie": `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    }
  });
}
