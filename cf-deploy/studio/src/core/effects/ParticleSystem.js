import * as THREE from "three";

const CFG = {
  snow: { count: 1200, color: 0xffffff, size: 0.35, opacity: 0.85, box: [14, 16, 14], vel: [0, -1.4, 0], jitter: [0.35, 0, 0.35] },
  rain: { count: 900, color: 0x9fc4e8, size: 0.12, opacity: 0.9, box: [9, 20, 9], vel: [0, -14, 0], jitter: [0.5, 0, 0.5] },
  fire: { count: 400, color: 0xff5500, size: 0.8, opacity: 0.9, box: [1.6, 8, 1.6], vel: [0, 2.2, 0], jitter: [0.6, 0, 0.6] },
  sparks: { count: 500, color: 0xffcc44, size: 0.16, opacity: 1, box: [1.6, 8, 1.6], vel: [0, 3.4, 0], jitter: [1.4, 1.2, 1.4] },
  smoke: { count: 300, color: 0x999999, size: 1.1, opacity: 0.35, box: [1.6, 8, 1.6], vel: [0, 1.1, 0], jitter: [0.5, 0, 0.5] },
};

export class ParticleSystem {
  constructor(scene, { getOrigin = () => null } = {}) {
    this.scene = scene;
    this.getOrigin = getOrigin;
    this.kind = "none";
    this.intensity = 1;
    this.points = null;
    this.velocities = null;
  }

  static kinds() {
    return Object.keys(CFG);
  }

  has(kind) {
    return kind === "fog" || Object.prototype.hasOwnProperty.call(CFG, kind);
  }

  clear() {
    this.kind = "none";
    this.clearPoints();
  }

  clearPoints() {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points.material.dispose();
      this.points = null;
    }
    this.velocities = null;
  }

  set(kind, intensity = 1) {
    this.intensity = intensity;
    this.kind = this.has(kind) ? kind : "none";
    this.clearPoints();
    if (this.kind !== "none") this.build();
  }

  build() {
    const kind = this.kind;
    const cfg = CFG[kind];
    if (!cfg) return;
    let ox = 0, oy = 0.5, oz = 0;
    const origin = this.getOrigin();
    if (origin) { ox = origin.x; oy = origin.y + 0.5; oz = origin.z; }
    const count = cfg.count;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      pos[idx] = ox + (Math.random() - 0.5) * cfg.box[0];
      pos[idx + 1] = oy + Math.random() * (cfg.box[1] * 0.3);
      pos[idx + 2] = oz + (Math.random() - 0.5) * cfg.box[2];
      this.velocities[idx] = cfg.vel[0] + (Math.random() - 0.5) * cfg.jitter[0];
      const vySign = cfg.vel[1] >= 0 ? 1 : -1;
      this.velocities[idx + 1] = vySign * Math.abs(cfg.vel[1]) * (0.6 + Math.random() * 0.8);
      if (cfg.jitter[1]) this.velocities[idx + 1] += (Math.random() - 0.5) * cfg.jitter[1];
      this.velocities[idx + 2] = cfg.vel[2] + (Math.random() - 0.5) * cfg.jitter[2];
    }
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: cfg.color,
      size: cfg.size,
      transparent: true,
      opacity: cfg.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geom, mat);
    points.userData.particleKind = kind;
    points.userData.origin = new THREE.Vector3(ox, oy, oz);
    points.userData.box = cfg.box;
    this.scene.add(points);
    this.points = points;
  }

  update(dt) {
    if (!this.points || !this.velocities) return;
    const kind = this.points.userData.particleKind;
    const pos = this.points.geometry.attributes.position.array;
    const count = pos.length / 3;
    const box = this.points.userData.box;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      pos[idx] += this.velocities[idx] * dt * this.intensity;
      pos[idx + 1] += this.velocities[idx + 1] * dt * this.intensity;
      pos[idx + 2] += this.velocities[idx + 2] * dt * this.intensity;
      if (kind === "snow" && pos[idx + 1] < 0) {
        pos[idx + 1] = box[1];
        pos[idx] = (Math.random() - 0.5) * box[0];
        pos[idx + 2] = (Math.random() - 0.5) * box[2];
      } else if (kind === "rain" && pos[idx + 1] < 0) {
        pos[idx + 1] = box[1];
      } else if ((kind === "fire" || kind === "smoke") && pos[idx + 1] > this.points.userData.origin.y + 6) {
        pos[idx] = this.points.userData.origin.x + (Math.random() - 0.5) * 1.2;
        pos[idx + 1] = this.points.userData.origin.y + 0.3 + Math.random() * 0.8;
        pos[idx + 2] = this.points.userData.origin.z + (Math.random() - 0.5) * 1.2;
      } else if (kind === "sparks" && pos[idx + 1] > this.points.userData.origin.y + 3) {
        pos[idx] = this.points.userData.origin.x + (Math.random() - 0.5) * 1.2;
        pos[idx + 1] = this.points.userData.origin.y + 0.3;
        pos[idx + 2] = this.points.userData.origin.z + (Math.random() - 0.5) * 1.2;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}