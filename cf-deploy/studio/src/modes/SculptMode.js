import * as THREE from "three";
import { ensureIndexedGeometry } from "./MeshEditMode.js";

const _z = new THREE.Vector3(0, 0, 1);

export class SculptMode {
  static id = "SCULPT";
  static label = "Sculpt";

  constructor(ctx) {
    this.id = SculptMode.id;
    this.label = SculptMode.label;
    this.ctx = ctx;
    this.cursor = null;
    this.down = false;
    this.mesh = null;
    this.base = null;
    this.raycaster = new THREE.Raycaster();
  }

  get brush() { return this.ctx.state.sculpt; }

  onEnter() {
    this.ensureCursor();
    document.querySelectorAll("[data-sculpt-brush]").forEach((b) => {
      b.classList.toggle("active", b.dataset.sculptBrush === this.brush.brush);
    });
    if (this.ctx.dom.statusMode) this.ctx.dom.statusMode.textContent = "Mode: Sculpt";
    if (this.ctx.updateStatusBar) this.ctx.updateStatusBar();
  }

  onExit() {
    this.endHold();
    this.hideCursor();
    document.querySelectorAll("[data-sculpt-brush]").forEach((b) => b.classList.remove("active"));
    if (this.ctx.dom.statusMode) this.ctx.dom.statusMode.textContent = "Mode: Objet";
    if (this.ctx.updateStatusBar) this.ctx.updateStatusBar();
  }

  ensureCursor() {
    if (this.cursor) return;
    const g = this.cursor = new THREE.Group();
    g.name = "_sculptCursor";
    const mat = new THREE.MeshBasicMaterial({ color: 0x35b49c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), mat);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x35b49c, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthTest: false }));
    disc.position.z = -0.001;
    g.add(ring, disc);
    g.visible = false;
    g.renderOrder = 999;
    this.ctx.scene.add(g);
  }

  hideCursor() { if (this.cursor) this.cursor.visible = false; }

  setCursor(point, normal) {
    this.ensureCursor();
    const r = this.brush.radius / 100;
    this.cursor.position.copy(point).addScaledVector(normal, 0.004);
    this.cursor.quaternion.setFromUnitVectors(_z, normal.clone().normalize());
    this.cursor.scale.setScalar(r);
    this.cursor.visible = true;
  }

  screenPointer(event) {
    const bounds = this.ctx.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
  }

  pick(event) {
    this.raycaster.setFromCamera(this.screenPointer(event), this.ctx.camera);
    const targets = [];
    this.ctx.objectGroup.children.forEach((c) => {
      if (c.isMesh) targets.push(c);
      else if (c.isGroup) c.traverse((x) => { if (x.isMesh) targets.push(x); });
    });
    const hits = this.raycaster.intersectObjects(targets, false);
    return hits[0] || null;
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    const hit = this.pick(event);
    if (!hit) return;
    if (this.ctx.pushUndo) this.ctx.pushUndo();
    this.mesh = hit.object;
    this.mesh.geometry = ensureIndexedGeometry(this.mesh.geometry);
    this.down = true;
    this.base = hit.point.clone();
    this.setCursor(hit.point, hit.face?.normal || new THREE.Vector3(0, 1, 0));
    if (this.ctx.controls) this.ctx.controls.enabled = false;
    if (this.ctx.renderer.domElement.setPointerCapture) {
      try { this.ctx.renderer.domElement.setPointerCapture(event.pointerId); } catch (e) {}
    }
    this.stroke(hit);
  }

  onPointerMove(event) {
    const hit = this.pick(event);
    if (this.down && this.mesh && hit) {
      this.stroke(hit);
      this.setCursor(hit.point, hit.face?.normal || new THREE.Vector3(0, 1, 0));
      return true;
    }
    if (hit) this.setCursor(hit.point, hit.face?.normal || new THREE.Vector3(0, 1, 0));
    else this.hideCursor();
    return false;
  }

  onPointerUp(event) {
    this.endHold();
    if (this.ctx.renderer.domElement.releasePointerCapture) {
      try { this.ctx.renderer.domElement.releasePointerCapture(event.pointerId); } catch (e) {}
    }
  }

  endHold() {
    if (!this.down) return;
    this.down = false;
    this.mesh = null;
    this.base = null;
    if (this.ctx.controls) this.ctx.controls.enabled = true;
  }

  stroke(hit) {
    const b = this.brush;
    const mesh = this.mesh;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const radius = b.radius / 100;
    const strength = b.strength;
    const ws = new THREE.Vector3();
    mesh.getWorldScale(ws);
    const sAvg = (ws.x + ws.y + ws.z) / 3 || 1;
    const rL = radius / sAvg;

    let deltaL = null;
    if (b.brush === "grab") {
      const cur = mesh.worldToLocal(hit.point.clone());
      const baseL = mesh.worldToLocal(this.base.clone());
      deltaL = cur.sub(baseL);
      this.base.copy(hit.point);
    }
    const influence = b.brush === "grab" ? 1 : 0.06;

    const centers = [mesh.worldToLocal(hit.point.clone())];
    const deltas = [deltaL];
    if (b.symmetry) {
      centers.push(new THREE.Vector3(-centers[0].x, centers[0].y, centers[0].z));
      deltas.push(deltaL ? new THREE.Vector3(-deltaL.x, deltaL.y, deltaL.z) : null);
    }
    for (let p = 0; p < centers.length; p++) {
      const centerL = centers[p];
      const delta = deltas[p];
      geo.computeVertexNormals();
      const norm = geo.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
        const d = Math.sqrt((vx - centerL.x) ** 2 + (vy - centerL.y) ** 2 + (vz - centerL.z) ** 2);
        if (d >= rL) continue;
        const f = Math.pow(1 - d / rL, 2);
        let dx = 0, dy = 0, dz = 0;
        if (b.brush === "grab" && delta) {
          const k = f * strength;
          dx = delta.x * k; dy = delta.y * k; dz = delta.z * k;
        } else if (b.brush === "inflate") {
          const k = f * strength * influence;
          dx = norm.getX(i) * k; dy = norm.getY(i) * k; dz = norm.getZ(i) * k;
        } else if (b.brush === "crease") {
          const k = -f * strength * influence;
          dx = norm.getX(i) * k; dy = norm.getY(i) * k; dz = norm.getZ(i) * k;
        } else if (b.brush === "smooth") {
          let ax = 0, ay = 0, az = 0, n = 0;
          const rr = rL * 0.55;
          for (let j = 0; j < pos.count; j++) {
            if (j === i) continue;
            const nvx = pos.getX(j), nvy = pos.getY(j), nvz = pos.getZ(j);
            const nd = Math.sqrt((nvx - vx) ** 2 + (nvy - vy) ** 2 + (nvz - vz) ** 2);
            if (nd < rr) { ax += nvx; ay += nvy; az += nvz; n++; }
          }
          if (n) {
            const k = f * strength;
            dx = (ax / n - vx) * k; dy = (ay / n - vy) * k; dz = (az / n - vz) * k;
          } else continue;
        } else continue;
        pos.setXYZ(i, vx + dx, vy + dy, vz + dz);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
}