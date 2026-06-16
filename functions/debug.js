export async function onRequest(context) {
  const { env } = context;
  return new Response(JSON.stringify({
    hasGoogleClientId: !!env.GOOGLE_CLIENT_ID,
    hasGoogleSecret: !!env.GOOGLE_CLIENT_SECRET,
    hasSessionSecret: !!env.SESSION_SECRET,
    hasAdminPassword: !!env.ADMIN_PASSWORD,
    hasStripeKey: !!env.STRIPE_SECRET_KEY,
    clientIdPrefix: env.GOOGLE_CLIENT_ID ? env.GOOGLE_CLIENT_ID.slice(0, 10) + "..." : "NOT FOUND",
    envKeys: Object.keys(env).filter(k => !k.toLowerCase().includes("secret") && !k.toLowerCase().includes("key"))
  }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
}
