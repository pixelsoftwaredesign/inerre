import * as THREE from "three";

export class MeshEditMode {
  static id = "MESH_EDIT";
  static label = "Mesh Edit";

  constructor(ctx) {
    this.id = MeshEditMode.id;
    this.label = MeshEditMode.label;
    this.ctx = ctx;
    this.subHelperGroup = null;
    this.subProxy = null;
    this.subData = null;
    this.subProxyStart = null;
  }

  get state() { return this.ctx.state; }

  onEnter() {
    this.initSubHelpers();
    const lvl = this.state.subObjectLevel;
    document.querySelectorAll("[data-mesh-sel]").forEach((b) => {
      b.classList.toggle("active", b.dataset.meshSel === lvl);
    });
    if (this.ctx.dom.statusMode) this.ctx.dom.statusMode.textContent = "Mode: Mesh Edit";
    if (this.ctx.updateStatusBar) this.ctx.updateStatusBar();
  }

  onExit() {
    this.exitSubObjectMode(true);
    document.querySelectorAll("[data-mesh-sel]").forEach((b) => b.classList.remove("active"));
    if (this.ctx.dom.statusMode) this.ctx.dom.statusMode.textContent = "Mode: Objet";
    if (this.ctx.updateStatusBar) this.ctx.updateStatusBar();
  }

  update(_dt, _t) { /* transforms handled by THREE TransformControls */ }

  initSubHelpers() {
    if (this.subHelperGroup) return;
    this.subHelperGroup = new THREE.Group();
    this.subHelperGroup.name = "_subHelpers";
    this.ctx.scene.add(this.subHelperGroup);
    this.subProxy = new THREE.Object3D();
    this.subProxy.userData.subMarker = true;
    this.ctx.scene.add(this.subProxy);
  }

  enterSubMode(level) {
    this.initSubHelpers();
    this.exitSubObjectMode(false);
    const mesh = this.getSelectedMesh();
    if (!mesh) {
      if (this.ctx.setStatusInfo) this.ctx.setStatusInfo("Sélectionne d'abord un objet 3D");
      return;
    }
    mesh.geometry = ensureIndexedGeometry(mesh.geometry);
    this.subData = buildSubData(mesh, level);
    this.rebuildSubMarkers();
    this.state.subObjectLevel = level;
    this.ctx.transformControls.setTranslationSnap(null);
    if (this.ctx.setStatusInfo) this.ctx.setStatusInfo(`Mode ${level}: clique sur le maillage pour sélectionner, puis déplace avec W`);
    if (this.ctx.updateStatusBar) this.ctx.updateStatusBar();
  }

