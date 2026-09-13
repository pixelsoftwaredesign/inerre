const TEXT_TO_3D_MODELS = ["Tencent/Hunyuan3D-2", "stabilityai/TripoSR"];

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
  const token = data.apiKey || process.env.HF_TOKEN || "";
  if (!token) {
    return new Response(JSON.stringify({ error: "Aucun modele genere" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({ inputs: data.prompt });

  for (const model of TEXT_TO_3D_MODELS) {
    const url = `https://api-inference.huggingface.co/models/${model}`;
    try {
      const resp = await fetch(url, { method: "POST", headers, body });
      if (!resp.ok) {
        console.error(`HF ${model} error: ${resp.status}`);
        continue;
      }
      const ct = resp.headers.get("Content-Type") || "";
      let buf = await resp.arrayBuffer();
      if (ct.includes("json")) {
        const j = JSON.parse(new TextDecoder().decode(buf));
        if (j.error) {
          console.error(`HF ${model} error: ${j.error}`);
          continue;
        }
        if (j.glb) {
          const b64 = j.glb;
          const bin = atob(b64);
          buf = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        } else {
          continue;
        }
      }
      if (buf.byteLength > 500) {
        console.log(`HF ${model} success: ${buf.byteLength} bytes`);
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": "model/gltf-binary",
            "Cache-Control": "no-cache",
          },
        });
      }
    } catch (e) {
      console.error(`HF ${model} failed: ${e}`);
    }
  }
  return new Response(JSON.stringify({ error: "Aucun modele genere" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}