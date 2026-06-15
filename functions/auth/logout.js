export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const returnPath = url.searchParams.get("return") || "/portal.html";

  return new Response(null, {
    status: 302,
    headers: {
      "Location": returnPath,
      "Set-Cookie": `session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
    }
  });
}