  exitSubObjectMode(clearButtons = true) {
    if (this.subHelperGroup) this.subHelperGroup.clear();
    if (this.ctx.transformControls.object?.userData.subMarker) this.ctx.transformControls.detach();
    this.subData = null;
    this.subProxyStart = null;
    if (clearButtons && this.state.subObjectLevel !== "object") {
      this.state.subObjectLevel = "object";
      document.querySelectorAll("[data-subobj]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.subobj === "object");
      });
    }
  }

  getSelectedMesh() {
    const id = this.state.selectedIds[0];
    if (!id) return null;
    const obj = this.ctx.objectGroup.children.find((c) => c.userData.id === id);
    if (!obj) return null;
    let mesh = null;
    obj.traverse((child) => { if (child.isMesh) mesh = child; });
    return mesh;
  }

  featureWorldPosition() {
    if (!this.subData || this.subData.selected == null) return null;
    const { mesh, unique, tris, edges, selected, selType } = this.subData;
    const local = new THREE.Vector3();
    if (selType === "vertex") local.copy(unique[selected].pos);
    else if (selType === "edge") {
      const ed = edges[selected];
      local.addVectors(unique[ed.a].pos, unique[ed.b].pos).multiplyScalar(0.5);
    } else {
      const tri = tris[selected];
      tri.forEach((u) => local.add(unique[u].pos));
      local.divideScalar(3);
    }
    return mesh.localToWorld(local);
  }

  attachSubProxy() {
    if (!this.subData || this.subData.selected == null) return;
    const worldPos = this.featureWorldPosition();
    if (!worldPos) return;
    this.subProxy.position.copy(worldPos);
    this.subProxyStart = worldPos.clone();
    this.ctx.transformControls.attach(this.subProxy);
    this.ctx.transformControls.mode = "translate";
  }

  distPointToSegment(p, a, b) {
    const ab = b.clone().sub(a);
    const ap = p.clone().sub(a);
    const t = Math.max(0, Math.min(1, ap.dot(ab) / (ab.lengthSq() || 1)));
    return p.distanceTo(a.clone().add(ab.multiplyScalar(t)));
  }

  pickFeature(event) {
    if (!this.subData) return;
    if (this.ctx.transformControls.object?.userData.subMarker) return;
    const mesh = this.subData.mesh;
    if (!mesh.visible) return;
    const bounds = this.ctx.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.ctx.camera);
    const hits = raycaster.intersectObject(mesh, false);
    if (!hits.length) return;
    const hit = hits[0];
    const lp = mesh.worldToLocal(hit.point.clone());
    const faceIndex = hit.faceIndex;
    const { unique, tris } = this.subData;
    const mode = this.subData.mode;
    if (mode === "face") {
      this.subData.selected = Math.floor(faceIndex / 3);
      this.subData.selType = "face";
    } else if (mode === "vertex") {
      const tri = tris[Math.floor(faceIndex / 3)];
      let best = tri[0], bd = Infinity;
      for (const u of tri) {
        const d = unique[u].pos.distanceTo(lp);
        if (d < bd) { bd = d; best = u; }
      }
      this.subData.selected = best;
      this.subData.selType = "vertex";
    } else {
      const tri = tris[Math.floor(faceIndex / 3)];
      let bestKey = null, bd = Infinity;
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const rec = this.subData.edges[this.subData.edgeByKey.get(key)];
        const d = this.distPointToSegment(lp, unique[rec.a].pos, unique[rec.b].pos);
        if (d < bd) { bd = d; bestKey = key; }
      }
      this.subData.selected = this.subData.edgeByKey.get(bestKey);
      this.subData.selType = "edge";
    }
    this.attachSubProxy();
    this.rebuildSubMarkers();
  }

  applyDrag() {
    if (!this.subData || this.subData.selected == null || !this.subProxyStart) return;
    const { mesh, unique, tris, edges, selected, selType } = this.subData;
    const worldPos = this.subProxy.position;
    const deltaWorld = worldPos.clone().sub(this.subProxyStart);
    const a = mesh.worldToLocal(deltaWorld.clone());
    const b = mesh.worldToLocal(new THREE.Vector3(0, 0, 0));
    const deltaLocal = a.sub(b);
    this.subProxyStart.copy(worldPos);
    const pos = mesh.geometry.attributes.position;
    const each = [];
    if (selType === "vertex") each.push(selected);
    else if (selType === "edge") each.push(edges[selected].a, edges[selected].b);
    else each.push(...tris[selected]);
    for (const u of each) {
      unique[u].pos.add(deltaLocal);
      for (const i of unique[u].idxs) {
        pos.setXYZ(i, unique[u].pos.x, unique[u].pos.y, unique[u].pos.z);
      }
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.rebuildSubMarkers();
  }

  rebuildSubMarkers() {
    if (!this.subHelperGroup || !this.subData) return;
    const { mesh, mode, unique, tris, edges, selected } = this.subData;
    this.subHelperGroup.clear();
    if (unique.length > 4000) return;
    const dot = new THREE.MeshBasicMaterial({ color: 0x35b49c, transparent: true, opacity: 0.9 });
    const selDot = new THREE.MeshBasicMaterial({ color: 0xffb74d });
    const addDot = (localPos, sel, r) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), sel ? selDot : dot);
      s.position.copy(mesh.localToWorld(localPos.clone()));
      s.userData.subMarker = true;
      this.subHelperGroup.add(s);
    };
    if (mode === "vertex") {
      unique.forEach((u, i) => addDot(u.pos, i === selected, i === selected ? 0.12 : 0.05));
    } else if (mode === "edge") {
      edges.forEach((ed, i) => {
        const mid = unique[ed.a].pos.clone().add(unique[ed.b].pos).multiplyScalar(0.5);
        addDot(mid, i === selected, i === selected ? 0.12 : 0.05);
      });
    } else {
      tris.forEach((t, i) => {
        const c = new THREE.Vector3();
        t.forEach((u) => c.add(unique[u].pos));
        c.divideScalar(3);
        addDot(c, i === selected, i === selected ? 0.16 : 0.07);
      });
    }
  }

  extrudeSelectedFace(dist = 0.3) {
    if (!this.subData || this.subData.selType !== "face" || this.subData.selected == null) return false;
    const { mesh, unique, tris, selected } = this.subData;
    const geo = mesh.geometry;
    const oldPos = geo.attributes.position;
    const count = oldPos.count;
    const tri = tris[selected];
    const a = unique[tri[0]].pos, b = unique[tri[1]].pos, c = unique[tri[2]].pos;
    const ab = b.clone().sub(a), ac = c.clone().sub(a);
    const normal = ab.cross(ac).normalize();
    const newArr = new Float32Array((count + 3) * 3);
    newArr.set(oldPos.array);
    const capIdx = [];
    tri.forEach((u, i) => {
      const q = unique[u].pos;
      const bi = (count + i) * 3;
      newArr[bi] = q.x + normal.x * dist;
      newArr[bi + 1] = q.y + normal.y * dist;
      newArr[bi + 2] = q.z + normal.z * dist;
      capIdx.push(count + i);
    });
    geo.setAttribute("position", new THREE.BufferAttribute(newArr, 3));
    const idx = [...geo.index.array];
    idx.push(capIdx[0], capIdx[1], capIdx[2]);
    for (let e = 0; e < 3; e++) {
      const oa = unique[tri[e]].idxs[0];
      const ob = unique[tri[(e + 1) % 3]].idxs[0];
      const na = capIdx[e], nb = capIdx[(e + 1) % 3];
      idx.push(oa, ob, na, ob, nb, na);
    }
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const oldTris = tris.length;
    if (this.ctx.pushUndo) this.ctx.pushUndo();
    this.subData = buildSubData(mesh, "face");
    this.subData.selected = oldTris;
    this.subData.selType = "face";
    this.attachSubProxy();
    this.rebuildSubMarkers();
    return true;
  }
}

