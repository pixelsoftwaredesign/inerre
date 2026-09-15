export const MATERIALS = {
  concrete: { label: "Béton", density: 2400, mpa: 25 },
  brick: { label: "Brique", density: 1900, mpa: 12 },
  wood: { label: "Bois", density: 650, mpa: 12 },
  steel: { label: "Acier", density: 7850, mpa: 250 },
  glass: { label: "Verre", density: 2500, mpa: 10 },
  stone: { label: "Pierre", density: 2600, mpa: 60 },
  foam: { label: "Mousse / textile", density: 80, mpa: 0.15 },
  plastic: { label: "Plastique", density: 950, mpa: 20 },
  ceramic: { label: "Céramique", density: 2300, mpa: 35 },
  lightAlloy: { label: "Métal léger", density: 1200, mpa: 70 },
};

const G = 9.81;

export const THRESHOLD_VIGILANCE = 0.15;
export const THRESHOLD_CRITIQUE = 0.3;

export const STATUS_COLORS = {
  ok: 0x2fbf71,
  vigilance: 0xf5a623,
  critique: 0xe5484d,
};

const NON_PORTEUR = new Set([
  "window", "door", "doorHandle", "windowHandle", "curtain", "cloth",
  "water", "gas", "particles", "plant", "tree", "flowerPot", "spotlight",
  "lamp", "tv", "cooktop", "sink", "toilet", "shower", "bathtub",
]);

const TYPE_MATERIAL = {
  wall: "concrete",
  stairs: "concrete",
  rock: "stone",
  tree: "wood",
  plant: "wood",
  custom: "lightAlloy",
  water: "glass",
  fridge: "steel",
  oven: "steel",
  washer: "steel",
  sink: "ceramic",
  toilet: "ceramic",
  bathtub: "ceramic",
  cooktop: "glass",
};

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

export function defaultStructuralFor(spec) {
  const type = spec?.type || "custom";
  const baseMaterial = TYPE_MATERIAL[type] || "wood";
  const porteur = !NON_PORTEUR.has(type);
  const overrides = (spec && spec.structural) || {};
  const mat = MATERIALS[overrides.material || baseMaterial] || MATERIALS.wood;
  return {
    material: overrides.material || baseMaterial,
    density: clamp(Number(overrides.density) || mat.density, 1, 30000),
    mpa: clamp(Number(overrides.mpa) || mat.mpa, 0.01, 1000),
    porteur: overrides.porteur != null ? Boolean(overrides.porteur) : porteur,
  };
}

export function bboxOf(spec) {
  const s = spec.scale || { x: 1, y: 1, z: 1 };
  const p = spec.position || { x: 0, y: 0, z: 0 };
  const sx = Math.abs(Number(s.x)) || 0.01;
  const sy = Math.abs(Number(s.y)) || 0.01;
  const sz = Math.abs(Number(s.z)) || 0.01;
  return {
    sx, sy, sz,
    minX: p.x - sx / 2, maxX: p.x + sx / 2,
    minY: p.y - sy / 2, maxY: p.y + sy / 2,
    minZ: p.z - sz / 2, maxZ: p.z + sz / 2,
  };
}

function overlapArea(a, b) {
  const ox = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const oz = Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
  return ox * oz;
}

const distance2d = (a, b) => {
  const ax = (a.minX + a.maxX) / 2;
  const az = (a.minZ + a.maxZ) / 2;
  const bx = (b.minX + b.maxX) / 2;
  const bz = (b.minZ + b.maxZ) / 2;
  return Math.hypot(ax - bx, az - bz);
};

export function analyze(objects, opts = {}) {
  const tol = opts.tolerance ?? 0.03;
  const maxGap = opts.maxGap ?? 0.2;
  const elements = [];

  for (const spec of objects || []) {
    if (!spec || !spec.id) continue;
    const bb = bboxOf(spec);
    const structural = defaultStructuralFor(spec);
    const volume = bb.sx * bb.sy * bb.sz;
    elements.push({
      id: spec.id,
      name: spec.name || spec.type || "objet",
      type: spec.type || "custom",
      material: structural.material,
      materialLabel: (MATERIALS[structural.material] || {}).label || structural.material,
      density: structural.density,
      mpa: structural.mpa,
      porteur: structural.porteur,
      volume,
      weightKg: volume * structural.density,
      area: Math.max(0.02, bb.sx * bb.sz),
      bb,
      supportId: null,
      supportOverlap: 0,
    });
  }

  for (const e of elements) {
    let best = null;
    let bestTop = -Infinity;
    let bestOverlap = 0;
    for (const s of elements) {
      if (e.id === s.id) continue;
      if (s.bb.maxY > e.bb.minY + tol) continue;
      const gap = e.bb.minY - s.bb.maxY;
      if (gap > maxGap) continue;
      const overlap = overlapArea(s.bb, e.bb);
      if (overlap <= 1e-4) continue;
      if (s.bb.maxY > bestTop + 1e-6 || (Math.abs(s.bb.maxY - bestTop) <= 1e-6 && overlap > bestOverlap)) {
        best = s;
        bestTop = s.bb.maxY;
        bestOverlap = overlap;
      }
    }
    if (best) {
      e.supportId = best.id;
      e.supportOverlap = bestOverlap;
    }
  }

  const memo = new Map();
  function totalFor(e) {
    if (memo.has(e.id)) return memo.get(e.id);
    let total = e.weightKg;
    for (const o of elements) {
      if (o.supportId === e.id) total += totalFor(o);
    }
    memo.set(e.id, total);
    return total;
  }

  const counts = { ok: 0, vigilance: 0, critique: 0 };
  let maxRatio = 0;
  let maxElement = null;
  let totalWeightKg = 0;

  for (const e of elements) {
    const loadKg = totalFor(e);
    const stressKpa = (loadKg * G) / e.area / 1000;
    const resistanceKpa = e.mpa * 10;
    const ratio = resistanceKpa > 0 ? stressKpa / resistanceKpa : 1;
    e.loadKg = loadKg;
    e.stressKpa = stressKpa;
    e.resistanceKpa = resistanceKpa;
    e.ratio = ratio;
    e.status = ratio >= THRESHOLD_CRITIQUE ? "critique" : ratio >= THRESHOLD_VIGILANCE ? "vigilance" : "ok";
    counts[e.status] += 1;
    totalWeightKg += e.weightKg;
    if (ratio > maxRatio) {
      maxRatio = ratio;
      maxElement = e;
    }
  }

  elements.sort((a, b) => b.ratio - a.ratio);

  const groundLoadKg = elements.filter((e) => !e.supportId).reduce((sum, e) => sum + e.loadKg, 0);

  return {
    aggregate: {
      count: elements.length,
      totalWeightKg,
      groundLoadKg,
      maxRatio,
      maxElement,
      counts,
      meanDensityKgM3: elements.length ? elements.reduce((sum, e) => sum + e.density, 0) / elements.length : 0,
    },
    elements,
  };
}

export function fireResistanceMinutes(material) {
  const table = {
    concrete: 120,
    brick: 120,
    stone: 180,
    steel: 60,
    wood: 45,
    glass: 20,
    foam: 5,
    plastic: 10,
    ceramic: 60,
    lightAlloy: 30,
  };
  return table[material] ?? 30;
}

export function seismicPga(magnitude) {
  return clamp(0.02 * Math.pow(10, (magnitude - 4.5) * 0.4), 0.02, 1.2);
}

export { distance2d };