import { extractToken, getValidatedUser } from "../_session.js";
import { WS_ID_PATTERN, ensureDefaultWorkspace, workspaceOwnedBy } from "../_workspaces.js";

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
  const { env, request, params } = context;
  const workspaceId = params?.id || "";
  if (!WS_ID_PATTERN.test(workspaceId)) return json({ error: "Identifiant de workspace invalide" }, 400);
  try {
    const user = await getValidatedUser(env, extractToken(request));
    if (!user) return json({ error: "Non authentifié" }, 401);
    const userId = userIdFor(user);

    if (request.method === "GET") {
      const owned = await workspaceOwnedBy(env, userId, workspaceId);
      if (!owned) return json({ error: "Workspace introuvable" }, 404);
      const { results } = await env.DB.prepare(
        "SELECT id, name, updated_at FROM projects WHERE user_id = ? AND workspace_id = ? ORDER BY updated_at DESC"
      ).bind(userId, workspaceId).all();
      const ws = await env.DB.prepare("SELECT name FROM workspaces WHERE id = ?").bind(workspaceId).first();
      return json({
        id: workspaceId,
        name: ws?.name || "",
        projects: results.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at })),
      });
    }

    if (request.method === "PUT") {
      const owned = await workspaceOwnedBy(env, userId, workspaceId);
      if (!owned) return json({ error: "Workspace introuvable" }, 404);
      let body = {};
      try { body = await request.json(); } catch (e) {}
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : null;
      if (!name) return json({ error: "Nom invalide" }, 400);
      await env.DB.prepare("UPDATE workspaces SET name = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(name, workspaceId).run();
      return json({ ok: true, id: workspaceId, name });
    }

    if (request.method === "DELETE") {
      const owned = await workspaceOwnedBy(env, userId, workspaceId);
      if (!owned) return json({ error: "Workspace introuvable" }, 404);
      const defaultId = await ensureDefaultWorkspace(env, userId);
      if (defaultId !== workspaceId) {
        await env.DB.prepare("UPDATE projects SET workspace_id = ? WHERE user_id = ? AND workspace_id = ?")
          .bind(defaultId, userId, workspaceId).run();
        await env.DB.prepare("DELETE FROM workspaces WHERE id = ?").bind(workspaceId).run();
      }
      return json({ ok: true });
    }

    return json({ error: "Méthode non supportée" }, 405);
  } catch (err) {
    return json({ error: "Erreur serveur: " + err.message }, 500);
  }
}