export async function onRequest({ request, env }) {
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.match(/(?:^|;\s*)iner_session=([^;]+)/);
  if (match) {
    await env.iner_sessions.delete(match[1]).catch(() => {});
  }
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", "iner_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  return new Response(JSON.stringify({ status: "success" }), {
    status: 200,
    headers,
  });
}