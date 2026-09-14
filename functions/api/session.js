import { getValidatedUser, extractToken } from "./_session.js";

export async function onRequest({ request, env }) {
  const token = extractToken(request);
  const user = token ? await getValidatedUser(env, token) : null;
  if (!user) {
    return new Response(JSON.stringify({ status: "error", message: "Non authentifié" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({ status: "success", user: { username: user.username, email: user.email } }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}