export function ensureIndexedGeometry(geo) {
  if (geo.index) return geo;
  const pos = geo.attributes.position;
  const seen = new Map();
  const verts = [];
  const order = [];
  const p = new Array(3);
  for (let i = 0; i < pos.count; i++) {
    p[0] = pos.getX(i); p[1] = pos.getY(i); p[2] = pos.getZ(i);
    const k = `${p[0].toFixed(5)},${p[1].toFixed(5)},${p[2].toFixed(5)}`;
    if (seen.has(k)) order.push(seen.get(k));
    else {
      seen.set(k, verts.length / 3);
      verts.push(p[0], p[1], p[2]);
      order.push(verts.length / 3 - 1);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  out.setIndex(order);
  out.computeVertexNormals();
  return out;
}

export function buildSubData(mesh, mode) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const idxArr = geo.index.array;
  const uidOf = new Map();
  const unique = [];
  const order = [];
  const p = new Array(3);
  for (let i = 0; i < pos.count; i++) {
    p[0] = pos.getX(i); p[1] = pos.getY(i); p[2] = pos.getZ(i);
    const k = `${p[0].toFixed(5)},${p[1].toFixed(5)},${p[2].toFixed(5)}`;
    if (uidOf.has(k)) order.push(uidOf.get(k));
    else {
      uidOf.set(k, unique.length);
      unique.push({ pos: new THREE.Vector3(p[0], p[1], p[2]), idxs: [i] });
      order.push(unique.length - 1);
    }
  }
  const tris = [];
  for (let i = 0; i < idxArr.length; i += 3) {
    const t = [order[idxArr[i]], order[idxArr[i + 1]], order[idxArr[i + 2]]];
    tris.push(t);
    t.forEach((u) => {
      const rec = unique[u];
      const ui = idxArr[i + (t.indexOf(u))];
      if (!rec.idxs.includes(ui)) rec.idxs.push(ui);
    });
  }
  const edges = [];
  const edgeByKey = new Map();
  tris.forEach((t) => {
    for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3];
      const keyEdge = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgeByKey.has(keyEdge)) {
        edgeByKey.set(keyEdge, edges.length);
        edges.push({ a, b, idx: edges.length, key: keyEdge });
      }
    }
  });
  return { mesh, mode, pos, unique, tris, edges, edgeByKey, selected: null, selType: null, dirty: false };
}