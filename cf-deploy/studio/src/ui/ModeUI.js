const MODE_LABELS = {
  CAD: "CAD",
  MESH_EDIT: "Mesh Edit",
  PANORAMA_360: "360°",
  CINEMATIC: "Cinématique",
  LANDSCAPE: "Paysage",
};

export function applyModeVisibility(modeId, allModes = Object.keys(MODE_LABELS)) {
  if (!document.body) return;
  document.body.dataset.mode = modeId;
  document.querySelectorAll("[data-modes]").forEach((el) => {
    const allowed = (el.dataset.modes || "").split(/\s+/);
    el.classList.toggle("mode-hidden", !allowed.includes(modeId));
  });
  document.querySelectorAll("[data-mode-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.modeBtn === modeId);
  });
  const labelEl = document.getElementById("ctModeLabel");
  if (labelEl) labelEl.textContent = MODE_LABELS[modeId] || modeId;
}