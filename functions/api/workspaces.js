import { extractToken, getValidatedUser } from "./_session.js";
import { ensureDefaultWorkspace } from "./_workspaces.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function userIdFor(user) {
  return (user.email || user.username || "").trim().toLowerCase();
}

export async function onRequest(context) {
  try {
    const user = await getValidatedUser(context.env, extractToken(context.request));
    if (!user) return json({ error: "Non authentifié" }, 401);
    const userId = userIdFor(user);
    const { env } = context;

    if (context.request.method === "GET") {
      const defaultId = await ensureDefaultWorkspace(env, userId);
      const { results } = await env.DB.prepare(
        `SELECT w.id, w.name, COUNT(p.id) AS project_count
         FROM workspaces w
         LEFT JOIN projects p ON p.workspace_id = w.id AND p.user_id = w.user_id
         WHERE w.user_id = ?
         GROUP BY w.id, w.name
         ORDER BY w.created_at ASC`
      ).bind(userId).all();
      return json({
        defaultId,
        workspaces: results.map((r) => ({ id: r.id, name: r.name, projectCount: Number(r.project_count) || 0 })),
      });
    }

    if (context.request.method === "POST") {
      let body = {};
      try { body = await context.request.json(); } catch (e) {}
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "Espace de travail";
      const id = "ws_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      await env.DB.prepare("INSERT INTO workspaces (id, user_id, name) VALUES (?, ?, ?)")
        .bind(id, userId, name).run();
      return json({ id, name }, 201);
    }

    return json({ error: "Méthode non supportée" }, 405);
  } catch (err) {
    return json({ error: "Erreur serveur: " + err.message }, 500);
  }
}