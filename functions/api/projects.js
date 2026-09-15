import { extractToken, getValidatedUser } from "./_session.js";
import { ensureDefaultWorkspace, workspaceOwnedBy } from "./_workspaces.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function userIdFor(user) {
  return (user.email || user.username || "").trim().toLowerCase();
}

async function authedUser(env, request) {
  return await getValidatedUser(env, extractToken(request));
}

export async function onRequest(context) {
  try {
    const user = await authedUser(context.env, context.request);
    if (!user) return json({ error: "Non authentifié" }, 401);
    const userId = userIdFor(user);
    const { env } = context;

    if (context.request.method === "GET") {
      const wsParam = new URL(context.request.url).searchParams.get("workspace");
      if (wsParam) {
        const owned = await workspaceOwnedBy(env, userId, wsParam);
        if (!owned) return json({ error: "Workspace introuvable" }, 404);
        const { results } = await env.DB.prepare(
          "SELECT id, name, workspace_id, updated_at FROM projects WHERE user_id = ? AND workspace_id = ? ORDER BY updated_at DESC"
        ).bind(userId, wsParam).all();
        return json({ projects: results.map((r) => ({ id: r.id, name: r.name, workspaceId: r.workspace_id, updatedAt: r.updated_at })) });
      }
      const { results } = await env.DB.prepare(
        "SELECT id, name, workspace_id, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC"
      ).bind(userId).all();
      return json({ projects: results.map((r) => ({ id: r.id, name: r.name, workspaceId: r.workspace_id, updatedAt: r.updated_at })) });
    }

    if (context.request.method === "POST") {
      let body = {};
      try { body = await context.request.json(); } catch (e) {}
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "Projet sans nom";
      const data = JSON.stringify(body.data ?? {});
      let workspaceId = null;
      if (body.workspaceId) {
        const owned = await workspaceOwnedBy(env, userId, body.workspaceId);
        if (!owned) return json({ error: "Workspace introuvable" }, 404);
        workspaceId = body.workspaceId;
      } else {
        workspaceId = await ensureDefaultWorkspace(env, userId);
      }
      const id = "proj_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      await env.DB.prepare("INSERT INTO projects (id, user_id, workspace_id, name, data) VALUES (?, ?, ?, ?, ?)")
        .bind(id, userId, workspaceId, name, data).run();
      return json({ id, name, workspaceId }, 201);
    }

    return json({ error: "Méthode non supportée" }, 405);
  } catch (err) {
    return json({ error: "Erreur serveur: " + err.message }, 500);
  }
}