const MAIN_SITE = "https://pixelsoftwaredesign.onrender.com";

const PUBLIC_PATHS = ["/login", "/login/", "/api/login", "/api/logout", "/api/health", "/favicon.ico", "/styles.css"];

async function validateSession(sessionId) {
  if (!sessionId) return null;
  try {
    const resp = await fetch(`${MAIN_SITE}/api/me/`, {
      headers: { Cookie: `sessionid=${sessionId}` },
      redirect: "follow",
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.status === "success" && data.user) return data.user;
  } catch (e) {
    console.error("validateSession:", e);
  }
  return null;
}

function isPublic(pathname) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (isPublic(pathname)) {
    return next();
  }

  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.match(/(?:^|;\s*)iner_session=([^;]+)/);
  if (match) {
    const stored = await env.iner_sessions.get(match[1]).catch(() => null);
    if (stored) {
      let session = null;
      try {
        session = JSON.parse(stored);
      } catch (e) {
        session = null;
      }
      if (session && session.sessionid) {
        const user = await validateSession(session.sessionid);
        if (user) {
          const patched = new Request(request, {
            headers: new Headers(request.headers),
          });
          const response = await next(patched);
          const res = new Response(response.body, response);
          res.headers.set("X-Iner-User", JSON.stringify({ username: user.username || "", email: user.email || "" }));
          return res;
        }
      }
    }
  }

  if (request.method === "GET" && !pathname.startsWith("/api/")) {
    return new Response(null, { status: 302, headers: { Location: "/login" } });
  }
  return new Response(JSON.stringify({ error: "Authentification requise" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}