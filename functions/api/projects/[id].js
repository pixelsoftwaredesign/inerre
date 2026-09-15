import { extractToken, getValidatedUser } from "../_session.js";
import { ensureDefaultWorkspace, workspaceOwnedBy } from "../_workspaces.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function userIdFor(user) {
  return (user.email || user.username || "").trim().toLowerCase();
}

const ID_PATTERN = /^proj_[a-z0-9]{8,32}$/;

export async function onRequest(context) {
  const { env, request, params } = context;
  const projectId = params?.id || "";
  if (!ID_PATTERN.test(projectId)) return json({ error: "Identifiant de projet invalide" }, 400);
  try {
    const user = await getValidatedUser(env, extractToken(request));
    if (!user) return json({ error: "Non authentifié" }, 401);
    const userId = userIdFor(user);

    if (request.method === "GET") {
      const row = await env.DB.prepare("SELECT id, name, data, workspace_id, updated_at FROM projects WHERE id = ? AND user_id = ?")
        .bind(projectId, userId).first();
      if (!row) return json({ error: "Projet introuvable" }, 404);
      let data = {};
      try { data = JSON.parse(row.data || "{}"); } catch (e) {}
      return json({ id: row.id, name: row.name, data, workspaceId: row.workspace_id, updatedAt: row.updated_at });
    }

    if (request.method === "PUT") {
      const exists = await env.DB.prepare("SELECT id, name, workspace_id FROM projects WHERE id = ? AND user_id = ?")
        .bind(projectId, userId).first();
      if (!exists) return json({ error: "Projet introuvable" }, 404);
      let body = {};
      try { body = await request.json(); } catch (e) {}
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : exists.name;
      const data = JSON.stringify(body.data ?? {});
      let workspaceId = exists.workspace_id;
      if (Object.prototype.hasOwnProperty.call(body, "workspaceId") && body.workspaceId) {
        const owned = await workspaceOwnedBy(env, userId, body.workspaceId);
        if (!owned) return json({ error: "Workspace introuvable" }, 404);
        workspaceId = body.workspaceId;
      }
      await env.DB.prepare("UPDATE projects SET name = ?, data = ?, workspace_id = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(name, data, workspaceId, projectId).run();
      const row = await env.DB.prepare("SELECT updated_at FROM projects WHERE id = ?").bind(projectId).first();
      return json({ ok: true, name, workspaceId, updatedAt: row?.updated_at });
    }

    if (request.method === "DELETE") {
      const exists = await env.DB.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
        .bind(projectId, userId).first();
      if (!exists) return json({ error: "Projet introuvable" }, 404);
      await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();
      return json({ ok: true });
    }

    return json({ error: "Méthode non supportée" }, 405);
  } catch (err) {
    return json({ error: "Erreur serveur: " + err.message }, 500);
  }
}