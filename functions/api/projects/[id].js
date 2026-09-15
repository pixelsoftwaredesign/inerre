import { extractToken, getValidatedUser } from "../_session.js";

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
      const row = await env.DB.prepare("SELECT id, name, data, updated_at FROM projects WHERE id = ? AND user_id = ?")
        .bind(projectId, userId).first();
      if (!row) return json({ error: "Projet introuvable" }, 404);
      let data = {};
      try { data = JSON.parse(row.data || "{}"); } catch (e) {}
      return json({ id: row.id, name: row.name, data, updatedAt: row.updated_at });
    }

    if (request.method === "PUT") {
      const exists = await env.DB.prepare("SELECT id, name FROM projects WHERE id = ? AND user_id = ?")
        .bind(projectId, userId).first();
      if (!exists) return json({ error: "Projet introuvable" }, 404);
      let body = {};
      try { body = await request.json(); } catch (e) {}
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : exists.name;
      const data = JSON.stringify(body.data ?? {});
      await env.DB.prepare("UPDATE projects SET name = ?, data = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(name, data, projectId).run();
      const row = await env.DB.prepare("SELECT updated_at FROM projects WHERE id = ?").bind(projectId).first();
      return json({ ok: true, name, updatedAt: row?.updated_at });
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