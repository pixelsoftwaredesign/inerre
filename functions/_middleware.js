import { getValidatedUser, extractToken } from "./api/_session.js";

const PUBLIC_PATHS = ["/", "/robots.txt", "/sitemap.xml", "/llms.txt", "/llms-full.txt", "/login", "/login/", "/api/login", "/api/logout", "/api/health", "/api/session"];

const AUTHCSS_PATHS = ["/favicon.ico", "/favicon.svg", "/logo.svg", "/styles.css"];

const ASSET_EXTS = ["js", "css", "svg", "png", "jpg", "jpeg", "webp", "gif", "ico", "woff", "woff2", "ttf", "json", "map"];

function isAssetPath(pathname) {
  const clean = pathname.split("?")[0];
  const ext = clean.includes(".") ? clean.split(".").pop().toLowerCase() : "";
  return ext !== "" && ASSET_EXTS.includes(ext);
}

function isPublic(pathname) {
  return (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    AUTHCSS_PATHS.includes(pathname) ||
    isAssetPath(pathname)
  );
}

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (isPublic(pathname)) {
    return next();
  }

  const token = extractToken(request);
  const user = token ? await getValidatedUser(env, token) : null;
  if (user) {
    const patched = new Request(request, {
      headers: new Headers(request.headers),
    });
    const response = await next(patched);
    const res = new Response(response.body, response);
    res.headers.set("X-Iner-User", JSON.stringify({ username: user.username || "", email: user.email || "" }));
    return res;
  }

  if (request.method === "GET" && !pathname.startsWith("/api/")) {
    return new Response(null, { status: 302, headers: { Location: "/login" } });
  }
  return new Response(JSON.stringify({ error: "Authentification requise" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}