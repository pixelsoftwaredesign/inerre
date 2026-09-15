export const WS_ID_PATTERN = /^ws_[a-z0-9]{4,32}$/;

export function generateWorkspaceId() {
  return "ws_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export async function ensureDefaultWorkspace(env, userId) {
  const existing = await env.DB
    .prepare("SELECT id FROM workspaces WHERE user_id = ? ORDER BY created_at ASC LIMIT 1")
    .bind(userId).first();
  if (existing) {
    await env.DB.prepare("UPDATE projects SET workspace_id = ? WHERE user_id = ? AND workspace_id IS NULL")
      .bind(existing.id, userId).run();
    return existing.id;
  }
  const id = generateWorkspaceId();
  await env.DB.prepare("INSERT INTO workspaces (id, user_id, name) VALUES (?, ?, ?)")
    .bind(id, userId, "Espace de travail principal").run();
  await env.DB.prepare("UPDATE projects SET workspace_id = ? WHERE user_id = ? AND workspace_id IS NULL")
    .bind(id, userId).run();
  return id;
}

export async function workspaceOwnedBy(env, userId, workspaceId) {
  if (!WS_ID_PATTERN.test(workspaceId)) return false;
  const row = await env.DB.prepare("SELECT id FROM workspaces WHERE id = ? AND user_id = ?")
    .bind(workspaceId, userId).first();
  return !!row;
}