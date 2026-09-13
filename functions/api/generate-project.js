const LLM_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

const SYSTEM_PROMPT = `Tu es un architecte d'interieur IA. Reponds UNIQUEMENT avec un JSON valide, sans texte avant/apres.

Genere un projet 3D complet a partir de la description utilisateur.
Le JSON doit respecter EXACTEMENT cette structure:
{
  "project_name": "nom court du projet",
  "style": "american | european | industrial | mediterranean",
  "spaces": [
    {
      "id": "identifiant unique",
      "type": "living_room | kitchen | bedroom | bathroom | office | dining_room | hallway",
      "bounds_2d": [[x1,z1], [x1,z2], [x2,z2], [x2,z1]],
      "elements": [
        { "type": "type_meuble", "x": 1.0, "z": 1.0, "rotation_y": 0, "scale": {"x":1,"y":1,"z":1} }
      ]
    }
  ],
  "walls": [
    { "start": [x1,z1], "end": [x2,z2], "thickness": 0.3, "height": 2.8, "type": "exterior | interior" }
  ]
}

Types meubles reconnus: sofa, armchair, coffeeTable, diningTable, diningChair, bed, wardrobe, nightstand, desk, bookshelf, officeChair, plant, lamp, tvUnit, tv, fridge, oven, table, bench, pouf, curtain, stairs, toilet, sink, bathtub, shower, flowerPot.
Ne renvoie que le JSON, rien d'autre.
Utilise exactement les memes noms de types meubles.
bounds_2d doit etre un polygone ferme (4+ points). Les coordonnees sont en metres.`;

const FURNITURE_MAP = [
  ["sofa", ["canap", "divan", "sofa", "couch"]],
  ["armchair", ["fauteuil", "armchair", "bergere"]],
  ["bed", ["lit", "bed"]],
  ["diningTable", ["table manger", "dining table", "table de cuisine"]],
  ["diningChair", ["chaise", "dining chair", "chaise de cuisine"]],
  ["desk", ["bureau", "desk"]],
  ["table", ["table"]],
  ["lamp", ["lampe", "lamp", "lampadaire"]],
  ["wardrobe", ["armoire", "wardrobe", "placard"]],
  ["tvUnit", ["meuble tv", "tv unit"]],
  ["tv", ["television", "tv"]],
  ["fridge", ["frigo", "fridge", "refrigerateur"]],
  ["oven", ["four", "oven"]],
  ["toilet", ["wc", "toilette", "toilet"]],
  ["sink", ["lavabo", "evier", "sink"]],
  ["shower", ["douche", "shower"]],
  ["bathtub", ["baignoire", "bain", "bathtub"]],
  ["plant", ["plante", "plant"]],
  ["bookshelf", ["bibliotheque", "bookshelf", "etagere"]],
  ["officeChair", ["chaise bureau", "office chair"]],
  ["nightstand", ["chevet", "nightstand", "table nuit"]],
];

function detectFurnitureType(text) {
  const lower = text.toLowerCase();
  for (const [key, words] of FURNITURE_MAP) {
    if (words.some((w) => lower.includes(w))) return key;
  }
  return "box";
}

function fallbackBlueprint(prompt, style) {
  const furnitureType = detectFurnitureType(prompt);
  return {
    project_name: prompt.slice(0, 30),
    style,
    spaces: [
      {
        id: "main",
        type: "living_room",
        bounds_2d: [[0, 0], [6, 0], [6, 5], [0, 5]],
        elements: [{ type: furnitureType, x: 3, z: 2.5, rotation_y: 0, scale: { x: 1, y: 1, z: 1 } }],
      },
    ],
    walls: [
      { start: [0, 0], end: [0, 5], thickness: 0.2, height: 2.8, type: "exterior" },
      { start: [0, 5], end: [6, 5], thickness: 0.2, height: 2.8, type: "exterior" },
      { start: [6, 5], end: [6, 0], thickness: 0.2, height: 2.8, type: "exterior" },
      { start: [6, 0], end: [0, 0], thickness: 0.2, height: 2.8, type: "exterior" },
    ],
  };
}

async function generateSingleVariant(prompt, apiKey, style, temperature) {
  const token = apiKey || process.env.HF_TOKEN || "";
  if (!token) return null;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const data = JSON.stringify({
    inputs: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    parameters: { max_new_tokens: 2048, temperature, return_full_text: false },
  });
  const url = `https://api-inference.huggingface.co/models/${LLM_MODEL}/v1/chat/completions`;
  try {
    const resp = await fetch(url, { method: "POST", headers, body: data });
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`LLM variant (t=${temperature}) failed: ${resp.status} ${err}`);
      return null;
    }
    const body = await resp.json();
    const content = body?.choices?.[0]?.message?.content || "";
    const match = content.match(/\{.*\}/s);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.style) parsed.style = style;
    if (!parsed.spaces) {
      parsed.spaces = [
        {
          id: "main",
          type: "living_room",
          bounds_2d: [[0, 0], [6, 0], [6, 5], [0, 5]],
          elements: [{ type: detectFurnitureType(prompt), x: 3, z: 2.5, rotation_y: 0 }],
        },
      ];
    }
    return parsed;
  } catch (e) {
    console.error(`LLM variant (t=${temperature}) failed: ${e}`);
    return null;
  }
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  const data = await request.json().catch(() => ({}));
  if (!data.prompt) {
    return new Response(JSON.stringify({ error: "Missing prompt" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const prompt = data.prompt;
  const apiKey = data.apiKey || "";
  const style = data.style || "american";
  const variantCount = Math.min(Number(data.variant_count) || 3, 3);
  const temps = [0.3, 0.7, 1.0];

  const settled = await Promise.allSettled(
    Array.from({ length: variantCount }, (_, i) =>
      generateSingleVariant(prompt, apiKey, style, temps[i])
    )
  );
  let variants = settled.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value);

  if (variants.length === 0) {
    variants = Array.from({ length: variantCount }, () => fallbackBlueprint(prompt, style));
  }

  return new Response(JSON.stringify({ variants }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}