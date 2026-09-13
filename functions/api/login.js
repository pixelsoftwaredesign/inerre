const MAIN_SITE = "https://pixelsoftwaredesign.onrender.com";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  const data = await request.json().catch(() => ({}));
  const username = (data.username || "").trim();
  const password = data.password || "";
  if (!username || !password) {
    return new Response(JSON.stringify({ error: "Identifiants manquants" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const token = crypto.randomUUID().replace(/-/g, "");
    const loginResp = await fetch(`${MAIN_SITE}/api/connexion/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      redirect: "manual",
    });

    let loginJson = null;
    try {
      loginJson = await loginResp.json();
    } catch (e) {
      loginJson = null;
    }

    if (!loginResp.ok || !loginJson || loginJson.status !== "success") {
      const msg = loginJson && loginJson.message ? loginJson.message : "Connexion refusée";
      return new Response(JSON.stringify({ error: msg }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const setCookies = loginResp.headers.getSetCookie ? loginResp.headers.getSetCookie() : [];
    let sessionId = null;
    if (setCookies.length) {
      const sc = setCookies.find((c) => c.startsWith("sessionid="));
      if (sc) sessionId = sc.split(";")[0].slice("sessionid=".length);
    }
    if (!sessionId) {
      const sc = loginResp.headers.get("Set-Cookie") || "";
      const m = sc.match(/sessionid=([^;]+)/);
      if (m) sessionId = m[1];
    }
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Session introuvable" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    await env.iner_sessions.put(token, JSON.stringify({ sessionid: sessionId }), {
      expirationTtl: 60 * 60 * 24 * 7,
    });

    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append(
      "Set-Cookie",
      `iner_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
    );

    return new Response(JSON.stringify({ status: "success" }), {
      status: 200,
      headers,
    });
  } catch (e) {
    console.error("login:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}