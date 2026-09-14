const MAIN_SITE = "https://pixelsoftwaredesign.onrender.com";

const SESSION_TTL = 60 * 60 * 24 * 7;
const VALIDATION_TTL = 10 * 60;

function extractToken(request) {
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.match(/(?:^|;\s*)iner_session=([^;]+)/);
  return match ? match[1] : null;
}

async function fetchUser(sessionId) {
  if (!sessionId) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(`${MAIN_SITE}/api/me/`, {
        headers: { Cookie: `sessionid=${sessionId}` },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data && data.status === "success" && data.user) {
        return { username: data.user.username || "", email: data.user.email || "" };
      }
      return null;
    } catch (e) {
      if (attempt === 1) return null;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  return null;
}

async function getValidatedUser(env, token) {
  if (!token) return null;
  const cacheKey = `val:${token}`;
  const cached = await env.iner_sessions.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.user) return parsed.user;
    } catch (e) {}
  }

  const stored = await env.iner_sessions.get(token).catch(() => null);
  if (!stored) return null;
  let session = null;
  try {
    session = JSON.parse(stored);
  } catch (e) {
    session = null;
  }
  if (!session || !session.sessionid) return null;

  const user = await fetchUser(session.sessionid);
  if (!user) return null;

  await env.iner_sessions
    .put(cacheKey, JSON.stringify({ user, ts: Date.now() }), { expirationTtl: VALIDATION_TTL })
    .catch(() => {});
  await env.iner_sessions
    .put(token, JSON.stringify({ sessionid: session.sessionid }), { expirationTtl: SESSION_TTL })
    .catch(() => {});

  return user;
}

export { getValidatedUser, extractToken, SESSION_TTL };