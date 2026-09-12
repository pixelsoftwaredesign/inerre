# PixelSoftwareDesign2026@
import os, sys, json, io, urllib.request, re, concurrent.futures

from flask import Flask, request, send_file, send_from_directory

app = Flask(__name__, static_folder=".", static_url_path="")

TEXT_TO_3D_MODELS = [
    "Tencent/Hunyuan3D-2",
    "stabilityai/TripoSR",
]

# LLM model for structured JSON project generation
LLM_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"

# Prompt template that enforces the JSON blueprint schema
SYSTEM_PROMPT = """Tu es un architecte d'interieur IA. Reponds UNIQUEMENT avec un JSON valide, sans texte avant/apres.

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
bounds_2d doit etre un polygone ferme (4+ points). Les coordonnees sont en metres.
"""

def run_hf_generation(prompt: str, api_key=None):
    token = api_key or os.environ.get("HF_TOKEN", "")
    if not token:
        return None
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    data = json.dumps({"inputs": prompt}).encode()
    for model in TEXT_TO_3D_MODELS:
        url = f"https://api-inference.huggingface.co/models/{model}"
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
                ct = resp.headers.get("Content-Type", "")
                if "json" in ct:
                    j = json.loads(body)
                    if "error" in j:
                        print(f"HF {model} error: {j['error']}", file=sys.stderr)
                        continue
                    if "glb" in j:
                        import base64
                        body = base64.b64decode(j["glb"])
                    else:
                        continue
                if len(body) > 500:
                    print(f"HF {model} success: {len(body)} bytes", file=sys.stderr)
                    return body
        except Exception as e:
            print(f"HF {model} failed: {e}", file=sys.stderr)
            continue
    return None

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.get_json(silent=True)
    if not data or not data.get("prompt"):
        return {"error": "Missing prompt"}, 400
    prompt = data["prompt"]
    api_key = data.get("apiKey", "")
    blob = run_hf_generation(prompt, api_key)
    if blob:
        return send_file(
            io.BytesIO(blob),
            mimetype="model/gltf-binary",
            as_attachment=False,
        )
    return {"error": "Aucun modele genere"}, 500

def generate_single_variant(prompt: str, api_key: str, style: str, temperature: float):
    """Generate a single blueprint variant at the given temperature."""
    token = api_key or os.environ.get("HF_TOKEN", "")
    if not token:
        return fallback_blueprint(prompt, style)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    data = json.dumps({
        "inputs": messages,
        "parameters": {
            "max_new_tokens": 2048,
            "temperature": temperature,
            "return_full_text": False,
        },
    })
    url = f"https://api-inference.huggingface.co/models/{LLM_MODEL}/v1/chat/completions"
    try:
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read())
            content = body["choices"][0]["message"]["content"]
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
                if not parsed.get("style"):
                    parsed["style"] = style
                if not parsed.get("spaces"):
                    parsed["spaces"] = [{
                        "id": "main",
                        "type": "living_room",
                        "bounds_2d": [[0, 0], [6, 0], [6, 5], [0, 5]],
                        "elements": [{"type": detect_furniture_type(prompt), "x": 3, "z": 2.5, "rotation_y": 0}]
                    }]
                return parsed
    except Exception as e:
        print(f"LLM variant (t={temperature}) failed: {e}", file=sys.stderr)
    return None

def fallback_blueprint(prompt, style):
    furniture_type = detect_furniture_type(prompt)
    return {
        "project_name": prompt[:30],
        "style": style,
        "spaces": [{
            "id": "main",
            "type": "living_room",
            "bounds_2d": [[0, 0], [6, 0], [6, 5], [0, 5]],
            "elements": [{"type": furniture_type, "x": 3, "z": 2.5, "rotation_y": 0, "scale": {"x": 1, "y": 1, "z": 1}}]
        }],
        "walls": [
            {"start": [0, 0], "end": [0, 5], "thickness": 0.2, "height": 2.8, "type": "exterior"},
            {"start": [0, 5], "end": [6, 5], "thickness": 0.2, "height": 2.8, "type": "exterior"},
            {"start": [6, 5], "end": [6, 0], "thickness": 0.2, "height": 2.8, "type": "exterior"},
            {"start": [6, 0], "end": [0, 0], "thickness": 0.2, "height": 2.8, "type": "exterior"},
        ],
    }

@app.route("/api/generate-project", methods=["POST"])
def generate_project():
    data = request.get_json(silent=True)
    if not data or not data.get("prompt"):
        return {"error": "Missing prompt"}, 400
    prompt = data["prompt"]
    api_key = data.get("apiKey", "")
    style = data.get("style", "american")
    variant_count = min(data.get("variant_count", 3), 3)

    temps = [0.3, 0.7, 1.0]

    # Generate variants in parallel
    variants = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=variant_count) as executor:
        futures = [
            executor.submit(generate_single_variant, prompt, api_key, style, temps[i])
            for i in range(variant_count)
        ]
        for f in futures:
            bp = f.result()
            if bp:
                variants.append(bp)

    # If no LLM variant succeeded, use fallback for each
    if not variants:
        for i in range(variant_count):
            variants.append(fallback_blueprint(prompt, style))

    return {"variants": variants}, 200

def detect_furniture_type(text):
    lower = text.lower()
    mapping = [
        ("sofa", ["canap", "divan", "sofa", "couch"]),
        ("armchair", ["fauteuil", "armchair", "bergere"]),
        ("bed", ["lit", "bed"]),
        ("diningTable", ["table manger", "dining table", "table de cuisine"]),
        ("diningChair", ["chaise", "dining chair", "chaise de cuisine"]),
        ("desk", ["bureau", "desk"]),
        ("table", ["table"]),
        ("lamp", ["lampe", "lamp", "lampadaire"]),
        ("wardrobe", ["armoire", "wardrobe", "placard"]),
        ("tvUnit", ["meuble tv", "tv unit"]),
        ("tv", ["television", "tv"]),
        ("fridge", ["frigo", "fridge", "refrigerateur"]),
        ("oven", ["four", "oven"]),
        ("toilet", ["wc", "toilette", "toilet"]),
        ("sink", ["lavabo", "evier", "sink"]),
        ("shower", ["douche", "shower"]),
        ("bathtub", ["baignoire", "bain", "bathtub"]),
        ("plant", ["plante", "plant"]),
        ("bookshelf", ["bibliotheque", "bookshelf", "etagere"]),
        ("officeChair", ["chaise bureau", "office chair"]),
        ("nightstand", ["chevet", "nightstand", "table nuit"]),
    ]
    for key, words in mapping:
        if any(w in lower for w in words):
            return key
    return "box"

@app.route("/api/health")
def health():
    return {"status": "ok", "models": TEXT_TO_3D_MODELS, "llm": LLM_MODEL}

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    print(f"AI Server: http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, threaded=True, debug=False)
