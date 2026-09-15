import { analyze, distance2d, fireResistanceMinutes, seismicPga, defaultStructuralFor, MATERIALS } from "./StructuralEngine.js";

const G = 9.81;

function lateralCapacity(e) {
  const base = e.porteur ? e.mpa * 1000 : 2000;
  return Math.max(50, e.area * base * 0.12);
}

export function seismicStability(objects, magnitude = 6) {
  const { elements } = analyze(objects || []);
  const pga = seismicPga(magnitude);
  const scores = [];
  let survivalWeight = 0;
  let totalWeight = 0;

  for (const e of elements) {
    const horizontalK = (e.loadKg * G * pga) / 1000;
    const capacityK = lateralCapacity(e);
    const ratio = horizontalK / capacityK;
    const survive = ratio <= 1;
    scores.push({
      id: e.id,
      name: e.name,
      type: e.type,
      material: e.material,
      porteur: e.porteur,
      weightKg: e.weightKg,
      loadKg: e.loadKg,
      horizontalK,
      capacityK,
      ratio,
      survive,
      status: ratio >= 1.5 ? "critique" : ratio >= 1 ? "vigilance" : "ok",
    });
    totalWeight += e.weightKg;
    survivalWeight += e.weightKg * (survive ? 1 : 0.35);
  }

  const survivalProbability = totalWeight > 0 ? survivalWeight / totalWeight : 1;
  const maxRatio = scores.length ? Math.max(...scores.map((s) => s.ratio)) : 0;
  const worst = scores.reduce((a, b) => (b.ratio > a.ratio ? b : a), scores[0] || null);

  return {
    magnitude,
    pga,
    survivalProbability,
    maxRatio,
    worst,
    scores,
  };
}

export function fireSpread(objects, originId = null, opts = {}) {
  const proximity = opts.proximity ?? 2.5;
  const { elements } = analyze(objects || []);
  if (!elements.length) return { ignited: [], vulnerable: [], survivalFraction: 1, timeline: [] };

  const byId = new Map(elements.map((e) => [e.id, e]));
  let origin = originId && byId.get(originId) ? byId.get(originId) : elements[0];
  if (!origin) return { ignited: [], vulnerable: [], survivalFraction: 1, timeline: [] };

  const ignition = new Map();
  ignition.set(origin.id, 0);
  const frontier = [origin];
  const timeline = [];

  while (frontier.length) {
    let idx = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (ignition.get(frontier[i].id) < ignition.get(frontier[idx].id)) idx = i;
    }
    const current = frontier.splice(idx, 1)[0];
    const t = ignition.get(current.id);
    const collapse = fireResistanceMinutes(current.material);
    timeline.push({
      id: current.id,
      name: current.name,
      material: current.material,
      startsAtMin: Math.round(t * 10) / 10,
      collapsesAtMin: Math.round((t + collapse) * 10) / 10,
      vulnerable: collapse < 45,
      porteur: current.porteur,
    });
    for (const n of elements) {
      if (n.id === current.id || ignition.has(n.id)) continue;
      const d = distance2d(current.bb, n.bb);
      if (d > proximity) continue;
      const spreadTime = t + Math.max(0.5, d * 1.2) + fireResistanceMinutes(n.material) * 0.05;
      ignition.set(n.id, spreadTime);
      frontier.push(n);
    }
  }

  const EVAL_MIN = 90;
  const totalWeight = elements.reduce((s, e) => s + e.weightKg, 0);
  let standingWeight = 0;
  for (const e of elements) {
    const t = ignition.get(e.id);
    const collapseAt = t == null ? Infinity : t + fireResistanceMinutes(e.material);
    if (collapseAt > EVAL_MIN) standingWeight += e.weightKg;
  }
  const survivalFraction = totalWeight > 0 ? standingWeight / totalWeight : 1;

  return {
    originId: origin.id,
    originName: origin.name,
    ignited: [...ignition.keys()],
    timeline,
    vulnerable: timeline.filter((e) => e.vulnerable),
    survivalFraction: Math.max(0, survivalFraction),
  };
}

export function resilienceScore(objects, magnitude = 6) {
  const seismic = seismicStability(objects, magnitude);
  const fire = fireSpread(objects, null);
  const score = Math.round(
    100 * (0.55 * seismic.survivalProbability + 0.45 * fire.survivalFraction)
  );
  return {
    score,
    seismic: seismic,
    fire,
    detail: {
      seismicSurvivalPct: Math.round(seismic.survivalProbability * 100),
      fireSurvivalPct: Math.round(fire.survivalFraction * 100),
      totalElements: seismic.scores.length,
      vulnerableMaterials: fire.vulnerable.length,
    },
  };
}

export { defaultStructuralFor, MATERIALS };