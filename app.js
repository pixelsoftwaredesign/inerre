// PixelSoftwareDesign2026@
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CSG } from "three-csg-ts";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

// ============================================================
// 1. Noyau Mathématique Vectoriel 2D
// ============================================================

class Vector2D {
  constructor(x, y) { this.x = x; this.y = y; }
  add(v) { return new Vector2D(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vector2D(this.x - v.x, this.y - v.y); }
  scale(s) { return new Vector2D(this.x * s, this.y * s); }
  dot(v) { return this.x * v.x + this.y * v.y; }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
  distanceTo(v) { return this.sub(v).length(); }
  normalize() { const l = this.length(); return l > 0 ? this.scale(1 / l) : new Vector2D(0, 0); }
  lerp(v, t) { return new Vector2D(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t); }
  clone() { return new Vector2D(this.x, this.y); }
  toJSON() { return { x: Math.round(this.x * 1000) / 1000, y: Math.round(this.y * 1000) / 1000 }; }
}

class Bounds2D {
  constructor(min, max) { this.min = min; this.max = max; }
  get width() { return this.max.x - this.min.x; }
  get height() { return this.max.y - this.min.y; }
  get center() { return new Vector2D((this.min.x + this.max.x) / 2, (this.min.y + this.max.y) / 2); }
  contains(p) { return p.x >= this.min.x && p.x <= this.max.x && p.y >= this.min.y && p.y <= this.max.y; }
  expand(p) {
    this.min.x = Math.min(this.min.x, p.x); this.min.y = Math.min(this.min.y, p.y);
    this.max.x = Math.max(this.max.x, p.x); this.max.y = Math.max(this.max.y, p.y);
  }
}

class VectorShape {
  constructor(type, id) { this.type = type; this.id = id; }
  getBounds() { throw new Error("Abstract"); }
  getPoints(segments) { throw new Error("Abstract"); }
  isClosed() { return false; }
}

class PointShape extends VectorShape {
  constructor(p) { super("point", crypto.randomUUID()); this.p = p; }
  getBounds() { return new Bounds2D(this.p, this.p); }
  getPoints() { return [this.p]; }
}

class LineShape extends VectorShape {
  constructor(start, end) { super("line", crypto.randomUUID()); this.start = start; this.end = end; }
  getBounds() {
    return new Bounds2D(
      new Vector2D(Math.min(this.start.x, this.end.x), Math.min(this.start.y, this.end.y)),
      new Vector2D(Math.max(this.start.x, this.end.x), Math.max(this.start.y, this.end.y))
    );
  }
  getPoints(seg) { return [this.start, this.end]; }
  length() { return this.start.distanceTo(this.end); }
}

class RectShape extends VectorShape {
  constructor(a, b) { super("rectangle", crypto.randomUUID()); this.a = a; this.b = b; }
  getBounds() {
    return new Bounds2D(
      new Vector2D(Math.min(this.a.x, this.b.x), Math.min(this.a.y, this.b.y)),
      new Vector2D(Math.max(this.a.x, this.b.x), Math.max(this.a.y, this.b.y))
    );
  }
  getPoints(seg) {
    const { min, max } = this.getBounds();
    return [min, new Vector2D(max.x, min.y), max, new Vector2D(min.x, max.y)];
  }
  isClosed() { return true; }
}

class CircleShape extends VectorShape {
  constructor(center, radius) { super("circle", crypto.randomUUID()); this.center = center; this.radius = radius; }
  getBounds() {
    return new Bounds2D(
      new Vector2D(this.center.x - this.radius, this.center.y - this.radius),
      new Vector2D(this.center.x + this.radius, this.center.y + this.radius)
    );
  }
  getPoints(seg) {
    seg = seg || 32;
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(new Vector2D(this.center.x + Math.cos(a) * this.radius, this.center.y + Math.sin(a) * this.radius));
    }
    return pts;
  }
  isClosed() { return true; }
}

class ArcShape extends VectorShape {
  constructor(p0, cp, p1) { super("arc", crypto.randomUUID()); this.p0 = p0; this.cp = cp; this.p1 = p1; }
  getBounds() {
    const b = new Bounds2D(this.p0, this.p0);
    b.expand(this.p1); if (this.cp) b.expand(this.cp);
    return b;
  }
  getPoints(seg) {
    seg = seg || 16;
    const pts = [this.p0];
    if (this.cp) {
      for (let i = 1; i <= seg; i++) {
        const t = i / seg;
        const mt = 1 - t;
        pts.push(new Vector2D(
          mt * mt * this.p0.x + 2 * mt * t * this.cp.x + t * t * this.p1.x,
          mt * mt * this.p0.y + 2 * mt * t * this.cp.y + t * t * this.p1.y
        ));
      }
    } else {
      pts.push(this.p1);
    }
    return pts;
  }
}

class ProfileShape extends VectorShape {
  constructor() { super("profile", crypto.randomUUID()); this.points = []; }
  addPoint(p) { this.points.push(p); }
  getBounds() {
    if (!this.points.length) return new Bounds2D(new Vector2D(0, 0), new Vector2D(0, 0));
    const b = new Bounds2D(this.points[0], this.points[0]);
    this.points.forEach(p => b.expand(p));
    return b;
  }
  getPoints(seg) { return [...this.points]; }
}

// ============================================================
// 2. VectorPath — Chemin vectoriel
// ============================================================

class VectorPath {
  constructor() { this.shapes = []; this.isClosed = false; }
  addShape(shape) { this.shapes.push(shape); }
  getPoints(segmentsPerCurve) {
    segmentsPerCurve = segmentsPerCurve || 10;
    const pts = [];
    for (const shape of this.shapes) {
      const shapePts = shape.getPoints(segmentsPerCurve);
      for (const p of shapePts) pts.push(p);
    }
    return pts;
  }
  getBounds() {
    if (!this.shapes.length) return new Bounds2D(new Vector2D(0, 0), new Vector2D(0, 0));
    const b = this.shapes[0].getBounds();
    for (let i = 1; i < this.shapes.length; i++) {
      const sb = this.shapes[i].getBounds();
      b.expand(sb.min); b.expand(sb.max);
    }
    return b;
  }
}

// ============================================================
// 3. Noyau 3D — Vector3D, Vertex3D, Mesh3D (Indexed Mesh)
// ============================================================

class Vector3D {
  constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
  add(v) { return new Vector3D(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return new Vector3D(this.x - v.x, this.y - v.y, this.z - v.z); }
  scale(s) { return new Vector3D(this.x * s, this.y * s, this.z * s); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) {
    return new Vector3D(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  normalize() { const l = this.length(); return l > 0 ? this.scale(1 / l) : new Vector3D(0, 0, 0); }
  clone() { return new Vector3D(this.x, this.y, this.z); }
  toArray() { return [this.x, this.y, this.z]; }
}

class Vertex3D {
  constructor(position, normal, uv) {
    this.position = position || new Vector3D(0, 0, 0);
    this.normal = normal || new Vector3D(0, 0, 0);
    this.uv = uv || new Vector2D(0, 0);
  }
  clone() { return new Vertex3D(this.position.clone(), this.normal.clone(), this.uv.clone()); }
}

class Mesh3D {
  constructor() { this.vertices = []; this.indices = []; }

  addVertex(v) { const idx = this.vertices.length; this.vertices.push(v); return idx; }
  addTriangle(a, b, c) { this.indices.push(a, b, c); }
  addQuad(a, b, c, d) { this.indices.push(a, b, c, c, d, a); }

  computeSmoothNormals() {
    const normals = this.vertices.map(() => new Vector3D(0, 0, 0));
    const counts = new Array(this.vertices.length).fill(0);
    for (let i = 0; i < this.indices.length; i += 3) {
      const ia = this.indices[i], ib = this.indices[i + 1], ic = this.indices[i + 2];
      const va = this.vertices[ia].position, vb = this.vertices[ib].position, vc = this.vertices[ic].position;
      const edge1 = vb.sub(va), edge2 = vc.sub(va);
      const fn = edge1.cross(edge2).normalize();
      for (const idx of [ia, ib, ic]) {
        normals[idx] = normals[idx].add(fn);
        counts[idx]++;
      }
    }
    for (let i = 0; i < this.vertices.length; i++) {
      this.vertices[i].normal = counts[i] > 0 ? normals[i].scale(1 / counts[i]).normalize() : new Vector3D(0, 0, 1);
    }
  }

  applyTransformation(m) {
    const e = m.elements;
    for (const v of this.vertices) {
      const { x, y, z } = v.position;
      v.position.x = e[0] * x + e[4] * y + e[8] * z + e[12];
      v.position.y = e[1] * x + e[5] * y + e[9] * z + e[13];
      v.position.z = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = v.normal.x, ny = v.normal.y, nz = v.normal.z;
      v.normal.x = e[0] * nx + e[4] * ny + e[8] * nz;
      v.normal.y = e[1] * nx + e[5] * ny + e[9] * nz;
      v.normal.z = e[2] * nx + e[6] * ny + e[10] * nz;
    }
  }

  merge(other) {
    const offset = this.vertices.length;
    for (const v of other.vertices) this.vertices.push(v.clone());
    for (const i of other.indices) this.indices.push(i + offset);
  }

  toBufferGeometry() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.vertices.length * 3);
    const norms = new Float32Array(this.vertices.length * 3);
    const uvs = new Float32Array(this.vertices.length * 2);
    for (let i = 0; i < this.vertices.length; i++) {
      const v = this.vertices[i];
      pos[i * 3] = v.position.x; pos[i * 3 + 1] = v.position.y; pos[i * 3 + 2] = v.position.z;
      norms[i * 3] = v.normal.x; norms[i * 3 + 1] = v.normal.y; norms[i * 3 + 2] = v.normal.z;
      uvs[i * 2] = v.uv.x; uvs[i * 2 + 1] = v.uv.y;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(norms, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex([...this.indices]);
    return geo;
  }

  static fromBufferGeometry(geo) {
    const mesh = new Mesh3D();
    const pos = geo.attributes.position;
    const norms = geo.attributes.normal;
    const uvs = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      mesh.vertices.push(new Vertex3D(
        new Vector3D(pos.getX(i), pos.getY(i), pos.getZ(i)),
        norms ? new Vector3D(norms.getX(i), norms.getY(i), norms.getZ(i)) : new Vector3D(0, 0, 0),
        uvs ? new Vector2D(uvs.getX(i), uvs.getY(i)) : new Vector2D(0, 0)
      ));
    }
    if (geo.index) mesh.indices = [...geo.index.array];
    return mesh;
  }
}

// ============================================================
// 4. ExtrusionEngine — Passage 2D → 3D
// ============================================================

class ExtrusionEngine {
  static extrude(path, height, smoothNormals = true) {
    const mesh = new Mesh3D();
    const pts = path.getPoints(16);
    const n = pts.length;

    if (n < 3 || (!path.isClosed && n < 2)) {
      console.warn("ExtrusionEngine: besoin d'au moins 3 points fermes");
      return mesh;
    }

    const bottomIdx = [];
    const topIdx = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      bottomIdx.push(mesh.addVertex(new Vertex3D(new Vector3D(p.x, p.y, 0), new Vector3D(0, 0, -1), new Vector2D(i / n, 0))));
      topIdx.push(mesh.addVertex(new Vertex3D(new Vector3D(p.x, p.y, height), new Vector3D(0, 0, 1), new Vector2D(i / n, 1))));
    }

    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const b1 = bottomIdx[i], b2 = bottomIdx[next];
      const t1 = topIdx[i], t2 = topIdx[next];
      mesh.addTriangle(b1, b2, t1);
      mesh.addTriangle(b2, t2, t1);
    }

    if (path.isClosed && n >= 3) {
      for (let i = 1; i < n - 1; i++) {
        mesh.addTriangle(bottomIdx[0], bottomIdx[i + 1], bottomIdx[i]);
        mesh.addTriangle(topIdx[0], topIdx[i], topIdx[i + 1]);
      }
    }

    if (smoothNormals) mesh.computeSmoothNormals();
    return mesh;
  }

  static revolve(profile, segments = 32) {
    const mesh = new Mesh3D();
    const n = profile.length;
    if (n < 2) return mesh;

    for (let ring = 0; ring < segments; ring++) {
      const a0 = (ring / segments) * Math.PI * 2;
      const a1 = ((ring + 1) / segments) * Math.PI * 2;
      const ringVerts = [];

      for (let i = 0; i < n; i++) {
        const p = profile[i];
        const x = p.x * Math.cos(a0);
        const z = p.x * Math.sin(a0);
        ringVerts.push(mesh.addVertex(new Vertex3D(
          new Vector3D(x, p.y, z),
          new Vector3D(Math.cos(a0), 0, Math.sin(a0)),
          new Vector2D(ring / segments, i / (n - 1))
        )));
      }

      if (ring > 0) {
        const prev = ring * n - n;
        for (let i = 0; i < n - 1; i++) {
          mesh.addQuad(prev + i, prev + i + 1, ringVerts[i + 1], ringVerts[i]);
        }
      }
    }
    return mesh;
  }
}

// ============================================================
// 5. SnapSystem — Aimantage
// ============================================================

class SnapSystem {
  static snapToGrid(point, gridSize) {
    return new Vector2D(
      Math.round(point.x / gridSize) * gridSize,
      Math.round(point.y / gridSize) * gridSize
    );
  }

  static snapToAngle(angle, snapDeg = 15) {
    const snapRad = THREE.MathUtils.degToRad ? THREE.MathUtils.degToRad(snapDeg) : snapDeg * Math.PI / 180;
    return Math.round(angle / snapRad) * snapRad;
  }

  static snapToEndpoints(point, endpoints, threshold = 8) {
    let best = null;
    let bestDist = threshold;
    for (const ep of endpoints) {
      const d = point.distanceTo(ep);
      if (d < bestDist) { bestDist = d; best = ep; }
    }
    return best;
  }

  static snapToGrid3D(position, gridSize) {
    return new THREE.Vector3(
      Math.round(position.x / gridSize) * gridSize,
      Math.round(position.y / gridSize) * gridSize,
      Math.round(position.z / gridSize) * gridSize
    );
  }
}

// ============================================================
// 6. CoordinateSystem — Convertisseurs d'espaces
// ============================================================

class CoordinateSystem {
  static screenToWorld(clientX, clientY, canvas, camera, renderer) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const vec = new THREE.Vector3(x, y, 0.5);
    vec.unproject(camera);
    const dir = vec.sub(camera.position).normalize();
    const dist = -camera.position.y / dir.y;
    return camera.position.clone().add(dir.multiplyScalar(dist));
  }

  static drawCanvasToWorld(canvasX, canvasY, canvas, scale) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    return new Vector2D((canvasX - cx) / scale, -(canvasY - cy) / scale);
  }

  static worldToDrawCanvas(worldX, worldY, canvas, scale) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    return new Vector2D(worldX * scale + cx, -worldY * scale + cy);
  }
}

// ============================================================
// 7. ProjectSerializer — Sauvegarde/Chargement .pix
// ============================================================

class ProjectSerializer {
  static toJSON(state) { return JSON.stringify(ProjectSerializer.toObject(state), null, 2); }

  static toObject(state) {
    const landscapeHeightData = state.landscape && state.landscape.mesh
      ? Array.from(state.landscape.mesh.geometry.attributes.position.array)
      : null;
    return {
      app: "Iner Studio",
      version: 2,
      savedAt: new Date().toISOString(),
      name: state.name,
      style: state.style,
      room: state.room,
      panorama: { name: state.panoramaName, dataUrl: state.panoramaDataUrl },
      plan: state.plan,
      objects: state.objects,
      draw: { shapes: state.draw.shapes, scale: state.draw.scale },
      landscape: state.landscape && state.landscape.mesh
        ? { size: state.landscape.size, resolution: state.landscape.resolution,
            brushSize: state.landscape.brushSize, brushStrength: state.landscape.brushStrength,
            tool: state.landscape.tool, heightData: landscapeHeightData }
        : null,
      snap: state.snap,
      showGrid: state.showGrid,
      envPreset: state.envPreset || "",
    };
  }

  static toOBJ(mesh, name = "object") {
    let out = `# Iner Studio export
# ${new Date().toISOString()}
o ${name}
`;
    for (const v of mesh.vertices) out += `v ${v.position.x} ${v.position.y} ${v.position.z}
`;
    for (const v of mesh.vertices) out += `vn ${v.normal.x} ${v.normal.y} ${v.normal.z}
`;
    for (const v of mesh.vertices) out += `vt ${v.uv.x} ${v.uv.y}
`;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i] + 1, b = mesh.indices[i + 1] + 1, c = mesh.indices[i + 2] + 1;
      out += `f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}
`;
    }
    return out;
  }

  static toSTL(mesh, name = "object") {
    const triCount = mesh.indices.length / 3;
    const buf = new ArrayBuffer(80 + 4 + triCount * 50);
    const dv = new DataView(buf);
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(name);
    for (let i = 0; i < Math.min(nameBytes.length, 80); i++) dv.setUint8(i, nameBytes[i]);
    dv.setUint32(80, triCount, true);
    let off = 84;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.vertices[mesh.indices[i]].position;
      const b = mesh.vertices[mesh.indices[i + 1]].position;
      const c = mesh.vertices[mesh.indices[i + 2]].position;
      const e1 = b.sub(a), e2 = c.sub(a);
      const n = e1.cross(e2).normalize();
      dv.setFloat32(off, n.x, true); dv.setFloat32(off + 4, n.y, true); dv.setFloat32(off + 8, n.z, true);
      off += 12;
      for (const p of [a, b, c]) {
        dv.setFloat32(off, p.x, true); dv.setFloat32(off + 4, p.y, true); dv.setFloat32(off + 8, p.z, true);
        off += 12;
      }
      dv.setUint16(off, 0, true); off += 2;
    }
    return buf;
  }
}

// ============================================================
// 8. SceneAIBuilder — Transforme un blueprint IA en scène 3D
// ============================================================

const AI_BLUEPRINT_SCHEMA = {
  project_name: "string",
  style: "american | european | industrial | mediterranean",
  spaces: [{
    id: "string", type: "living_room | kitchen | bedroom | bathroom | office | dining_room | hallway",
    bounds_2d: [[0, 0], [6, 0], [6, 5], [0, 5]],
    elements: [{ type: "string", asset_library_id: "string (optionnel)", x: 3.0, z: 1.5, rotation_y: 180, scale: { x: 1, y: 1, z: 1 }, color: "string (optionnel)", material: "string (optionnel)" }]
  }],
  walls: [{ start: [0, 0], end: [6, 0], thickness: 0.3, height: 2.8, type: "exterior | interior" }],
  lighting: [{ type: "ambient | directional", intensity: 1.0, color: "#ffffff" }]
};

// ============================================================
// 9. SpatialLayoutEngine — Placement intelligent sans collision
// ============================================================

const FURNITURE_DIMENSIONS = {
  sofa: { w: 2.2, d: 0.85, clearance: 0.5, wall: true },
  armchair: { w: 1.1, d: 0.95, clearance: 0.4, wall: true },
  pouf: { w: 0.6, d: 0.6, clearance: 0.3 },
  coffeeTable: { w: 1.2, d: 0.7, clearance: 0.5 },
  diningTable: { w: 2.0, d: 1.0, clearance: 0.8 },
  diningChair: { w: 0.55, d: 0.6, clearance: 0.3 },
  bed: { w: 2.2, d: 1.9, clearance: 0.6, wall: true },
  wardrobe: { w: 1.6, d: 0.65, clearance: 0.4, wall: true },
  nightstand: { w: 0.55, d: 0.45, clearance: 0.2 },
  desk: { w: 1.6, d: 0.7, clearance: 0.6 },
  bookshelf: { w: 1.2, d: 0.35, clearance: 0.3, wall: true },
  officeChair: { w: 0.6, d: 0.6, clearance: 0.2 },
  plant: { w: 0.45, d: 0.45, clearance: 0.1 },
  lamp: { w: 0.35, d: 0.35, clearance: 0.1 },
  tvUnit: { w: 2.2, d: 0.45, clearance: 0.6, wall: true },
  tv: { w: 1.7, d: 0.08, clearance: 0.8, wall: true },
  table: { w: 1.6, d: 0.9, clearance: 0.6 },
  bench: { w: 1.8, d: 0.6, clearance: 0.4 },
  fridge: { w: 0.78, d: 0.72, clearance: 0.3, wall: true },
  oven: { w: 0.72, d: 0.62, clearance: 0.3, wall: true },
  sink: { w: 0.85, d: 0.52, clearance: 0.3, wall: true },
  cooktop: { w: 0.95, d: 0.62, clearance: 0.4, wall: true },
  toilet: { w: 0.55, d: 0.75, clearance: 0.4, wall: true },
  bathtub: { w: 1.65, d: 0.82, clearance: 0.3, wall: true },
  shower: { w: 1.0, d: 1.0, clearance: 0.2 },
};

class SpatialLayoutEngine {
  constructor(boundsPolygon) {
    this.polygon = boundsPolygon;
    this.placed = [];
  }

  static pointInPolygon(px, pz, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  static rectInPolygon(x, z, w, d, poly) {
    const m = 0.05;
    return (
      SpatialLayoutEngine.pointInPolygon(x - w / 2 + m, z - d / 2 + m, poly) &&
      SpatialLayoutEngine.pointInPolygon(x + w / 2 - m, z - d / 2 + m, poly) &&
      SpatialLayoutEngine.pointInPolygon(x - w / 2 + m, z + d / 2 - m, poly) &&
      SpatialLayoutEngine.pointInPolygon(x + w / 2 - m, z + d / 2 - m, poly)
    );
  }

  static rectsOverlap(a, b) {
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;
  }

  isValid(x, z, w, d, clearance = 0.3) {
    const c = clearance;
    if (!SpatialLayoutEngine.rectInPolygon(x, z, w + c * 2, d + c * 2, this.polygon)) return false;
    for (const p of this.placed) {
      const minX = (w + p.w) / 2 + Math.max(clearance, p.clearance || 0.3);
      const minZ = (d + p.d) / 2 + Math.max(clearance, p.clearance || 0.3);
      if (Math.abs(x - p.x) < minX && Math.abs(z - p.z) < minZ) return false;
    }
    return true;
  }

  findWallPosition(w, d, clearance) {
    const poly = this.polygon;
    const candidates = [];
    const step = 0.3;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      const dx = xj - xi, dz = zj - zi;
      const segLen = Math.sqrt(dx * dx + dz * dz);
      if (segLen < 0.01) continue;
      const nx = dx / segLen, nz = dz / segLen;
      const nSteps = Math.floor(segLen / step);
      for (let s = 0; s <= nSteps; s++) {
        const t = s / nSteps;
        const bx = xi + dx * t, bz = zi + dz * t;
        for (const [ox, oz] of [[d / 2 + clearance, d / 2 + clearance], [d / 2 + clearance, -d / 2 - clearance]]) {
          const cx = bx + nx * (w / 2 + clearance) + nz * ox;
          const cz = bz + nz * (w / 2 + clearance) - nx * ox;
          if (this.isValid(cx, cz, w, d, clearance)) candidates.push({ x: cx, z: cz, score: s * 0.1 + Math.abs(ox) * 0.5 });
        }
      }
    }
    if (candidates.length === 0) {
      const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
      const cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
      for (const [ox, oz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (this.isValid(cx + ox, cz + oz, w, d, clearance)) candidates.push({ x: cx + ox, z: cz + oz, score: 10 });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0] || null;
  }

  findOpenPosition(w, d, clearance) {
    const poly = this.polygon;
    const candidates = [];
    const minX = Math.min(...poly.map(p => p[0]));
    const maxX = Math.max(...poly.map(p => p[0]));
    const minZ = Math.min(...poly.map(p => p[1]));
    const maxZ = Math.max(...poly.map(p => p[1]));
    const step = 0.4;
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    for (let x = minX + w / 2 + clearance; x <= maxX - w / 2 - clearance; x += step) {
      for (let z = minZ + d / 2 + clearance; z <= maxZ - d / 2 - clearance; z += step) {
        if (this.isValid(x, z, w, d, clearance)) {
          candidates.push({ x, z, score: Math.sqrt((x - cx) ** 2 + (z - cz) ** 2) });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0] || null;
  }

  place(w, d, clearance = 0.3, againstWall = false) {
    let pos = againstWall
      ? this.findWallPosition(w, d, clearance)
      : this.findOpenPosition(w, d, clearance);
    if (!pos && !againstWall) pos = this.findWallPosition(w, d, clearance);
    if (!pos) pos = this.findOpenPosition(w, d, clearance);
    if (pos) this.placed.push({ x: pos.x, z: pos.z, w, d, clearance });
    return pos;
  }

  static optimizeKitchenTriangle(elements) {
    const kitchenTypes = ["fridge", "sink", "cooktop"];
    const kit = elements.filter(e => kitchenTypes.includes(e.type));
    if (kit.length < 3) return;
    const positions = [{ x: -1.5, z: -0.5 }, { x: 0, z: -0.5 }, { x: 1.5, z: -0.5 }];
    for (let i = 0; i < kit.length && i < positions.length; i++) {
      const el = kit[i];
      el.x = positions[i].x;
      el.z = positions[i].z;
      el.rotation_y = 0;
    }
  }
}

class SceneAIBuilder {
  constructor(scene, objectGroup, roomGroup, stateRef) {
    this.scene = scene;
    this.objectGroup = objectGroup;
    this.roomGroup = roomGroup;
    this.state = stateRef;
  }

  buildProject(blueprint) {
    pushUndo();
    if (!blueprint || !blueprint.spaces) return;

    if (blueprint.project_name) this.state.name = blueprint.project_name;
    if (blueprint.style) this.state.style = blueprint.style;
    dom.projectName.value = this.state.name;
    updateProjectUI();

    this.roomGroup.clear();
    this.state.room.fromPlan = true;

    const wallMat = createMaterial(
      stylePresets[this.state.style]?.wall || "paintWarm",
      { side: THREE.DoubleSide }
    );
    const floorMat = createMaterial(
      stylePresets[this.state.style]?.floor || "tile",
      { repeat: [2, 2] }
    );

    // 1. Create walls
    if (blueprint.walls) {
      for (const w of blueprint.walls) {
        this.createWall(w, wallMat);
      }
    }

    // 2. Create spaces (floor + bounds walls)
    for (const space of blueprint.spaces) {
      this.createSpace(space, floorMat, wallMat);
    }

    // 3. Place furniture with collision-free layout
    for (const space of blueprint.spaces) {
      if (space.elements && space.elements.length > 0) {
        // Apply kitchen triangle optimization for kitchen spaces
        if (space.type === "kitchen") {
          SpatialLayoutEngine.optimizeKitchenTriangle(space.elements);
        }
        const engine = new SpatialLayoutEngine(space.bounds_2d);
        for (const el of space.elements) {
          this.placeElement(el, space, engine);
        }
      }
    }

    // 4. Auto-frame camera
    this.autoFrame();

    renderObjectList();
    renderInspector();
    updateStatusBar();
  }

  createWall(w, mat) {
    const [sx, sz] = w.start;
    const [ex, ez] = w.end;
    const dx = ex - sx, dz = ez - sz;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.01) return;
    const angle = Math.atan2(dx, dz);
    const height = w.height || 2.8;
    const thick = w.thickness || 0.2;
    const midX = (sx + ex) / 2, midZ = (sz + ez) / 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thick), mat.clone());
    mesh.position.set(midX, height / 2, midZ);
    mesh.rotation.y = angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.roomGroup.add(mesh);
  }

  createSpace(space, floorMat, wallMat) {
    const pts = space.bounds_2d;
    if (!pts || pts.length < 3) return;
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    shape.lineTo(pts[0][0], pts[0][1]);

    // Floor
    const floorGeo = new THREE.ShapeGeometry(shape);
    const floor = new THREE.Mesh(floorGeo, floorMat.clone());
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.005;
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(floorGeo.clone(), wallMat.clone());
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.y = 2.8;
    this.roomGroup.add(ceil);

    // Extrude walls from bounds
    const extSettings = { steps: 1, depth: 2.8, bevelEnabled: false };
    const wallShape = new THREE.Shape();
    wallShape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) wallShape.lineTo(pts[i][0], pts[i][1]);
    wallShape.lineTo(pts[0][0], pts[0][1]);
    const wallGeo = new THREE.ExtrudeGeometry(wallShape, extSettings);
    const wallMesh = new THREE.Mesh(wallGeo, wallMat.clone());
    wallMesh.position.y = 0;
    wallMesh.castShadow = true;
    this.roomGroup.add(wallMesh);
  }

  placeElement(el, space, layoutEngine) {
    const type = el.type || "box";
    const dim = FURNITURE_DIMENSIONS[type];
    const w = dim?.w || 0.8;
    const d = dim?.d || 0.8;
    const clearance = dim?.clearance || 0.3;
    const againstWall = dim?.wall || false;
    let x = el.x, z = el.z;
    if ((x === undefined || z === undefined) && layoutEngine) {
      const placed = layoutEngine.place(w, d, clearance, againstWall);
      if (placed) { x = placed.x; z = placed.z; }
      else { x = x ?? 0; z = z ?? 0; }
    } else {
      x = x ?? 0; z = z ?? 0;
    }
    const rotY = el.rotation_y || (againstWall ? this.wallAngleFor(x, z, space) : 0);
    const s = el.scale || { x: 1, y: 1, z: 1 };
    const styleMat = STYLE_MATERIAL_MAP[this.state.style] || STYLE_MATERIAL_MAP.american;
    const spec = {
      id: crypto.randomUUID(),
      type,
      name: `${labelFor(type)} (IA)`,
      color: el.color || materialLibrary[styleMat[type] || stylePresets[this.state.style]?.furniture]?.color || "#bb7d5a",
      material: el.material || styleMat[type] || stylePresets[this.state.style]?.furniture || "fabric",
      position: { x, y: 0, z },
      rotation: { x: 0, y: THREE.MathUtils.degToRad(rotY), z: 0 },
      scale: s,
    };
    const mesh = createMesh(spec);
    this.objectGroup.add(mesh);
    this.state.objects.push(spec);
  }

  wallAngleFor(x, z, space) {
    const poly = space.bounds_2d;
    if (!poly || poly.length < 2) return 0;
    let bestDist = Infinity, bestAngle = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      const dx = xj - xi, dz = zj - zi;
      const segLen = Math.sqrt(dx * dx + dz * dz);
      if (segLen < 0.01) continue;
      const t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / (segLen * segLen)));
      const px = xi + dx * t, pz = zi + dz * t;
      const dist = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
      if (dist < bestDist) { bestDist = dist; bestAngle = Math.atan2(dx, dz); }
    }
    return bestAngle;
  }

  autoFrame() {
    const box = new THREE.Box3().setFromObject(this.roomGroup);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z) + 4;
    const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360));
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist * 0.6);
    controls.target.copy(center);
    controls.update();
  }
}

const state = {
  name: "Projet sans titre",
  mode: "model",
  style: "american",
  panoramaDataUrl: "",
  panoramaName: "",
  room: { width: 7, depth: 5, height: 3 },
  plan: {
    imageDataUrl: "",
    imageName: "",
    scale: 70,
    tool: "wall",
    segments: [],
  },
  objects: [],
  selectedIds: [],
  clusters: [],
  draw: {
    tool: null,
    active: false,
    shapes: [],
    current: null,
    scale: 100,
  },
  boolean: {
    active: false,
    firstId: null,
    operation: "subtract",
  },
  undo: {
    history: [],
    index: -1,
    max: 50,
  },
  deform: {
    active: false,
    type: "bend",
    strength: 0.3,
    geoBackup: null,
  },
  landscape: {
    mesh: null,
    size: 20,
    resolution: 64,
    brushSize: 2,
    brushStrength: 0.1,
    tool: "raise",
    sculpting: false,
  },
  snap: {
    enabled: false,
    size: 0.5,
  },
  selectionMode: "point",
  showGrid: true,
  envPreset: "",
  selectionFilter: "all",
  subObjectLevel: "object",
  quadView: false,
  activeView: "perspective",
  aiLastBlueprint: null,
  aiAllVariants: null,
  measure: { active: false },
  physics: { collision: false },
  anim: { playing: true, t: 0 },
  cine: { shots: [], objKeys: [], index: -1, playing: false, t: 0, rec: null, loop: false, duration: null },
};

const materialLibrary = {
  paintWarm: { label: "Paint warm", color: "#e8dfcf", roughness: 0.82 },
  paintCool: { label: "Paint cool", color: "#dfe5e2", roughness: 0.78 },
  concrete: { label: "Beton", color: "#8e9189", roughness: 0.93, texture: "concrete" },
  reinforcedConcrete: { label: "Beton arme", color: "#6f736d", roughness: 0.95, metalness: 0.05, texture: "reinforcedConcrete" },
  brick: { label: "Mur brique", color: "#a8543f", roughness: 0.9, texture: "brick" },
  woodOak: { label: "Wood oak", color: "#b98a55", roughness: 0.68, texture: "wood" },
  woodWalnut: { label: "Wood walnut", color: "#6f4a32", roughness: 0.72, texture: "wood" },
  tile: { label: "Carrelage", color: "#d8d1c2", roughness: 0.42, texture: "tile" },
  glass: { label: "Glass", color: "#88c8d8", roughness: 0.06, metalness: 0, opacity: 0.42, transparent: true },
  metal: { label: "Metal", color: "#8f9698", roughness: 0.28, metalness: 0.75 },
  fabric: { label: "Fabric", color: "#bb7d5a", roughness: 0.96, texture: "fabric" },
  ceramic: { label: "Ceramic", color: "#f2eee4", roughness: 0.34 },
  darkScreen: { label: "Black glass", color: "#07090b", roughness: 0.18, metalness: 0.2 },
  lightWarm: { label: "Light warm", color: "#ffe7a3", roughness: 0.12 },
  water: { label: "Eau fluide", color: "#2f7fb2", roughness: 0.08, metalness: 0.42, transparent: true, opacity: 0.82, side: THREE.DoubleSide },
  smokeGas: { label: "Gaz / fumée", color: "#9aa4ac", roughness: 0.55, transparent: true, opacity: 0.2, blend: "additive", side: THREE.DoubleSide },
  rock: { label: "Roche", color: "#6a6a6a", roughness: 0.86, metalness: 0.08 },
};

const stylePresets = {
  american: {
    floor: "woodOak",
    wall: "paintWarm",
    furniture: "fabric",
    accent: "brick",
  },
  european: {
    floor: "tile",
    wall: "paintCool",
    furniture: "woodOak",
    accent: "glass",
  },
  industrial: {
    floor: "concrete",
    wall: "reinforcedConcrete",
    furniture: "metal",
    accent: "brick",
  },
  mediterranean: {
    floor: "tile",
    wall: "paintWarm",
    furniture: "woodWalnut",
    accent: "brick",
  },
};

const STYLE_MATERIAL_MAP = {
  american: {
    sofa: "fabric", armchair: "fabric", pouf: "fabric",
    coffeeTable: "woodOak", diningTable: "woodOak", diningChair: "fabric",
    table: "woodOak", bench: "woodOak", nightstand: "woodOak",
    desk: "woodOak", bookshelf: "woodOak", wardrobe: "woodOak",
    bed: "fabric", plant: "paintWarm", flowerPot: "ceramic",
    lamp: "metal", tvUnit: "woodOak", tv: "darkScreen",
    fridge: "metal", oven: "metal", cooktop: "metal",
    sink: "ceramic", toilet: "ceramic", bathtub: "ceramic",
    shower: "glass", curtain: "fabric", stairs: "woodOak",
    officeChair: "fabric", wall: "paintWarm", door: "woodOak",
    window: "glass", spotlight: "metal",
  },
  european: {
    sofa: "fabric", armchair: "fabric", pouf: "fabric",
    coffeeTable: "woodOak", diningTable: "woodOak", diningChair: "woodOak",
    table: "woodOak", bench: "woodOak", nightstand: "woodOak",
    desk: "woodOak", bookshelf: "woodOak", wardrobe: "woodOak",
    bed: "fabric", plant: "paintCool", flowerPot: "ceramic",
    lamp: "glass", tvUnit: "woodOak", tv: "darkScreen",
    fridge: "metal", oven: "metal", cooktop: "metal",
    sink: "ceramic", toilet: "ceramic", bathtub: "ceramic",
    shower: "glass", curtain: "fabric", stairs: "woodOak",
    officeChair: "woodOak", wall: "paintCool", door: "woodOak",
    window: "glass", spotlight: "metal",
  },
  industrial: {
    sofa: "fabric", armchair: "metal", pouf: "fabric",
    coffeeTable: "metal", diningTable: "metal", diningChair: "metal",
    table: "metal", bench: "metal", nightstand: "metal",
    desk: "metal", bookshelf: "metal", wardrobe: "metal",
    bed: "fabric", plant: "paintWarm", flowerPot: "concrete",
    lamp: "metal", tvUnit: "metal", tv: "darkScreen",
    fridge: "metal", oven: "metal", cooktop: "metal",
    sink: "metal", toilet: "ceramic", bathtub: "metal",
    shower: "glass", curtain: "fabric", stairs: "metal",
    officeChair: "fabric", wall: "reinforcedConcrete", door: "metal",
    window: "glass", spotlight: "metal",
  },
  mediterranean: {
    sofa: "fabric", armchair: "fabric", pouf: "fabric",
    coffeeTable: "woodWalnut", diningTable: "woodWalnut", diningChair: "woodWalnut",
    table: "woodWalnut", bench: "woodWalnut", nightstand: "woodWalnut",
    desk: "woodWalnut", bookshelf: "woodWalnut", wardrobe: "woodWalnut",
    bed: "fabric", plant: "paintWarm", flowerPot: "ceramic",
    lamp: "metal", tvUnit: "woodWalnut", tv: "darkScreen",
    fridge: "metal", oven: "metal", cooktop: "metal",
    sink: "ceramic", toilet: "ceramic", bathtub: "ceramic",
    shower: "glass", curtain: "fabric", stairs: "woodWalnut",
    officeChair: "fabric", wall: "paintWarm", door: "woodWalnut",
    window: "glass", spotlight: "metal",
  },
};

const dom = {
  viewport: document.querySelector("#viewport"),
  planViewport: document.querySelector("#planViewport"),
  planCanvas: document.querySelector("#planCanvas"),
  panoramaViewport: document.querySelector("#panoramaViewport"),
  projectName: document.querySelector("#projectNameInput"),
  projectMeta: document.querySelector("#projectMeta"),
  panoramaStatus: document.querySelector("#panoramaStatus"),
  planStatus: document.querySelector("#planStatus"),
  objectList: document.querySelector("#objectList"),
  inspector: document.querySelector("#inspector"),
  emptyInspector: document.querySelector("#emptyInspector"),
  panoramaInput: document.querySelector("#panoramaInput"),
  planInput: document.querySelector("#planInput"),
  projectInput: document.querySelector("#projectInput"),
  glbInput: document.querySelector("#glbInput"),
  drawCanvas: document.querySelector("#drawCanvas"),
  statusMode: document.querySelector("#statusMode"),
  statusInfo: document.querySelector("#statusInfo"),
  statusHint: document.querySelector("#statusHint"),
  statusCoords: document.querySelector("#statusCoords"),
  selectionInfo: document.querySelector("#selectionInfo"),
  sceneTree: document.querySelector("#objectList"),
  vpOverlay: document.querySelector("#vpOverlay"),
  vpDividerH: document.querySelector("#vpDividerH"),
  vpDividerV: document.querySelector("#vpDividerV"),
  quadViewBtn: document.querySelector("#quadViewBtn"),
  modifierStack: document.querySelector("#modifierStack"),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111315);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
camera.position.set(6, 5, 7);

function showBootError(message) {
  const el = document.getElementById("inerreDump");
  const msg = document.getElementById("inerreDumpMsg");
  if (!el || !msg) return;
  msg.textContent = message || "";
  el.classList.add("show");
}
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  showBootError("WebGL indisponible sur votre navigateur ou appareil.\n\n" + (e && e.message ? e.message : String(e)) + "\n\nAstuce : activez l'accélération matérielle (paramètres Chrome/Safari) et rechargez. N'hésitez pas à copier ce texte pour le support.");
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
dom.viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.3, 0);

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.addEventListener("dragging-changed", (event) => {
  controls.enabled = !event.value;
});
transformControls.addEventListener("objectChange", () => {
  const object = transformControls.object;
  if (object?.userData.subMarker) {
    applySubObjectDrag();
    return;
  }
  if (object?.userData.clusterId) {
    const cluster = findCluster(object.userData.clusterId);
    if (cluster) {
      const last = object.userData._lastPos || object.position.clone();
      const delta = {
        x: object.position.x - last.x,
        y: object.position.y - last.y,
        z: object.position.z - last.z,
      };
      object.userData._lastPos = object.position.clone();
      if (delta.x || delta.y || delta.z) {
        syncClusterMembers(cluster, delta);
        renderGeoInfo();
        updateStatusBar();
      }
    }
    return;
  }
  if (!object?.userData.id) return;
  if (state.physics.collision) {
    for (let i = 0; i < 4; i++) collisionClamp(object);
  }
  const last = object.userData._lastPos || object.position.clone();
  const delta = {
    x: object.position.x - last.x,
    y: object.position.y - last.y,
    z: object.position.z - last.z,
  };
  object.userData._lastPos = object.position.clone();
  if (delta.x || delta.y || delta.z) propagateLinked(object.userData.id, delta);
  syncObjectFromMesh(object);
  renderInspector();
});
scene.add(transformControls);

const panoScene = new THREE.Scene();
const panoCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1100);
panoCamera.position.set(0, 0, 0.1);
const panoRenderer = new THREE.WebGLRenderer({ antialias: true });
panoRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
dom.panoramaViewport.appendChild(panoRenderer.domElement);
const panoControls = new OrbitControls(panoCamera, panoRenderer.domElement);
panoControls.enableZoom = false;
panoControls.enablePan = false;
panoControls.rotateSpeed = -0.28;

const root = new THREE.Group();
const roomGroup = new THREE.Group();
const objectGroup = new THREE.Group();
const landscapeGroup = new THREE.Group();
scene.add(root, roomGroup, objectGroup, landscapeGroup);

let gridHelper = null;
let vpFrontCam = null, vpTopCam = null, vpLeftCam = null;
let vpFrontGrid = null, vpTopGrid = null, vpLeftGrid = null;
let quadViewActive = false;
const textureCache = new Map();
let panoramaMesh = null;
let planImage = null;
let draftSegment = null;
let isDrawingPlan = false;

let measureGroup = null;
let measurePoints = [];
let measureActive = false;
const MEASURE_LIST = [];

let subHelperGroup = null;
let subProxy = null;
let subData = null;
let subProxyStart = null;

initLighting();
initQuadView();
buildRoom();
bindUI();
setTransformMode("translate");
setSelectionMode("point");
pushUndo();
resize();
animate();
addDefaultFurniture();
updatePipeline();
window.__INERRE_BOOTED = true;

function addDefaultFurniture() {
  addObject("sofa");
  addObject("coffeeTable");
  addObject("lamp");
  addObject("tvUnit");
  addObject("tv");
  state.selectedIds = [];
  renderObjectList();
  renderInspector();
  updateStatusBar();
}

/* ---- 2D Drawing Tools ---- */
function setDrawTool(tool) {
  if (state.draw.tool === tool) {
    state.draw.tool = null;
    state.draw.active = false;
  } else {
    state.draw.tool = tool;
    state.draw.active = true;
  }
  document.querySelectorAll("[data-draw-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.drawTool === state.draw.tool);
  });
  dom.drawCanvas.classList.toggle("active", state.draw.active);
  dom.drawCanvas.style.pointerEvents = state.draw.active ? "auto" : "none";
  if (!state.draw.active) state.draw.current = null;
  renderDraw();
  updateStatusBar();
}

function startDrawShape(event) {
  if (!state.draw.active || !state.draw.tool) return;
  const rect = dom.drawCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const tool = state.draw.tool;

  if (tool === "point") {
    state.draw.shapes.push({ id: crypto.randomUUID(), type: "point", points: [{ x, y }], closed: false });
    renderDraw();
    return;
  }

  if (tool === "line" || tool === "rectangle" || tool === "circle") {
    state.draw.current = { id: crypto.randomUUID(), type: tool, points: [{ x, y }], closed: tool === "rectangle" || tool === "circle" };
    dom.drawCanvas.setPointerCapture(event.pointerId);
    renderDraw();
    return;
  }

  if (tool === "arc") {
    if (!state.draw.current) {
      state.draw.current = { id: crypto.randomUUID(), type: "arc", points: [{ x, y }], closed: false };
    } else {
      state.draw.current.points.push({ x, y });
      if (state.draw.current.points.length >= 3) {
        state.draw.shapes.push(state.draw.current);
        state.draw.current = null;
      }
    }
    renderDraw();
    return;
  }

  if (tool === "profile") {
    if (!state.draw.current) {
      state.draw.current = { id: crypto.randomUUID(), type: "profile", points: [{ x, y }], closed: false };
    } else {
      state.draw.current.points.push({ x, y });
    }
    renderDraw();
    return;
  }
}

function moveDrawShape(event) {
  if (!state.draw.current) return;
  if (state.draw.current.type === "arc") return;
  const rect = dom.drawCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  state.draw.current.points[1] = { x, y };
  renderDraw();
}

function endDrawShape(event) {
  if (!state.draw.current) return;
  const tool = state.draw.current.type;
  if (tool === "arc") return;
  const rect = dom.drawCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  state.draw.current.points[1] = { x, y };
  state.draw.shapes.push(state.draw.current);
  state.draw.current = null;
  dom.drawCanvas.releasePointerCapture(event.pointerId);
  renderDraw();
  updateDrawPipeline();
}

function renderDraw() {
  const canvas = dom.drawCanvas;
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (state.draw.active) {
    drawDrawGrid(ctx, rect.width, rect.height);
  }

  state.draw.shapes.forEach((shape) => drawShape(ctx, shape, false));
  if (state.draw.current) drawShape(ctx, state.draw.current, true);
  updateDrawPipeline();
}

function drawDrawGrid(ctx, width, height) {
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x <= width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawShape(ctx, shape, preview) {
  const color = preview ? "rgba(53,180,156,0.6)" : "#35b49c";
  ctx.strokeStyle = color;
  ctx.lineWidth = preview ? 2 : 2.5;
  ctx.fillStyle = preview ? "rgba(53,180,156,0.08)" : "rgba(53,180,156,0.15)";
  ctx.setLineDash(preview ? [6, 4] : []);

  switch (shape.type) {
    case "point":
      drawShapePoint(ctx, shape);
      break;
    case "line":
      drawShapeLine(ctx, shape);
      break;
    case "rectangle":
      drawShapeRect(ctx, shape);
      break;
    case "circle":
      drawShapeCircle(ctx, shape);
      break;
    case "arc":
      drawShapeArc(ctx, shape);
      break;
    case "profile":
      drawShapeProfile(ctx, shape);
      break;
  }
  ctx.setLineDash([]);
}

function drawShapePoint(ctx, shape) {
  if (!shape.points[0]) return;
  ctx.beginPath();
  ctx.arc(shape.points[0].x, shape.points[0].y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#35b49c";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(shape.points[0].x, shape.points[0].y, 4, 0, Math.PI * 2);
  ctx.strokeStyle = "#f3f1ea";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.stroke();
}

function drawShapeLine(ctx, shape) {
  if (shape.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(shape.points[0].x, shape.points[0].y);
  ctx.lineTo(shape.points[1].x, shape.points[1].y);
  ctx.stroke();
  shape.points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawShapeRect(ctx, shape) {
  if (shape.points.length < 2) return;
  const x = Math.min(shape.points[0].x, shape.points[1].x);
  const y = Math.min(shape.points[0].y, shape.points[1].y);
  const w = Math.abs(shape.points[1].x - shape.points[0].x);
  const h = Math.abs(shape.points[1].y - shape.points[0].y);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
}

function drawShapeCircle(ctx, shape) {
  if (shape.points.length < 2) return;
  const cx = shape.points[0].x;
  const cy = shape.points[0].y;
  const r = Math.hypot(shape.points[1].x - cx, shape.points[1].y - cy);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx + 5, cy);
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy + 5);
  ctx.stroke();
}

function drawShapeArc(ctx, shape) {
  if (shape.points.length < 2) return;
  const p0 = shape.points[0];
  const p1 = shape.points[shape.points.length >= 3 ? 2 : 1];
  const cp = shape.points.length >= 3 ? shape.points[1] : null;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  if (cp) {
    ctx.quadraticCurveTo(cp.x, cp.y, p1.x, p1.y);
  } else {
    ctx.lineTo(p1.x, p1.y);
  }
  ctx.stroke();
  shape.points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawShapeProfile(ctx, shape) {
  if (shape.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(shape.points[0].x, shape.points[0].y);
  for (let i = 1; i < shape.points.length; i++) {
    ctx.lineTo(shape.points[i].x, shape.points[i].y);
  }
  ctx.stroke();
  shape.points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  if (shape.points.length >= 2) {
    const last = shape.points[shape.points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = "#e7c46a";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();
  }
}

function extrudeDrawShapes() {
  if (!state.draw.shapes.length) return;
  pushUndo();
  const scale = state.draw.scale || 100;
  const parent = dom.drawCanvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const preset = stylePresets[state.style] || stylePresets.american;

  const count = state.draw.shapes.length;
  state.draw.shapes.forEach((shape) => {
    if (shape.type === "point") return;
    const spec = createExtrudedSpec(shape, cx, cy, scale, preset);
    if (spec) addObject(spec.type, spec);
  });

  state.draw.shapes = [];
  state.draw.current = null;
  renderDraw();
  renderObjectList();
  updateDrawPipeline();}

function createExtrudedSpec(shape, cx, cy, scale, preset) {
  const toWorld = (px, py) => ({
    x: (px - cx) / scale,
    z: -(py - cy) / scale,
  });

  const baseSpec = {
    id: `draw-${shape.id}`,
    color: materialLibrary[preset.furniture]?.color || "#35b49c",
    material: preset.furniture,
    rotation: { x: 0, y: 0, z: 0 },
    fromPlan: false,
  };

  switch (shape.type) {
    case "line": {
      const a = toWorld(shape.points[0].x, shape.points[0].y);
      const b = toWorld(shape.points[1].x, shape.points[1].y);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.max(0.15, Math.hypot(dx, dz));
      const angle = Math.atan2(dz, dx);
      return {
        ...baseSpec,
        type: "wall",
        name: `Ligne extrude`,
        position: { x: round((a.x + b.x) / 2), y: 1.5, z: round((a.z + b.z) / 2) },
        scale: { x: round(length), y: 3, z: 0.14 },
        rotation: { x: 0, y: round(angle), z: 0 },
      };
    }
    case "rectangle": {
      const a = toWorld(shape.points[0].x, shape.points[0].y);
      const b = toWorld(shape.points[1].x, shape.points[1].y);
      const w = Math.abs(b.x - a.x);
      const d = Math.abs(b.z - a.z);
      if (w < 0.1 || d < 0.1) return null;
      return {
        ...baseSpec,
        type: "box",
        name: `Rectangle extrude`,
        position: { x: round((a.x + b.x) / 2), y: 0.5, z: round((a.z + b.z) / 2) },
        scale: { x: round(w), y: 1, z: round(d) },
      };
    }
    case "circle": {
      const center = toWorld(shape.points[0].x, shape.points[0].y);
      const edge = toWorld(shape.points[1].x, shape.points[1].y);
      const radius = Math.hypot(edge.x - center.x, edge.z - center.z);
      if (radius < 0.05) return null;
      return {
        ...baseSpec,
        type: "cylinder",
        name: `Cercle extrude`,
        position: { x: round(center.x), y: 0.5, z: round(center.z) },
        scale: { x: round(radius * 2), y: 1, z: round(radius * 2) },
      };
    }
    case "arc": {
      if (shape.points.length < 3) return null;
      const a = toWorld(shape.points[0].x, shape.points[0].y);
      const b = toWorld(shape.points[2].x, shape.points[2].y);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.max(0.15, Math.hypot(dx, dz));
      const angle = Math.atan2(dz, dx);
      return {
        ...baseSpec,
        type: "wall",
        name: `Arc extrude`,
        position: { x: round((a.x + b.x) / 2), y: 1.5, z: round((a.z + b.z) / 2) },
        scale: { x: round(length), y: 3, z: 0.14 },
        rotation: { x: 0, y: round(angle), z: 0 },
      };
    }
    default:
      return null;
  }
}

function revolveDrawShapes() {
  let shape = state.draw.current?.type === "profile" ? state.draw.current : null;
  if (!shape) {
    const profiles = state.draw.shapes.filter((s) => s.type === "profile");
    if (!profiles.length) return;
    shape = profiles[profiles.length - 1];
  }
  pushUndo();
  if (shape.points.length < 2) return;
  const scale = state.draw.scale || 100;
  const parent = dom.drawCanvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const points = shape.points.map((p) => {
    const x = (p.x - cx) / scale;
    const y = -(p.y - cy) / scale;
    return new THREE.Vector2(Math.max(0.001, x), y);
  });
  points.sort((a, b) => a.y - b.y);
  const geo = new THREE.LatheGeometry(points, 32);
  const preset = stylePresets[state.style] || stylePresets.american;
  const matKey = preset.furniture;
  const color = materialLibrary[matKey]?.color || "#35b49c";
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  const id = `revolve-${crypto.randomUUID()}`;
  mesh.userData.id = id;
  mesh.userData.type = "box";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const spec = {
    id,
    type: "box",
    name: "Révolution",
    color,
    material: matKey,
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: { x: 0, y: 0, z: 0 },
  };
  state.objects.push(spec);
  objectGroup.add(mesh);
  state.draw.shapes = state.draw.shapes.filter((s) => s.id !== shape.id);
  state.draw.current = null;
  renderDraw();
  renderObjectList();
  selectObject(id);
  updateDrawPipeline();
}

/* ---- Transform Mode ---- */
function setTransformMode(mode) {
  transformControls.mode = mode;
  document.querySelectorAll("[data-transform-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.transformMode === mode);
  });
}

function applySnap() {
  if (state.snap.enabled) {
    transformControls.setTranslationSnap(state.snap.size);
    transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
  } else {
    transformControls.setTranslationSnap(null);
    transformControls.setRotationSnap(null);
  }
}

function toggleSnap() {
  state.snap.enabled = !state.snap.enabled;
  document.querySelector("#snapBtn").classList.toggle("active", state.snap.enabled);
  applySnap();
  updateStatusBar();
}

function setSelectionMode(mode) {
  state.selectionMode = mode;
  document.querySelectorAll("[data-sel-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.selMode === mode);
  });
  document.querySelector("#boxSelectBtn")?.classList.toggle("active", mode === "rect");
  document.querySelector("#boxOverlay")?.classList.add("hidden");
  renderer.domElement.style.cursor = mode === "point" ? "default" : "crosshair";
}

function toggleGrid() {
  state.showGrid = !state.showGrid;
  if (gridHelper) gridHelper.visible = state.showGrid;
  document.querySelector("#gridBtn").classList.toggle("active", state.showGrid);
}

function toggleArray() {
  const panel = document.querySelector("#arrayPanel");
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) {
    document.querySelector("#arrayType").value = "linear";
    document.querySelector("#arrayCurveOpts").style.display = "none";
    document.querySelector("#arrayOffsetLabel").style.display = "";
    updateArrayOffsetLabel();
  }
}

function updateArrayOffsetLabel() {
  const type = document.querySelector("#arrayType").value;
  const text = document.querySelector("#arrayOffsetText");
  if (type === "circle") text.textContent = "Radius";
  else if (type === "grid") text.textContent = "Espacement";
  else if (type === "curve") text.textContent = "Pas / Rayon";
  else text.textContent = "Offset";
  const curveOpts = document.querySelector("#arrayCurveOpts");
  if (curveOpts) curveOpts.style.display = type === "curve" ? "" : "none";
}

function applyArray() {
  if (!state.selectedIds.length) return;
  pushUndo();
  const type = document.querySelector("#arrayType").value;
  const count = Math.min(100, Math.max(1, parseInt(document.querySelector("#arrayCount").value) || 1));
  const offset = parseFloat(document.querySelector("#arrayOffset").value) || 1;
  const ids = [...state.selectedIds];
  state.selectedIds = [];
  ids.forEach((id) => {
    const spec = findSpec(id);
    if (!spec) return;
    for (let i = 1; i < count; i++) {
      const newSpec = JSON.parse(JSON.stringify(spec));
      newSpec.id = crypto.randomUUID();
      newSpec.name = `${spec.name} ${i + 1}`;
      let dx = 0, dy = 0, dz = 0;
      if (type === "linear") {
        dx = offset * i;
      } else if (type === "grid") {
        const cols = Math.ceil(Math.sqrt(count));
        const row = Math.floor(i / cols);
        const col = i % cols;
        dx = offset * col;
        dz = offset * row;
      } else if (type === "circle") {
        const angle = (2 * Math.PI / count) * i;
        dx = offset * Math.cos(angle);
        dz = offset * Math.sin(angle);
      } else if (type === "curve") {
        const curve = document.querySelector("#arrayCurveType").value;
        const depth = parseFloat(document.querySelector("#arrayCurveDepth").value) || 1;
        const turns = 1.5;
        if (curve === "arc") {
          const theta = ((Math.PI / 2) / count) * i;
          dx = offset * (1 - Math.cos(theta)) * Math.sign(Math.cos(theta));
          dz = offset * Math.sin(theta);
        } else if (curve === "sine") {
          dx = offset * i;
          dz = depth * Math.sin((2 * Math.PI * 2 / count) * i) * Math.min(1, i / Math.max(1, count / 2));
        } else {
          const theta = ((2 * Math.PI * turns) / count) * i;
          dx = offset * i * Math.cos(theta);
          dz = (offset * i) * Math.sin(theta);
        }
        dy = 0;
      }
      newSpec.position.x += dx;
      newSpec.position.y += dy;
      newSpec.position.z += dz;
      state.objects.push(newSpec);
      const mesh = createMesh(newSpec);
      objectGroup.add(mesh);
    }
  });
  renderObjectList();
  document.querySelector("#arrayPanel").classList.add("hidden");
}

function toggleMirror() {
  document.querySelector("#mirrorPanel").classList.toggle("hidden");
}

function mirrorSelected(axis) {
  if (!state.selectedIds.length) return;
  pushUndo();
  const ids = [...state.selectedIds];
  ids.forEach((id) => {
    const spec = findSpec(id);
    if (!spec) return;
    const newSpec = JSON.parse(JSON.stringify(spec));
    newSpec.id = crypto.randomUUID();
    newSpec.name = `${spec.name} mirror`;
    if (axis === "x") {
      newSpec.position.x = -spec.position.x;
      newSpec.scale.x = -spec.scale.x;
    } else if (axis === "y") {
      newSpec.position.y = -spec.position.y;
      newSpec.scale.y = -spec.scale.y;
    } else if (axis === "z") {
      newSpec.position.z = -spec.position.z;
      newSpec.scale.z = -spec.scale.z;
    }
    state.objects.push(newSpec);
    const mesh = createMesh(newSpec);
    objectGroup.add(mesh);
  });
  renderObjectList();
  document.querySelector("#mirrorPanel").classList.add("hidden");
}

/* ---- Cluster / Group handling ---- */
function isClusterId(id) {
  return state.clusters.some((c) => c.id === id);
}

function findCluster(id) {
  return state.clusters.find((c) => c.id === id);
}

function findClusterAnchor(clusterId) {
  return objectGroup.children.find((o) => o.userData.clusterId === clusterId);
}

function clusterSelected() {
  const members = state.selectedIds.filter((id) => !isClusterId(id) && Boolean(findSpec(id)));
  if (members.length < 2) {
    setStatusInfo("Sélectionne au moins 2 objets pour créer un cluster");
    return;
  }
  pushUndo();
  const cluster = { id: crypto.randomUUID(), name: `Groupe ${state.clusters.length + 1}`, members };
  state.clusters.forEach((c) => {
    if (c.members.some((m) => members.includes(m))) {
      const anchor = findClusterAnchor(c.id);
      if (anchor) objectGroup.remove(anchor);
      c.members = c.members.filter((m) => !members.includes(m));
    }
  });
  state.clusters = state.clusters.filter((c) => c.members.length > 0);
  state.clusters.forEach((c) => { if (!findClusterAnchor(c.id)) createClusterAnchor(c); });
  state.clusters.push(cluster);
  createClusterAnchor(cluster);
  state.selectedIds = [cluster.id];
  renderObjectList();
  renderInspector();
}

function createClusterAnchor(cluster) {
  const anchor = new THREE.Object3D();
  anchor.name = cluster.name;
  anchor.userData.clusterId = cluster.id;
  objectGroup.add(anchor);
  positionClusterAnchor(anchor, cluster);
  return anchor;
}

function positionClusterAnchor(anchor, cluster) {
  let cx = 0, cy = 0, cz = 0, n = 0;
  cluster.members.forEach((id) => {
    const mesh = findMesh(id);
    if (!mesh) return;
    const center = new THREE.Box3().setFromObject(mesh, true).getCenter(new THREE.Vector3());
    cx += center.x; cy += center.y; cz += center.z; n++;
  });
  if (n) anchor.position.set(cx / n, cy / n, cz / n);
  else anchor.position.set(0, 0, 0);
  anchor.userData._lastPos = anchor.position.clone();
  anchor.updateMatrixWorld(true);
}

function syncClusterMembers(cluster, delta) {
  cluster.members.forEach((id) => {
    const spec = findSpec(id);
    const mesh = findMesh(id);
    if (!spec || !mesh) return;
    spec.position.x = round(spec.position.x + delta.x);
    spec.position.y = round(spec.position.y + delta.y);
    spec.position.z = round(spec.position.z + delta.z);
    mesh.position.set(spec.position.x, spec.position.y, spec.position.z);
    mesh.updateMatrix();
  });
}

function unclusterSelected() {
  if (!state.selectedIds.length) {
    setStatusInfo("Sélectionne un objet appartenant à un cluster");
    return;
  }
  let changed = false;
  state.clusters = state.clusters.filter((c) => {
    const affected = c.members.some((m) => state.selectedIds.includes(m)) || state.selectedIds.includes(c.id);
    if (affected) {
      const anchor = findClusterAnchor(c.id);
      if (anchor) objectGroup.remove(anchor);
      changed = true;
      return false;
    }
    return true;
  });
  if (!changed) { setStatusInfo("Aucun cluster sélectionné"); return; }
  pushUndo();
  state.selectedIds = state.selectedIds.filter((id) => !isClusterId(id));
  if (state.selectedIds.length === 1) {
    const mesh = findMesh(state.selectedIds[0]);
    if (mesh) transformControls.attach(mesh);
  } else {
    transformControls.detach();
  }
  renderObjectList();
  renderInspector();
  setStatusInfo("Cluster dissocié");
}

/* ---- Neighborhood ---- */
function updateMatrices() {
  objectGroup.updateMatrixWorld(true);
}

function getObjectBox(id) {
  const mesh = findMesh(id);
  if (!mesh) return null;
  return new THREE.Box3().setFromObject(mesh, true);
}

function selectedMeshIds() {
  return state.selectedIds.filter((id) => !isClusterId(id) && Boolean(findMesh(id)));
}

function selectNeighbors() {
  const selIds = selectedMeshIds();
  if (!selIds.length) { setStatusInfo("Sélectionne d'abord un objet puis Voisins"); return; }
  updateMatrices();
  let union = null;
  selIds.forEach((id) => {
    const b = getObjectBox(id);
    if (b) union = union ? union.union(b) : b;
  });
  if (!union) return;
  union.expandByScalar(0.05);
  const found = [];
  state.objects.forEach((spec) => {
    if (selIds.includes(spec.id)) return;
    const b = getObjectBox(spec.id);
    if (b && union.intersectsBox(b)) found.push(spec.id);
  });
  if (!found.length) { setStatusInfo("Aucun voisin trouvé"); return; }
  state.selectedIds = [...selIds, ...found];
  transformControls.detach();
  const primary = primaryId();
  const mesh = primary ? findMesh(primary) : null;
  if (mesh && state.selectedIds.length === 1) transformControls.attach(mesh);
  renderObjectList();
  renderInspector();
  updateStatusBar();
  setStatusInfo(`${found.length} voisin(s) ajouté(s) à la sélection`);
}

function stickSelected() {
  const id = primaryId();
  if (!id || isClusterId(id) || !findMesh(id)) { setStatusInfo("Sélectionne un objet à coller"); return; }
  updateMatrices();
  const A = getObjectBox(id);
  if (!A) return;
  let chosen = null;
  state.objects.forEach((spec) => {
    if (spec.id === id) return;
    const B = getObjectBox(spec.id);
    if (!B) return;
    ["x", "y", "z"].forEach((axis) => {
      let sep, dir;
      if (B.min[axis] >= A.max[axis]) { sep = B.min[axis] - A.max[axis]; dir = 1; }
      else if (A.min[axis] >= B.max[axis]) { sep = A.min[axis] - B.max[axis]; dir = -1; }
      else return;
      if (sep >= 0 && (!chosen || sep < chosen.sep)) chosen = { spec, axis, sep, dir };
    });
  });
  if (!chosen) { setStatusInfo("Objets déjà en contact (ou aucun voisin collable)"); return; }
  pushUndo();
  const spec = findSpec(id);
  const mesh = findMesh(id);
  if (!spec || !mesh) return;
  const delta = chosen.dir * chosen.sep;
  spec.position[chosen.axis] = round(spec.position[chosen.axis] + delta);
  mesh.position[chosen.axis] = spec.position[chosen.axis];
  mesh.updateMatrix();
  renderInspector();
  updateStatusBar();
  setStatusInfo(`Collé contre « ${chosen.spec.name} » (axe ${chosen.axis.toUpperCase()})`);
}

/* ---- Align / Distribute ---- */
function setObjPosition(id, axis, value) {
  const spec = findSpec(id);
  const mesh = findMesh(id);
  if (!spec || !mesh) return;
  spec.position[axis] = round(value);
  mesh.position[axis] = spec.position[axis];
  mesh.updateMatrix();
}

function alignCentersXZ() {
  const items = selectedMeshIds().map((id) => ({ id, box: getObjectBox(id) })).filter((i) => i.box);
  if (items.length < 2) { setStatusInfo("Sélectionne au moins 2 objets pour aligner"); return; }
  pushUndo();
  updateMatrices();
  const cxs = items.map((i) => i.box.getCenter(new THREE.Vector3()).x);
  const czs = items.map((i) => i.box.getCenter(new THREE.Vector3()).z);
  const avgX = cxs.reduce((a, b) => a + b, 0) / items.length;
  const avgZ = czs.reduce((a, b) => a + b, 0) / items.length;
  items.forEach((item, idx) => {
    const center = item.box.getCenter(new THREE.Vector3());
    setObjPosition(item.id, "x", findSpec(item.id).position.x + (avgX - center.x));
    setObjPosition(item.id, "z", findSpec(item.id).position.z + (avgZ - center.z));
  });
  renderInspector();
  updateStatusBar();
  setStatusInfo(`${items.length} objets alignés au centre (XZ)`);
}

function distributeSelected(axis) {
  const items = selectedMeshIds().map((id) => ({ id, box: getObjectBox(id) })).filter((i) => i.box);
  if (items.length < 3) { setStatusInfo("Sélectionne au moins 3 objets pour répartir"); return; }
  pushUndo();
  updateMatrices();
  items.sort((a, b) => {
    const ca = a.box.getCenter(new THREE.Vector3())[axis];
    const cb = b.box.getCenter(new THREE.Vector3())[axis];
    return ca - cb;
  });
  const first = items[0].box.getCenter(new THREE.Vector3())[axis];
  const last = items[items.length - 1].box.getCenter(new THREE.Vector3())[axis];
  const step = items.length > 1 ? (last - first) / (items.length - 1) : 0;
  items.forEach((item, idx) => {
    const center = item.box.getCenter(new THREE.Vector3())[axis];
    setObjPosition(item.id, axis, findSpec(item.id).position[axis] + (first + step * idx - center));
  });
  renderInspector();
  updateStatusBar();
  setStatusInfo(`${items.length} objets répartis uniformément (${axis.toUpperCase()})`);
}

/* ---- Geo / Math ---- */
function meshStats(id) {
  const mesh = findMesh(id);
  if (!mesh || !mesh.geometry) return null;
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  if (!pos) return null;
  updateMatrices();
  const matrix = mesh.matrixWorld;
  const v = new THREE.Vector3();
  const wPos = [0, 0, 0].map(() => new THREE.Vector3());
  const index = geo.index;
  const read = (i) => { v.set(pos.getX(i), pos.getY(i), pos.getZ(i)); return v; };
  let faces = 0, surface = 0;
  let signedVolume = 0;
  const triCount = index ? index.count / 3 : pos.count / 3;
  for (let t = 0; t < triCount; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    faces++;
    wPos[0].copy(read(a)).applyMatrix4(matrix);
    wPos[1].copy(read(b)).applyMatrix4(matrix);
    wPos[2].copy(read(c)).applyMatrix4(matrix);
    const cross = wPos[1].clone().sub(wPos[0]).cross(wPos[2].clone().sub(wPos[0]));
    surface += cross.length() / 2;
    signedVolume += wPos[0].dot(wPos[1].clone().cross(wPos[2])) / 6;
  }
  const box = new THREE.Box3().setFromObject(mesh, true);
  const size = box.getSize(new THREE.Vector3());
  return { verts: pos.count, faces, triangles: triCount, surface, volume: Math.abs(signedVolume), size };
}

function vertexClusterTopology(id) {
  const mesh = findMesh(id);
  if (!mesh || !mesh.geometry || !mesh.geometry.attributes.position) return null;
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const indexed = Boolean(geo.index);
  const idxArr = indexed ? geo.index.array : null;
  const triCount = indexed ? idxArr.length / 3 : pos.count / 3;
  const triVert = (t, corner) => (indexed ? idxArr[t * 3 + corner] : t * 3 + corner);
  const uidOf = new Map();
  const unique = [];
  const order = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    if (uidOf.has(k)) order.push(uidOf.get(k));
    else { uidOf.set(k, unique.length); unique.push([pos.getX(i), pos.getY(i), pos.getZ(i)]); order.push(unique.length - 1); }
  }
  const parent = unique.map((_, i) => i);
  const findRoot = (x) => (parent[x] === x ? x : (parent[x] = findRoot(parent[x])));
  const link = (a, b) => { const ra = findRoot(a), rb = findRoot(b); if (ra !== rb) parent[ra] = rb; };
  for (let t = 0; t < triCount; t++) {
    const a = order[triVert(t, 0)], b = order[triVert(t, 1)], c = order[triVert(t, 2)];
    link(a, b); link(b, c);
  }
  const comps = new Map();
  unique.forEach((_, i) => {
    const r = findRoot(i);
    if (!comps.has(r)) comps.set(r, 0);
    comps.set(r, comps.get(r) + 1);
  });
  let isolated = 0, largest = 1, totalEdges = 0;
  const edgeSet = new Set();
  for (let t = 0; t < triCount; t++) {
    const a = order[triVert(t, 0)], b = order[triVert(t, 1)], c = order[triVert(t, 2)];
    const e1 = a < b ? `${a}:${b}` : `${b}:${a}`;
    const e2 = b < c ? `${b}:${c}` : `${c}:${b}`;
    const e3 = a < c ? `${a}:${c}` : `${c}:${a}`;
    edgeSet.add(e1); edgeSet.add(e2); edgeSet.add(e3);
  }
  totalEdges = edgeSet.size;
  comps.forEach((n) => { if (n === 1) isolated++; if (n > largest) largest = n; });
  return { featureVerts: unique.length, components: comps.size, isolated, largest, edges: totalEdges };
}

function subTopologyInfo() {
  if (!subData || subData.selected == null) return null;
  const { unique, tris, edges, selType, selected } = subData;
  if (selType === "vertex") {
    const vertex = unique[selected];
    const refs = tris.filter((t) => t.includes(selected));
    const neighbors = new Set();
    refs.forEach((t) => t.forEach((u) => { if (u !== selected) neighbors.add(u); }));
    return { label: `Sommet n°${selected}`, lines: [`Valence : ${neighbors.size} arêtes`, `Références : ${vertex.idxs.length}`] };
  }
  if (selType === "edge") {
    const ed = edges[selected];
    const used = tris.filter((t) => t.includes(ed.a) && t.includes(ed.b));
    return { label: `Arête n°${selected}`, lines: [`Faces adjacentes : ${used.length}`, `Extrémités : ${ed.a} → ${ed.b}`] };
  }
  if (selType === "face") {
    const tri = tris[selected];
    const ring = new Set();
    tris.forEach((t, fi) => {
      if (fi === selected) return;
      if (t.filter((u) => tri.includes(u)).length === 2) ring.add(fi);
    });
    return { label: `Face n°${selected}`, lines: [`Sommets : ${tri.join(", ")}`, `Faces voisines : ${ring.size}`] };
  }
  return null;
}

function showGeoInfo() {
  const panel = document.querySelector("#geoInfoPanel");
  panel.classList.toggle("hidden");
  if (panel.classList.contains("hidden")) return;
  renderGeoInfo();
}

function renderGeoInfo() {
  const panel = document.querySelector("#geoInfoPanel");
  const content = document.querySelector("#geoInfoContent");
  if (!panel || !content) return;
  const ids = selectedMeshIds();
  if (!ids.length) {
    content.innerHTML = '<div class="geo-row">Sélectionne un ou plusieurs objets 3D.</div>';
    return;
  }
  const lines = [];
  if (ids.length === 1) {
    const id = ids[0];
    const spec = findSpec(id);
    const stats = meshStats(id);
    if (stats) {
      lines.push(`<div class="geo-row"><b>${escapeHTML(spec?.name || "Objet")}</b></div>`);
      lines.push(`<div class="geo-row">Sommets : ${stats.verts} · Faces : ${stats.faces} · Arêtes : ${(vertexClusterTopology(id) || {}).edges ?? "—"}</div>`);
      lines.push(`<div class="geo-row">Dimensions : ${fmt2(stats.size.x)} × ${fmt2(stats.size.y)} × ${fmt2(stats.size.z)} m</div>`);
      lines.push(`<div class="geo-row">Surface : ${fmt2(stats.surface)} m² · Volume : ${fmt2(stats.volume)} m³</div>`);
      const topo = vertexClusterTopology(id);
      if (topo) {
        lines.push(`<div class="geo-row">Sommet-données : ${topo.featureVerts} · Composantes : ${topo.components} · Isolés : ${topo.isolated} · Plus grosse : ${topo.largest}</div>`);
      }
    } else {
      lines.push(`<div class="geo-row">Objet sans maillage mesurable.</div>`);
    }
    const sub = subTopologyInfo();
    if (sub) {
      lines.push(`<div class="geo-row geo-sub"><b>${sub.label}</b></div>`);
      sub.lines.forEach((l) => lines.push(`<div class="geo-row geo-sub">${l}</div>`));
    }
  } else {
    let totalSurface = 0, totalVolume = 0;
    ids.forEach((id) => {
      const stats = meshStats(id);
      if (stats) { totalSurface += stats.surface; totalVolume += stats.volume; }
    });
    lines.push(`<div class="geo-row"><b>${ids.length} objets sélectionnés</b></div>`);
    lines.push(`<div class="geo-row">Surface totale : ${fmt2(totalSurface)} m²</div>`);
    lines.push(`<div class="geo-row">Volume total : ${fmt2(totalVolume)} m³</div>`);
  }
  content.innerHTML = lines.join("");
}

function fmt2(v) {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? "0" : String(n);
}

/* ---- Scene animation ----
 * spec.anim = { type, amp, speed } ; types : sway | bob | spin | pulse | drift | water | cloth
 */
function updateSceneAnimation(dt) {
  const t = state.anim.t;
  state.objects.forEach((spec) => {
    if (!spec.anim) return;
    const mesh = findMesh(spec.id);
    if (!mesh) return;
    const a = spec.anim;
    switch (a.type) {
      case "sway": {
        mesh.rotation.z = Math.sin(t * a.speed) * a.amp * 0.4;
        mesh.rotation.y = Math.sin(t * a.speed * 0.73) * a.amp * 0.3;
        mesh.rotation.x = Math.sin(t * a.speed * 0.5 + 1) * a.amp * 0.1;
        break;
      }
      case "bob": {
        mesh.position.y = spec.position.y + Math.sin(t * a.speed) * a.amp;
        break;
      }
      case "spin": {
        mesh.rotation.y += a.speed * dt;
        break;
      }
      case "pulse": {
        const s = 1 + Math.sin(t * a.speed) * a.amp * 0.3;
        mesh.scale.set(spec.scale.x * s, spec.scale.y * s, spec.scale.z * s);
        break;
      }
      case "drift": {
        mesh.position.y = spec.position.y + Math.sin(t * a.speed) * a.amp;
        mesh.rotation.y += a.speed * dt * 0.4;
        mesh.rotation.x += a.speed * dt * 0.15;
        break;
      }
      case "water":
      case "cloth": {
        animateWaveMesh(mesh, a, t);
        break;
      }
    }
  });
}

function animateWaveMesh(mesh, a, t) {
  const base = mesh.userData.animBase;
  if (!base) return;
  const pos = mesh.geometry.attributes.position;
  const horizontal = a.type === "water";
  for (let i = 0; i < pos.count; i++) {
    const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
    if (horizontal) {
      const y = by
        + Math.sin(t * a.speed + bx * 3.1 + bz * 2.3) * a.amp
        + Math.cos(t * a.speed * 0.7 + bz * 4.1 - bx * 1.7) * a.amp * 0.55;
      pos.setY(i, y);
    } else {
      const z = bz
        + Math.sin(t * a.speed + bx * 4 + by * 3) * a.amp
        + Math.cos(t * a.speed * 0.8 + by * 5) * a.amp * 0.45;
      pos.setZ(i, z);
    }
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

function toggleAnimPlay() {
  state.anim.playing = !state.anim.playing;
  document.querySelector("#animBtn")?.classList.toggle("active", state.anim.playing);
  setStatusInfo(state.anim.playing ? "Animation : lecture" : "Animation : pause");
}

function setObjectAnim(type) {
  const ids = selectedMeshIds();
  if (!ids.length) { setStatusInfo("Sélectionne d'abord un objet"); return; }
  pushUndo();
  ids.forEach((id) => {
    const spec = findSpec(id);
    const mesh = findMesh(id);
    if (!spec || !mesh) return;
    if (type === "none") {
      spec.anim = null;
      mesh.userData.anim = null;
      mesh.rotation.set(spec.rotation?.x || 0, spec.rotation?.y || 0, spec.rotation?.z || 0);
      mesh.position.set(spec.position.x, spec.position.y, spec.position.z);
      return;
    }
    const presets = {
      sway: { amp: 0.18, speed: 1.1 },
      bob: { amp: 0.12, speed: 1.2 },
      spin: { amp: 0, speed: 1.1 },
      pulse: { amp: 0.35, speed: 0.8 },
    };
    spec.anim = { type, ...presets[type] };
    mesh.userData.anim = spec.anim;
    if ((type === "water" || type === "cloth") && !mesh.userData.animBase && mesh.geometry?.attributes?.position) {
      mesh.userData.animBase = new Float32Array(mesh.geometry.attributes.position.array.slice());
    }
  });
  renderInspector();
  updateStatusBar();
  setStatusInfo(type === "none" ? "Animation supprimée" : `Animation ${type} appliquée`);
}

function linkSelected() {
  const ids = selectedMeshIds();
  if (ids.length < 2) { setStatusInfo("Sélectionne ≥ 2 objets pour lier (le dernier sélectionné devient parent)"); return; }
  pushUndo();
  const parent = ids[ids.length - 1];
  ids.forEach((id) => {
    if (id === parent) return;
    const spec = findSpec(id);
    if (spec) spec.parentId = parent;
  });
  renderObjectList();
  setStatusInfo(`Objets liés au parent (déplace le parent pour entraîner les enfants)`);
}

function unlinkSelected() {
  const ids = selectedMeshIds();
  if (!ids.length) { setStatusInfo("Aucun objet sélectionné"); return; }
  pushUndo();
  ids.forEach((id) => {
    const spec = findSpec(id);
    if (spec) spec.parentId = null;
  });
  renderObjectList();
  setStatusInfo("Liaison supprimée");
}

function propagateLinked(id, delta) {
  state.objects.forEach((spec) => {
    if (spec.parentId !== id) return;
    const mesh = findMesh(spec.id);
    if (!mesh) return;
    spec.position.x = round(spec.position.x + delta.x);
    spec.position.y = round(spec.position.y + delta.y);
    spec.position.z = round(spec.position.z + delta.z);
    mesh.position.set(spec.position.x, spec.position.y, spec.position.z);
    mesh.updateMatrix();
    propagateLinked(spec.id, delta);
  });
}

/* ---- Cinematic timeline & keyframes ---- */
const CINE_STEP = 4;

function cineHasKeys() {
  const c = state.cine;
  return c.shots.length + c.objKeys.length > 0;
}

function cineDuration() {
  const c = state.cine;
  if (c.duration && c.duration > 0) return c.duration;
  let maxT = 0;
  for (const s of c.shots) maxT = Math.max(maxT, s.t || 0);
  for (const k of c.objKeys) maxT = Math.max(maxT, k.t || 0);
  return Math.max(CINE_STEP, maxT + CINE_STEP);
}

const CINE_EASES = {
  linear: (p) => p,
  easeIn: (p) => p * p,
  easeOut: (p) => 1 - Math.pow(1 - p, 2),
  easeInOut: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
};

function cineEase(p, ease) {
  const f = CINE_EASES[ease] || CINE_EASES.easeInOut;
  return f(Math.max(0, Math.min(1, p)));
}

function lerpAngle(a, b, p) {
  let d = (b - a) % (Math.PI * 2);
  if (d < -Math.PI) d += Math.PI * 2;
  if (d > Math.PI) d -= Math.PI * 2;
  return a + d * p;
}

function lerpColor(ca, cb, p) {
  return new THREE.Color(ca).lerp(new THREE.Color(cb), p).getStyle();
}

function v3cp(v) {
  return { x: v.x, y: v.y, z: v.z };
}

function cineObjKeyed(id) {
  return state.cine.objKeys.some((k) => k.id === id);
}

function cineData() {
  const c = state.cine;
  return {
    shots: c.shots.map((s) => ({ pos: s.pos, target: s.target, t: s.t, ease: s.ease })),
    objKeys: c.objKeys.map((k) => ({ id: k.id, t: k.t, pos: k.pos, rot: k.rot, scale: k.scale, color: k.color, opacity: k.opacity })),
    loop: !!c.loop,
    duration: c.duration || null,
  };
}

function restoreCineData(d) {
  const c = state.cine;
  c.shots = ((d && d.shots) || []).map((s, i) => {
    const t = typeof s.t === "number" ? s.t : i * CINE_STEP;
    const pos = s.pos || (s.pv && { x: s.pv.x, y: s.pv.y, z: s.pv.z }) || { x: 0, y: 2, z: 5 };
    const target = s.target || (s.tv && { x: s.tv.x, y: s.tv.y, z: s.tv.z }) || { x: 0, y: 0, z: 0 };
    return { pos, target, pv: new THREE.Vector3(pos.x, pos.y, pos.z), tv: new THREE.Vector3(target.x, target.y, target.z), t, ease: s.ease || "easeInOut" };
  });
  c.objKeys = ((d && d.objKeys) || []).filter((k) => state.objects.some((o) => o.id === k.id)).map((k) => ({
    id: k.id,
    t: typeof k.t === "number" ? k.t : 0,
    ease: k.ease || "linear",
    pos: k.pos || null,
    rot: k.rot || null,
    scale: k.scale || null,
    color: k.color || null,
    opacity: typeof k.opacity === "number" ? k.opacity : null,
  }));
  c.loop = !!(d && d.loop);
  c.duration = (d && d.duration) || null;
  c.index = c.shots.length ? Math.min(Math.max(c.index, 0), c.shots.length - 1) : -1;
  c.playing = false;
  c.t = 0;
  renderCineTimeline();
  updateCineHead();
}

function sortedShots() {
  return state.cine.shots.slice().sort((a, b) => a.t - b.t);
}

function ensureShotKey(s) {
  if (!s.pv) s.pv = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z);
  if (!s.tv) s.tv = new THREE.Vector3(s.target.x, s.target.y, s.target.z);
  return s;
}

function captureShot() {
  const c = state.cine;
  const lastT = c.shots.reduce((m, s) => Math.max(m, s.t || 0), 0);
  const t = c.t > 0.01 && c.t < lastT ? c.t : lastT + CINE_STEP;
  const shot = {
    pos: v3cp(camera.position),
    target: v3cp(controls.target),
    pv: camera.position.clone(),
    tv: controls.target.clone(),
    t,
    ease: "easeInOut",
  };
  c.shots.push(shot);
  c.shots.sort((a, b) => a.t - b.t);
  c.index = c.shots.indexOf(shot);
  c.t = t;
  renderCineTimeline();
  updateCineHead();
  setStatusInfo(`Clé caméra à ${t.toFixed(1)}s (${c.shots.length} clés)`);
}

function goCineShot(i) {
  const c = state.cine;
  if (!c.shots.length) { setStatusInfo("Aucune clé caméra (bouton Clé)"); return; }
  c.index = Math.max(0, Math.min(c.shots.length - 1, i));
  const s = ensureShotKey(sortedShots()[c.index]);
  c.t = s.t;
  cineEval(c.t);
  controls.update();
  updateCineHead();
  setStatusInfo(`Clé caméra ${c.index + 1}/${c.shots.length} à ${s.t.toFixed(1)}s`);
}

function toggleCine() {
  const c = state.cine;
  if (c.playing) {
    c.playing = false;
    controls.enabled = true;
    setStatusInfo("Lecture arrêtée");
    return;
  }
  if (!cineHasKeys()) { setStatusInfo("Ajoute d'abord des clés (Clé / Clé Obj)"); return; }
  if (c.t >= cineDuration() - 0.01) c.t = 0;
  c.playing = true;
  controls.enabled = false;
  setStatusInfo("Lecture de la timeline");
}

function cineCameraState(shots, t) {
  if (!shots.length) return null;
  const first = ensureShotKey(shots[0]);
  const last = ensureShotKey(shots[shots.length - 1]);
  if (t <= first.t) return { pv: first.pv.clone(), tv: first.tv.clone() };
  if (t >= last.t) return { pv: last.pv.clone(), tv: last.tv.clone() };
  for (let i = 0; i < shots.length - 1; i++) {
    const a = ensureShotKey(shots[i]);
    const b = ensureShotKey(shots[i + 1]);
    if (t >= a.t && t <= b.t) {
      const p = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      const e = cineEase(p, a.ease);
      return {
        pv: new THREE.Vector3().lerpVectors(a.pv, b.pv, e),
        tv: new THREE.Vector3().lerpVectors(a.tv, b.tv, e),
      };
    }
  }
  return null;
}

function meshMatColor(mat) {
  const m = Array.isArray(mat) ? mat[0] : mat;
  if (!m || !m.color) return { color: null, opacity: null };
  const color = "#" + m.color.getHexString();
  const opacity = m.transparent || m.opacity < 1 ? m.opacity : null;
  return { color, opacity };
}

function captureKeyVals(spec, mesh) {
  const mc = meshMatColor(mesh.material);
  return {
    pos: { x: round(mesh.position.x), y: round(mesh.position.y), z: round(mesh.position.z) },
    rot: { x: round(mesh.rotation.x), y: round(mesh.rotation.y), z: round(mesh.rotation.z) },
    scale: { x: round(mesh.scale.x), y: round(mesh.scale.y), z: round(mesh.scale.z) },
    color: mc.color,
    opacity: mc.opacity,
  };
}

function keyValsForKey(k) {
  return { pos: k.pos, rot: k.rot, scale: k.scale, color: k.color, opacity: k.opacity };
}

function lerpKeyVals(a, b, p) {
  return {
    pos: {
      x: a.pos.x + (b.pos.x - a.pos.x) * p,
      y: a.pos.y + (b.pos.y - a.pos.y) * p,
      z: a.pos.z + (b.pos.z - a.pos.z) * p,
    },
    rot: {
      x: lerpAngle(a.rot.x, b.rot.x, p),
      y: lerpAngle(a.rot.y, b.rot.y, p),
      z: lerpAngle(a.rot.z, b.rot.z, p),
    },
    scale: {
      x: a.scale.x + (b.scale.x - a.scale.x) * p,
      y: a.scale.y + (b.scale.y - a.scale.y) * p,
      z: a.scale.z + (b.scale.z - a.scale.z) * p,
    },
    color: a.color && b.color ? lerpColor(a.color, b.color, p) : null,
    opacity: a.opacity != null && b.opacity != null ? a.opacity + (b.opacity - a.opacity) * p : null,
  };
}

function evalObjKeys(keys, t) {
  if (!keys.length) return null;
  if (t <= keys[0].t) return keyValsForKey(keys[0]);
  const last = keys[keys.length - 1];
  if (t >= last.t) return keyValsForKey(last);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return lerpKeyVals(a, b, cineEase(p, a.ease));
    }
  }
  return keyValsForKey(last);
}

function applyObjKeyVals(id, vals) {
  const mesh = findMesh(id);
  const spec = findSpec(id);
  if (!mesh || !vals.pos) return;
  mesh.position.set(vals.pos.x, vals.pos.y, vals.pos.z);
  mesh.rotation.set(vals.rot.x, vals.rot.y, vals.rot.z);
  mesh.scale.set(vals.scale.x, vals.scale.y, vals.scale.z);
  if (spec) {
    spec.position = { x: vals.pos.x, y: vals.pos.y, z: vals.pos.z };
    spec.rotation = { x: vals.rot.x, y: vals.rot.y, z: vals.rot.z };
    spec.scale = { x: vals.scale.x, y: vals.scale.y, z: vals.scale.z };
  }
  if (vals.color) {
    const col = new THREE.Color(vals.color);
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const arr = Array.isArray(o.material) ? o.material : [o.material];
      arr.forEach((m) => m.color && m.color.copy(col));
    });
  }
  if (vals.opacity != null) {
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const arr = Array.isArray(o.material) ? o.material : [o.material];
      arr.forEach((m) => {
        m.transparent = true;
        m.opacity = vals.opacity;
        m.needsUpdate = true;
      });
    });
  }
}

function cineEval(t) {
  const shots = sortedShots();
  if (shots.length) {
    const cam = cineCameraState(shots, t);
    if (cam) {
      camera.position.copy(cam.pv);
      controls.target.copy(cam.tv);
    }
  }
  const byId = {};
  for (const k of state.cine.objKeys) {
    if (!k.pos) continue;
    if (!findSpec(k.id)) continue;
    if (!byId[k.id]) byId[k.id] = [];
    byId[k.id].push(k);
  }
  for (const id in byId) {
    const keys = byId[id].slice().sort((a, b) => a.t - b.t);
    const vals = evalObjKeys(keys, t);
    if (vals) applyObjKeyVals(id, vals);
  }
}

function cineTick(dt) {
  const c = state.cine;
  if (!cineHasKeys()) { c.playing = false; controls.enabled = true; return; }
  c.t += dt;
  const total = cineDuration();
  if (c.t >= total) {
    if (c.loop) {
      c.t = c.t % total;
    } else {
      c.t = total;
      cineEval(c.t);
      stopCineRecordingIfDone();
      c.playing = false;
      controls.enabled = true;
      setStatusInfo("Cinématique terminée");
      return;
    }
  }
  cineEval(c.t);
  updateCineHead();
}

function seekCine(t) {
  const c = state.cine;
  c.t = Math.max(0, Math.min(cineDuration(), t));
  cineEval(c.t);
  controls.update();
  updateCineHead();
}

function addObjectKeyframe() {
  const id = primaryId();
  if (!id || isClusterId(id)) { setStatusInfo("Sélectionne un objet (pas un groupe) à animer"); return; }
  const mesh = findMesh(id);
  if (!mesh) return;
  const c = state.cine;
  const t = Math.max(0, c.t);
  const vals = captureKeyVals(findSpec(id), mesh);
  const existing = c.objKeys.find((k) => k.id === id && Math.abs(k.t - t) < 0.25);
  if (existing) {
    Object.assign(existing, vals);
    existing.t = t;
  } else {
    c.objKeys.push(Object.assign({ id, t, ease: "linear" }, vals));
  }
  c.objKeys.sort((a, b) => a.t - b.t);
  renderCineTimeline();
  updateCineHead();
  setStatusInfo(`Clé d'animation à ${t.toFixed(1)}s`);
}

function removeKeyAtPlayhead() {
  const c = state.cine;
  const t = c.t;
  let n = 0;
  const nbShots = c.shots.length;
  c.shots = c.shots.filter((s) => Math.abs((s.t || 0) - t) > 0.25);
  n += nbShots - c.shots.length;
  const id = primaryId();
  if (id) {
    const nbObj = c.objKeys.length;
    c.objKeys = c.objKeys.filter((k) => !(k.id === id && Math.abs(k.t - t) < 0.25));
    n += nbObj - c.objKeys.length;
  }
  c.index = c.shots.length ? Math.max(0, Math.min(c.index, c.shots.length - 1)) : -1;
  renderCineTimeline();
  updateCineHead();
  setStatusInfo(n ? `${n} clé(s) supprimée(s)` : "Aucune clé à la position courante");
}

function toggleCineLoop() {
  const c = state.cine;
  c.loop = !c.loop;
  document.querySelector("#cineLoopBtn")?.classList.toggle("active", c.loop);
  setStatusInfo(c.loop ? "Lecture en boucle activée" : "Lecture en boucle désactivée");
}

function toggleCinePanel() {
  const panel = document.querySelector("#cinePanel");
  const btn = document.querySelector("#cinePanelBtn");
  if (!panel) return;
  const hide = panel.classList.toggle("hidden");
  if (btn) btn.classList.toggle("active", !hide);
  if (!hide) {
    renderCineTimeline();
    updateCineHead();
  }
}

function cineXPx(el, total, t) {
  const labelW = 88;
  const w = (el && el.clientWidth) ? el.clientWidth : 900;
  const p = total > 0 ? Math.max(0, Math.min(1, (t || 0) / total)) : 0;
  return labelW + (w - labelW) * p;
}

function cineTFromEvent(ev, el, total) {
  const rect = el.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const labelW = 88;
  const trackW = Math.max(1, rect.width - labelW);
  return Math.max(0, ((x - labelW) / trackW) * total);
}

function updateCineHead() {
  const c = state.cine;
  const total = cineDuration();
  const el = document.getElementById("cineTime");
  if (el) el.textContent = `${c.t.toFixed(1)}s / ${total.toFixed(1)}s`;
  const ph = document.getElementById("cinePlayhead");
  if (ph) ph.style.left = cineXPx(ph.parentElement, total, c.t) + "px";
}

function renderCineTimeline() {
  const el = document.getElementById("cineTimeline");
  if (!el) return;
  const c = state.cine;
  const total = cineDuration();
  el.innerHTML = "";

  const ruler = document.createElement("div");
  ruler.className = "cine-row cine-ruler-row";
  const rtrack = document.createElement("div");
  rtrack.className = "cine-track cine-ruler-track";
  const step = total <= 8 ? 1 : 2;
  for (let i = 0; i * step <= total + 0.001; i++) {
    const tk = document.createElement("span");
    tk.className = "cine-tick";
    tk.textContent = String(i * step);
    rtrack.appendChild(tk);
  }
  ruler.appendChild(rtrack);
  el.appendChild(ruler);

  const addLane = (label, keyList, cls) => {
    const row = document.createElement("div");
    row.className = "cine-row";
    const l = document.createElement("div");
    l.className = "cine-lane-label " + (cls.indexOf("cam") >= 0 ? "cam" : "obj");
    l.textContent = label;
    row.appendChild(l);
    const track = document.createElement("div");
    track.className = "cine-track";
    track.addEventListener("pointerdown", (ev) => {
      if (ev.target === track) seekCine(cineTFromEvent(ev, el, total));
    });
    keyList.forEach((key) => {
      const mk = document.createElement("div");
      mk.className = cls;
      mk.style.left = ((total > 0 ? Math.max(0, Math.min(1, key.t / total)) : 0) * 100) + "%";
      mk.title = `${key.t.toFixed(1)}s`;
      mk.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        state.cine.playing = false;
        controls.enabled = true;
        const move = (e2) => {
          key.t = Math.max(0, cineTFromEvent(e2, el, total));
          mk.style.left = ((total > 0 ? Math.max(0, Math.min(1, key.t / total)) : 0) * 100) + "%";
          updateCineHead();
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          c.shots.sort((a, b) => a.t - b.t);
          c.objKeys.sort((a, b) => a.t - b.t);
          renderCineTimeline();
          updateCineHead();
          setStatusInfo(`Clé déplacée à ${key.t.toFixed(1)}s`);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });
      track.appendChild(mk);
    });
    row.appendChild(track);
    el.appendChild(row);
  };

  if (c.shots.length) addLane("Caméra", sortedShots(), "cine-key-cam");
  const ids = [...new Set(c.objKeys.map((k) => k.id))].filter((id) => findSpec(id));
  ids.forEach((id) => {
    const spec = findSpec(id);
    const keys = c.objKeys.filter((k) => k.id === id).sort((a, b) => a.t - b.t);
    if (keys.length) addLane(spec ? spec.name : "?", keys, "cine-key-obj");
  });

  const ph = document.createElement("div");
  ph.className = "cine-playhead";
  ph.id = "cinePlayhead";
  el.appendChild(ph);
  updateCineHead();
}

function exportVideo() {
  const c = state.cine;
  if (typeof MediaRecorder === "undefined") { setStatusInfo("MediaRecorder indisponible dans ce navigateur"); return; }
  if (c.rec && c.rec.state !== "inactive") return;
  if (!cineHasKeys()) { setStatusInfo("Ajoute d'abord des clés (Clé / Clé Obj)"); return; }
  c.playing = true;
  c.t = 0;
  controls.enabled = false;
  const stream = renderer.domElement.captureStream(30);
  const mime = ["video/webm;codecs=vp9", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug(state.name)}-cine.webm`;
    link.click();
    URL.revokeObjectURL(url);
    stream.getTracks().forEach((t) => t.stop());
    setStatusInfo("Vidéo exportée");
  };
  c.rec = rec;
  c.recStart = performance.now();
  rec.start(200);
  setStatusInfo(`Export vidéo en cours (${cineDuration().toFixed(0)}s)…`);
}

function stopCineRecordingIfDone() {
  const c = state.cine;
  if (c.rec && c.rec.state === "recording") {
    c.rec.stop();
    c.rec = null;
  }
}

/* ---- Landscape vegetation ---- */
function scatterVegetation(kind) {
  const ls = state.landscape;
  if (!ls.mesh) { setStatusInfo("Construis d'abord un paysage (Sculpt → Appliquer)"); return; }
  const key = `scatter_${kind}`;
  if (ls[key]) landscapeGroup.remove(ls[key]);
  const counts = { grass: 2400, shrub: 80, rock: 34 }[kind] || 0;
  if (kind === "clear") {
    Object.keys(ls).forEach((k) => { if (String(k).startsWith("scatter_") && ls[k]) landscapeGroup.remove(ls[k]); });
    ls.scatter_grass = ls.scatter_shrub = ls.scatter_rock = null;
    setStatusInfo("Végétation retirée du paysage");
    return;
  }
  let geom;
  const color = kind === "grass" ? 0x6ab24a : kind === "shrub" ? 0x3f7a3f : 0x7a7a7a;
  const rz = kind === "grass" ? 0.05 : 0.18;
  const ry = kind === "grass" ? 0.24 : 0.5;
  if (kind === "grass") geom = new THREE.ConeGeometry(rz, ry, 4);
  else geom = new THREE.IcosahedronGeometry(rz, kind === "rock" ? 1 : 0);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: kind === "rock" ? 0.08 : 0 });
  const im = new THREE.InstancedMesh(geom, mat, counts);
  const dummy = new THREE.Object3D();
  const ray = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3(0, -1, 0);
  const half = ls.size / 2;
  let placed = 0;
  for (let i = 0; i < counts; i++) {
    origin.set((Math.random() * 2 - 1) * half, 120, (Math.random() * 2 - 1) * half);
    ray.set(origin, dir);
    const hits = ray.intersectObject(ls.mesh, false);
    if (!hits.length) continue;
    const p = hits[0].point;
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.setScalar(kind === "grass" ? 0.7 + Math.random() * 0.9 : 0.6 + Math.random() * 1.3);
    dummy.rotation.set(kind === "grass" ? 0 : Math.random() * Math.PI, Math.random() * Math.PI * 2, 0);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
    placed++;
  }
  im.count = placed;
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = im.receiveShadow = true;
  landscapeGroup.add(im);
  ls[key] = im;
  setStatusInfo(`${placed} ${kind} réparti(s) sur le terrain`);
}

function clearVegetation() {
  scatterVegetation("clear");
}

function initLighting() {
  const ambient = new THREE.HemisphereLight(0xffffff, 0x283038, 1.5);
  ambient.intensity = 0.9;
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
  sun.position.set(5, 8, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  window.__inerreSun = sun;

  const fill = new THREE.DirectionalLight(0xa8c8ff, 0.6);
  fill.position.set(-6, 4, -5);
  scene.add(fill);

  const bounce = new THREE.PointLight(0xffffff, 0.35, 20);
  bounce.position.set(0, 1.2, 0);
  scene.add(bounce);

  gridHelper = new THREE.GridHelper(40, 40, 0x4f6660, 0x2c3436);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);
}

function initQuadView() {
  const size = 20;
  vpFrontCam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0.1, 100);
  vpFrontCam.position.set(0, 0, 20);
  vpFrontCam.lookAt(0, 0, 0);

  vpTopCam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0.1, 100);
  vpTopCam.position.set(0, 20, 0);
  vpTopCam.lookAt(0, 0, 0);

  vpLeftCam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0.1, 100);
  vpLeftCam.position.set(-20, 0, 0);
  vpLeftCam.lookAt(0, 0, 0);

  const gridColor1 = 0x4f6660, gridColor2 = 0x2c3436;
  vpFrontGrid = new THREE.GridHelper(size, size, gridColor1, gridColor2);
  vpFrontGrid.position.y = 0.01;
  vpTopGrid = new THREE.GridHelper(size, size, gridColor1, gridColor2);
  vpTopGrid.position.y = 0.01;
  vpLeftGrid = new THREE.GridHelper(size, size, gridColor1, gridColor2);
  vpLeftGrid.position.y = 0.01;
  vpFrontGrid.visible = false;
  vpTopGrid.visible = false;
  vpLeftGrid.visible = false;
  scene.add(vpFrontGrid, vpTopGrid, vpLeftGrid);
}

function toggleQuadView() {
  state.quadView = !state.quadView;
  quadViewActive = state.quadView;
  dom.quadViewBtn.classList.toggle("active", state.quadView);
  dom.vpOverlay.classList.toggle("hidden", !state.quadView);
  dom.vpDividerH.classList.toggle("hidden", !state.quadView);
  dom.vpDividerV.classList.toggle("hidden", !state.quadView);
  if (gridHelper) gridHelper.visible = !state.quadView;
  if (vpFrontGrid) { vpFrontGrid.visible = state.quadView; vpTopGrid.visible = state.quadView; vpLeftGrid.visible = state.quadView; }
  resize();
  renderObjectList();
}

function setActiveView(view) {
  state.activeView = view;
  if (!state.quadView) {
    dom.vpOverlay.querySelectorAll(".vp-label").forEach(el => el.style.color = "");
    return;
  }
  dom.vpOverlay.querySelectorAll(".vp-label").forEach(el => {
    el.style.color = el.dataset.vpId === view ? "#35b49c" : "rgba(255,255,255,0.5)";
  });
}

function setSubObjectLevel(level) {
  state.subObjectLevel = level;
  document.querySelectorAll("[data-subobj]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.subobj === level);
  });
  if (level === "object") {
    exitSubObjectMode();
  } else {
    enterSubMode(level);
  }
  dom.statusMode.textContent = `Mode: ${level === "object" ? "Objet" : level.charAt(0).toUpperCase() + level.slice(1)}`;
  updateStatusBar();
}

function setSelectionFilter(filter) {
  state.selectionFilter = filter;
  document.querySelectorAll("[data-sel-filter]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.selFilter === filter);
  });
}

function setTransformTool(tool) {
  if (tool === "select") {
    transformControls.detach();
    document.querySelectorAll("[data-transform]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.transform === tool);
    });
    return;
  }
  setTransformMode(tool);
  document.querySelectorAll("[data-transform]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.transform === tool);
  });
}

function populateSceneTree() {
  const el = dom.sceneTree;
  if (!el) return;
  const items = [];
  function walk(group, depth) {
    group.children.forEach(child => {
      if (child.isMesh || child.isGroup) {
        const id = child.userData.id;
        if (!id) return;
        const spec = findSpec(id);
        const name = spec?.name || child.name || "Objet";
        const type = spec?.type || "mesh";
        const isSel = state.selectedIds.includes(id);
        const hasChildren = child.children && child.children.length > 0;
        items.push({ id, name, type, depth, isSel, visible: child.visible, hasChildren, expanded: true });
        if (hasChildren && child.expanded !== false) walk(child, depth + 1);
      }
    });
  }
  walk(objectGroup, 0);
  el.innerHTML = items.map(item => `
    <div class="tree-item${item.isSel ? " active" : ""} indent-${item.depth}" data-tree-id="${item.id}">
      <button class="tree-toggle">${item.hasChildren ? "▾" : ""}</button>
      <span class="tree-name">${item.name.replace(/</g, "&lt;")}</span>
      <button class="tree-vis" data-vis-id="${item.id}">${item.visible ? "👁" : "◌"}</button>
      <span class="tree-type">${item.type}</span>
    </div>
  `).join("");
  el.querySelectorAll(".tree-item").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".tree-vis")) return;
      const id = item.dataset.treeId;
      const ids = state.selectedIds.includes(id) ? state.selectedIds.filter(i => i !== id) : [...state.selectedIds, id];
      state.selectedIds = ids;
      const primary = primaryId();
      const mesh = primary ? findMesh(primary) : null;
      transformControls.detach();
      if (mesh && state.selectedIds.length === 1) transformControls.attach(mesh);
      renderObjectList();
      populateSceneTree();
      renderInspector();
      updateStatusBar();
    });
    item.querySelector(".tree-vis")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = item.dataset.treeId;
      const mesh = findMesh(id);
      if (mesh) { mesh.visible = !mesh.visible; populateSceneTree(); }
    });
  });
}

function updateModifierStack() {
  const el = dom.modifierStack;
  if (!el) return;
  const id = primaryId();
  if (!id) { el.innerHTML = '<div class="stack-empty">Aucun objet sélectionné</div>'; return; }
  const mods = [
    { name: "Extrusion", icon: "▤", active: false },
    { name: "Boolean", icon: "⊎", active: state.boolean.active && id === state.boolean.firstId },
    { name: "Deform", icon: "≀", active: state.deform.active },
    { name: "Array/Mirror", icon: "⊞", active: false },
    { name: "Mesh Edit", icon: "◈", active: false },
  ];
  el.innerHTML = mods.map(m => `
    <div class="stack-item${m.active ? " active" : ""}">
      <span class="stack-icon">${m.icon}</span>
      <span class="stack-name">${m.name}</span>
      <button class="stack-x">×</button>
    </div>
  `).join("") || '<div class="stack-empty">Aucun modificateur</div>';
}

function updateSelectionInfo() {
  if (!dom.selectionInfo) return;
  const n = state.selectedIds.length;
  dom.selectionInfo.textContent = n === 0 ? "Aucun objet" : n === 1 ? "1 objet" : `${n} objets`;
  if (dom.statusCoords && state.selectedIds.length === 1) {
    const id = primaryId();
    const spec = findSpec(id);
    if (spec) {
      const p = spec.position;
      dom.statusCoords.textContent = `X: ${p.x.toFixed(2)}  Y: ${p.y.toFixed(2)}  Z: ${p.z.toFixed(2)}`;
      return;
    }
  }
  if (dom.statusCoords) dom.statusCoords.textContent = "X: 0.00  Y: 0.00  Z: 0.00";
}

function buildRoom() {
  roomGroup.clear();
  const { width, depth, height } = state.room;
  const preset = stylePresets[state.style] || stylePresets.american;
  const floorMat = createMaterial(preset.floor, { repeat: [Math.max(1, width / 2), Math.max(1, depth / 2)] });
  const wallMat = createMaterial(preset.wall, { side: THREE.DoubleSide, repeat: [Math.max(1, width / 2), Math.max(1, height / 2)] });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, depth), floorMat);
  floor.position.y = -0.04;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  if (gridHelper) {
    const maxDim = Math.max(width, depth) + 4;
    scene.remove(gridHelper);
    gridHelper = new THREE.GridHelper(maxDim, Math.round(maxDim / 0.5), 0x4f6660, 0x2c3436);
    gridHelper.position.y = 0.01;
    gridHelper.visible = state.showGrid;
    scene.add(gridHelper);
  }
  if (state.room.fromPlan) return;

  const backWall = makeWall(width, height, 0.12, wallMat);
  backWall.position.set(0, height / 2, -depth / 2);
  roomGroup.add(backWall);

  const leftWall = makeWall(depth, height, 0.12, wallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-width / 2, height / 2, 0);
  roomGroup.add(leftWall);

  const rightWall = makeWall(depth, height, 0.12, wallMat);
  rightWall.rotation.y = Math.PI / 2;
  rightWall.position.set(width / 2, height / 2, 0);
  roomGroup.add(rightWall);
}

function makeWall(width, height, thickness, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), material);
  mesh.receiveShadow = true;
  return mesh;
}

function bindUI() {
  document.querySelector("#newProjectBtn").addEventListener("click", newProject);
  document.querySelector("#openProjectBtn").addEventListener("click", () => dom.projectInput.click());
  document.querySelector("#saveProjectBtn").addEventListener("click", saveProject);
  document.querySelector("#saveAsProjectBtn").addEventListener("click", saveAsProject);
  document.querySelector("#exportObjBtn").addEventListener("click", exportOBJ);
  document.querySelector("#exportGLBBtn").addEventListener("click", exportGLB);
  document.querySelector("#importGLBBtn").addEventListener("click", () => dom.glbInput.click());
  document.querySelector("#importPanoramaBtn").addEventListener("click", () => dom.panoramaInput.click());
  document.querySelector("#exportPanoramaBtn").addEventListener("click", exportPanorama);
  document.querySelectorAll("[data-cmd-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = "cmd" + btn.dataset.cmdTab.charAt(0).toUpperCase() + btn.dataset.cmdTab.slice(1);
      document.querySelectorAll("[data-cmd-tab]").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".cmd-tab").forEach(t => t.classList.toggle("active", t.id === tabId));
    });
  });
  document.querySelector("#importPlanBtn").addEventListener("click", () => dom.planInput.click());
  document.querySelector("#applyRoomBtn").addEventListener("click", applyRoomInputs);
  document.querySelector("#applyStyleBtn").addEventListener("click", applyStylePreset);
  document.querySelector("#buildFromPlanBtn").addEventListener("click", buildFromPlan);
  document.querySelector("#clearPlanBtn").addEventListener("click", clearPlan);
  document.querySelector("#focusBtn").addEventListener("click", focusCamera);
  document.querySelectorAll("[data-pipeline]").forEach((item) => {
    item.addEventListener("click", () => {
      const step = item.dataset.pipeline;
      if (step === "pano") dom.panoramaInput.click();
      else if (step === "plan") setMode("plan");
      else if (step === "build") buildFromPlan();
      else if (step === "furnish") document.querySelector("#modelModeBtn").click();
      else if (step === "save") saveProject();
      else if (step === "export") exportOBJ();
    });
  });
  document.querySelectorAll("[data-draw-pipeline]").forEach((item) => {
    item.addEventListener("click", () => {
      const step = item.dataset.drawPipeline;
      if (step === "draw2d") setDrawTool("line");
      else if (step === "extrude") extrudeDrawShapes();
      else if (step === "exportDraw") exportOBJ();
    });
  });
  document.querySelector("#deleteBtn").addEventListener("click", deleteSelected);
  document.querySelector("#duplicateBtn").addEventListener("click", duplicateSelected);
  document.querySelector("#screenshotBtn").addEventListener("click", takeScreenshot);
  document.querySelector("#scaleUpBtn").addEventListener("click", scaleUpSelected);
  document.querySelector("#booleanBtn").addEventListener("click", toggleBoolean);
  document.querySelector("#connectBtn").addEventListener("click", connectObjects);
  document.querySelector("#deformBtn").addEventListener("click", toggleDeform);
  document.querySelector("#innerSelectBtn")?.addEventListener("click", selectSameType);
  document.querySelector("#separateBtn")?.addEventListener("click", selectSameType);
  document.querySelector("#snapBtn").addEventListener("click", toggleSnap);
  document.querySelectorAll("[data-sel-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setSelectionMode(btn.dataset.selMode));
  });
  document.querySelector("#gridBtn").addEventListener("click", toggleGrid);
  document.querySelector("#arrayBtn").addEventListener("click", toggleArray);
  document.querySelector("#applyArrayBtn").addEventListener("click", applyArray);
  document.querySelector("#arrayType").addEventListener("change", updateArrayOffsetLabel);
  document.querySelector("#mirrorBtn").addEventListener("click", toggleMirror);
  document.querySelectorAll("[data-mirror-axis]").forEach((btn) => {
    btn.addEventListener("click", () => mirrorSelected(btn.dataset.mirrorAxis));
  });
  document.querySelector("#clusterBtn")?.addEventListener("click", clusterSelected);
  document.querySelector("#unclusterBtn")?.addEventListener("click", unclusterSelected);
  document.querySelector("#neighBtn")?.addEventListener("click", selectNeighbors);
  document.querySelector("#stickBtn")?.addEventListener("click", stickSelected);
  document.querySelector("#alignCenterBtn")?.addEventListener("click", alignCentersXZ);
  document.querySelector("#distXBtn")?.addEventListener("click", () => distributeSelected("x"));
  document.querySelector("#distZBtn")?.addEventListener("click", () => distributeSelected("z"));
  document.querySelector("#geoInfoBtn")?.addEventListener("click", showGeoInfo);
  document.querySelector("#cineShotBtn")?.addEventListener("click", captureShot);
  document.querySelector("#cinePrevBtn")?.addEventListener("click", () => goCineShot(state.cine.index - 1));
  document.querySelector("#cineNextBtn")?.addEventListener("click", () => goCineShot(state.cine.index + 1));
  document.querySelector("#cinePlayBtn")?.addEventListener("click", toggleCine);
  document.querySelector("#cineExportBtn")?.addEventListener("click", exportVideo);
  document.querySelector("#cinePanelBtn")?.addEventListener("click", toggleCinePanel);
  document.querySelector("#cineObjKeyBtn")?.addEventListener("click", addObjectKeyframe);
  document.querySelector("#cineLoopBtn")?.addEventListener("click", toggleCineLoop);
  document.querySelector("#cineDelKeyBtn")?.addEventListener("click", removeKeyAtPlayhead);
  document.querySelector("#cineSeekBtn")?.addEventListener("click", () => goCineShot(0));
  document.querySelector("#cinePanelSaveBtn")?.addEventListener("click", () => {
    const d = cineData();
    setStatusInfo(`${d.shots.length} clés caméra · ${d.objKeys.length} clés d'objet · boucle ${d.loop ? "ON" : "OFF"} · ${cineDuration().toFixed(1)}s`);
  });
  document.querySelector("#animBtn")?.addEventListener("click", toggleAnimPlay);
  document.querySelector("#swayBtn")?.addEventListener("click", () => setObjectAnim("sway"));
  document.querySelector("#bobBtn")?.addEventListener("click", () => setObjectAnim("bob"));
  document.querySelector("#spinBtn")?.addEventListener("click", () => setObjectAnim("spin"));
  document.querySelector("#animNoneBtn")?.addEventListener("click", () => setObjectAnim("none"));
  document.querySelector("#linkBtn")?.addEventListener("click", linkSelected);
  document.querySelector("#unlinkBtn")?.addEventListener("click", unlinkSelected);
  document.querySelector("#natGrassBtn")?.addEventListener("click", () => scatterVegetation("grass"));
  document.querySelector("#natShrubBtn")?.addEventListener("click", () => scatterVegetation("shrub"));
  document.querySelector("#natRockBtn")?.addEventListener("click", () => scatterVegetation("rock"));
  document.querySelector("#natClearBtn")?.addEventListener("click", clearVegetation);

  document.querySelector("#meshSubdivideBtn").addEventListener("click", subdivideSelected);
  document.querySelector("#meshExtrudeBtn").addEventListener("click", extrudeSelected);
  document.querySelector("#meshBevelBtn").addEventListener("click", bevelSelected);
  document.querySelector("#measureBtn").addEventListener("click", toggleMeasure);
  document.querySelector("#clearMeasureBtn")?.addEventListener("click", clearMeasurements);
  document.querySelector("#dropBtn")?.addEventListener("click", dropSelectedToFloor);
  document.querySelector("#collisionBtn")?.addEventListener("click", toggleCollision);
  document.querySelector("#meshSmoothBtn").addEventListener("click", toggleSmoothShading);
  document.querySelector("#meshFlatBtn").addEventListener("click", toggleSmoothShading);
  document.querySelector("#meshMirrorBtn").addEventListener("click", () => meshMirrorSelected("x"));
  document.querySelector("#meshWeldBtn").addEventListener("click", weldSelected);
  document.querySelector("#meshCollapseBtn").addEventListener("click", collapseSelected);
  document.querySelector("#snapSizeSelect").addEventListener("change", (e) => {
    state.snap.size = parseFloat(e.target.value);
    if (state.snap.enabled) applySnap();
  });
  document.querySelector("#gridSizeSelect").addEventListener("change", (e) => {
    const s = parseInt(e.target.value);
    if (gridHelper) {
      scene.remove(gridHelper);
      gridHelper = new THREE.GridHelper(s, s, 0x4f6660, 0x2c3436);
      gridHelper.position.y = 0.01;
      gridHelper.visible = state.showGrid;
      scene.add(gridHelper);
    }
  });

  document.querySelector("#createTerrainBtn").addEventListener("click", createTerrain);
  document.querySelectorAll("[data-sculpt]").forEach((button) => {
    button.addEventListener("click", () => setSculptTool(button.dataset.sculpt));
  });
  renderer.domElement.addEventListener("pointerdown", startSculpt);
  renderer.domElement.addEventListener("pointermove", moveSculpt);
  renderer.domElement.addEventListener("pointerup", endSculpt);

  document.querySelector("#modelModeBtn").addEventListener("click", () => setMode("model"));
  document.querySelector("#planModeBtn").addEventListener("click", () => setMode("plan"));
  document.querySelector("#panoModeBtn").addEventListener("click", () => setMode("pano"));
  document.querySelector("#splitModeBtn").addEventListener("click", () => setMode("split"));

  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => { pushUndo(); addObject(button.dataset.add); });
  });

  document.querySelectorAll("[data-plan-tool]").forEach((button) => {
    button.addEventListener("click", () => setPlanTool(button.dataset.planTool));
  });

  document.querySelectorAll("[data-material]").forEach((button) => {
    button.addEventListener("click", () => applyMaterialToSelection(button.dataset.material));
  });

  document.querySelectorAll("[data-draw-tool]").forEach((button) => {
    button.addEventListener("click", () => setDrawTool(button.dataset.drawTool));
  });
  document.querySelector("#extrude2dBtn").addEventListener("click", extrudeDrawShapes);
  document.querySelector("#revolveBtn").addEventListener("click", revolveDrawShapes);
  document.querySelector("#draw2dClearBtn")?.addEventListener("click", () => {
    state.draw.shapes = [];
    state.draw.current = null;
    renderDraw();
    updateDrawPipeline();
  });
  document.querySelector("#draw2dPipelineExportBtn")?.addEventListener("click", exportOBJ);

  document.querySelectorAll("[data-transform-mode]").forEach((button) => {
    button.addEventListener("click", () => setTransformMode(button.dataset.transformMode));
  });

  dom.drawCanvas.addEventListener("pointerdown", startDrawShape);
  dom.drawCanvas.addEventListener("pointermove", moveDrawShape);
  dom.drawCanvas.addEventListener("pointerup", endDrawShape);
  dom.drawCanvas.addEventListener("pointerleave", endDrawShape);

  dom.panoramaInput.addEventListener("change", importPanorama);
  dom.planInput.addEventListener("change", importPlanImage);
  dom.projectInput.addEventListener("change", openProject);
  dom.glbInput.addEventListener("change", importGLB);

  renderer.domElement.addEventListener("pointerdown", selectFromPointer);
  renderer.domElement.addEventListener("pointerdown", startBoxSelect);
  renderer.domElement.addEventListener("pointermove", moveBoxSelect);
  renderer.domElement.addEventListener("pointerup", endBoxSelect);
  renderer.domElement.addEventListener("pointerdown", startLassoSelect);
  renderer.domElement.addEventListener("pointermove", moveLassoSelect);
  renderer.domElement.addEventListener("pointerup", endLassoSelect);
  renderer.domElement.addEventListener("pointermove", updateSelectCursor);
  renderer.domElement.addEventListener("pointerdown", onMeasurePointer);
  renderer.domElement.addEventListener("pointerdown", pickSubFeature);
  dom.planCanvas.addEventListener("pointerdown", startPlanSegment);
  dom.planCanvas.addEventListener("pointermove", movePlanSegment);
  dom.planCanvas.addEventListener("pointerup", endPlanSegment);
  dom.planCanvas.addEventListener("pointerleave", endPlanSegment);

  ["objectName", "posX", "posY", "posZ", "scaleX", "scaleY", "scaleZ", "rotX", "rotY", "rotZ", "objectColor", "objectMaterial"].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener("input", updateSelectedFromInspector);
  });
  document.querySelector("#planScale").addEventListener("input", () => {
    state.plan.scale = numberValue("planScale", state.plan.scale);
    renderPlan();
  });

  // --- C4D-style right-click context menu ---
  const ctxMenu = document.querySelector("#ctxMenu");
  function showCtxMenu(x, y) {
    const hasSel = state.selectedIds.length > 0;
    ctxMenu.querySelectorAll("[data-ctx]").forEach(el => {
      const a = el.dataset.ctx;
      const disabled = !hasSel && !["selectAll","deselectAll"].includes(a);
      el.classList.toggle("disabled", disabled);
      const sk = el.querySelector(".shortcut");
      if (!sk) {
        const s = document.createElement("span");
        s.className = "shortcut";
        s.textContent = el.dataset.shortcut || "";
        el.appendChild(s);
      }
    });
    const mw = 220, mh = 320;
    const vw = window.innerWidth, vh = window.innerHeight;
    let cx = Math.min(x, vw - mw);
    let cy = Math.min(y, vh - mh);
    if (cx < 4) cx = 4;
    if (cy < 4) cy = 4;
    ctxMenu.style.left = cx + "px";
    ctxMenu.style.top = cy + "px";
    ctxMenu.classList.remove("hidden");
    requestAnimationFrame(() => ctxMenu.classList.add("visible"));
  }
  function hideCtxMenu() {
    ctxMenu.classList.remove("visible");
    setTimeout(() => ctxMenu.classList.add("hidden"), 120);
  }
  renderer.domElement.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (state.activeTool === "sculpt") return;
    showCtxMenu(e.clientX, e.clientY);
  });
  document.addEventListener("pointerdown", (e) => {
    if (!ctxMenu.contains(e.target)) hideCtxMenu();
  });
  ctxMenu.addEventListener("click", (e) => {
    const item = e.target.closest("[data-ctx]");
    if (!item || item.classList.contains("disabled")) return;
    hideCtxMenu();
    const action = item.dataset.ctx;
    switch (action) {
      case "move": setTransformMode("translate"); break;
      case "rotate": setTransformMode("rotate"); break;
      case "scale": setTransformMode("scale"); break;
      case "duplicate": duplicateSelected(); break;
      case "delete": deleteSelected(); break;
      case "hide": if (state.selectedIds.length) {
        const mesh = findMesh(primaryId());
        if (mesh) { mesh.visible = false; renderObjectList(); }
      } break;
      case "subdivide": subdivideSelected(); break;
      case "extrude": extrudeSelected(); break;
      case "bevel": bevelSelected(); break;
      case "focus": if (state.selectedIds.length) {
        const mesh = findMesh(primaryId());
        if (mesh) { controls.target.copy(mesh.position); }
      } break;
      case "selectAll":
        state.selectedIds = state.objects.map(o => o.id);
        transformControls.detach();
        { const p = primaryId(); const m = p ? findMesh(p) : null; if (m && state.selectedIds.length === 1) transformControls.attach(m); }
        renderObjectList(); break;
      case "deselectAll":
        state.selectedIds = []; transformControls.detach(); renderObjectList(); break;
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideCtxMenu();
    if (event.ctrlKey || event.metaKey) {
      if (event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((event.key === "z" && event.shiftKey) || event.key === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (event.key === "a") {
        event.preventDefault();
        state.selectedIds = state.objects.map((o) => o.id);
const primary = primaryId();
  const mesh = primary ? findMesh(primary) : null;
  if (subData && state.subObjectLevel !== "object") {
    if (subData.mesh !== mesh) {
      exitSubObjectMode();
      state.subObjectLevel = "object";
      document.querySelectorAll("[data-subobj]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.subobj === "object");
      });
    }
  }
  transformControls.detach();
  if (mesh && state.selectedIds.length === 1) transformControls.attach(mesh);
  renderObjectList();
  renderInspector();
}
    } else if (event.key === "Delete" || event.key === "Backspace") {
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      event.preventDefault();
      deleteSelected();
    }
  });
  window.addEventListener("resize", resize);
  // --- Left panel tab switching (Scene / AI) ---
  document.querySelectorAll("[data-left-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-left-tab]").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelector("#leftTabScene").classList.toggle("active", btn.dataset.leftTab === "scene");
      document.querySelector("#leftTabAI").classList.toggle("active", btn.dataset.leftTab === "ai");
    });
  });

  // --- AI Prompter ---
  const aiChat = document.querySelector("#aiChat");
  const aiInput = document.querySelector("#aiPrompterInput");
  const aiSend = document.querySelector("#aiPrompterSend");
  function addAIMessage(role, text) {
    const div = document.createElement("div");
    div.className = `ai-msg ai-${role}`;
    if (role === "system" || role === "assistant") {
      div.innerHTML = `<span class="ai-msg-icon">${role === "system" ? "I" : "A"}</span><div>${role === "system" ? "<strong>Assistant IA</strong>" : ""}<p>${text}</p></div>`;
    } else {
      div.innerHTML = `<p>${text}</p>`;
    }
    aiChat.appendChild(div);
    aiChat.scrollTop = aiChat.scrollHeight;
  }
  async function sendAIPrompt() {
    const prompt = aiInput.value.trim();
    if (!prompt) return;
    aiInput.value = "";
    addAIMessage("user", prompt);

    // --- Mode édition locale : sélection + prompt ---
    const lowerPrompt = prompt.toLowerCase();
    const hasSelection = state.selectedIds.length > 0;
    const isLocalEdit = hasSelection && (
      lowerPrompt.includes("reorganise") || lowerPrompt.includes("reorganize") ||
      lowerPrompt.includes("rearrange") || lowerPrompt.includes("déplace") ||
      lowerPrompt.includes("move") || lowerPrompt.includes("change") ||
      lowerPrompt.includes("modifie") || lowerPrompt.includes("ajoute") ||
      lowerPrompt.includes("add") || lowerPrompt.includes("réorganise")
    );

    if (isLocalEdit) {
      addAIMessage("assistant", "Réorganisation de la sélection...");
      pushUndo();
      const selectedSpecs = state.selectedIds.map(id => findSpec(id)).filter(Boolean);
      if (selectedSpecs.length > 0) {
        // Compute bounding box of selected objects
        const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
        for (const s of selectedSpecs) {
          const halfW = (s.scale?.x || 1) / 2;
          const halfD = (s.scale?.z || 1) / 2;
          bounds.minX = Math.min(bounds.minX, s.position.x - halfW);
          bounds.maxX = Math.max(bounds.maxX, s.position.x + halfW);
          bounds.minZ = Math.min(bounds.minZ, s.position.z - halfD);
          bounds.maxZ = Math.max(bounds.maxZ, s.position.z + halfD);
        }
        const margin = 1;
        const poly = [
          [bounds.minX - margin, bounds.minZ - margin],
          [bounds.maxX + margin, bounds.minZ - margin],
          [bounds.maxX + margin, bounds.maxZ + margin],
          [bounds.minX - margin, bounds.maxZ + margin],
        ];
        // Delete old objects (keep specs for type info)
        const oldTypes = selectedSpecs.map(s => s.type);
        for (const id of state.selectedIds) {
          const mesh = findMesh(id);
          if (mesh) objectGroup.remove(mesh);
          const idx = state.objects.findIndex(o => o.id === id);
          if (idx !== -1) state.objects.splice(idx, 1);
        }
        state.selectedIds = [];
        transformControls.detach();
        // Place new furniture with layout engine
        const engine = new SpatialLayoutEngine(poly);
        for (const type of oldTypes) {
          const dim = FURNITURE_DIMENSIONS[type] || { w: 0.8, d: 0.8, clearance: 0.3, wall: false };
          const pos = engine.place(dim.w, dim.d, dim.clearance, dim.wall || false);
          const x = pos ? pos.x : (bounds.minX + bounds.maxX) / 2;
          const z = pos ? pos.z : (bounds.minZ + bounds.maxZ) / 2;
          const spec = {
            id: crypto.randomUUID(),
            type,
            name: `${labelFor(type)}`,
            color: materialLibrary[stylePresets[state.style]?.furniture]?.color || "#bb7d5a",
            material: stylePresets[state.style]?.furniture || "fabric",
            position: { x, y: 0, z },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          };
          const mesh = createMesh(spec);
          objectGroup.add(mesh);
          state.objects.push(spec);
          state.selectedIds.push(spec.id);
        }
        renderObjectList();
        renderInspector();
        aiChat.lastChild.querySelector("p").textContent = `✅ ${oldTypes.length} objet(s) réorganisé(s) sans collision.`;
        updateStatusBar();
        return;
      }
    }

    // --- Mode génération complète ---
    addAIMessage("assistant", "Génération du projet en cours...");
    const apiKey = document.querySelector("#aiApiKey")?.value?.trim() || localStorage.getItem("hf_api_key") || "";
    try {
      const resp = await fetch("/api/generate-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, apiKey, style: state.style }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const variants = data.variants || (data.spaces ? [data] : []);
        if (variants.length > 0) {
          const first = variants[0];
          if (first?.spaces?.length > 0) {
            const builder = new SceneAIBuilder(scene, objectGroup, roomGroup, state);
            builder.buildProject(first);
            state.aiLastBlueprint = first;
            state.aiAllVariants = variants;
            const totalEls = first.spaces.reduce((s, sp) => s + (sp.elements?.length || 0), 0);
            aiChat.lastChild.querySelector("p").textContent = `✅ Projet "${first.project_name || 'Sans titre'}" généré avec ${first.spaces.length} espace(s) et ${totalEls} élément(s).`;
            const variantsEl = document.querySelector("#aiVariantList");
            const variantsContainer = document.querySelector("#aiVariants");
            const exportBtn = document.querySelector("#exportBlueprintBtn");
            variantsContainer.classList.remove("hidden");
            const temps = ["0.3", "0.7", "1.0"];
            variantsEl.innerHTML = variants.map((v, i) => {
              const icon = ["🛋","🛏","🍳","🪑","🚿"][i % 5];
              const spaceCount = v.spaces?.length || 0;
              return `
              <div class="ai-variant-item${i === 0 ? " active" : ""}" data-variant="${i}">
                <span class="mini-icon">${icon}</span>
                <span>${spaceCount} espace(s)</span>
                <span class="variant-temp">t:${temps[i] || "-"}</span>
              </div>`;
            }).join("");
            updateStatusBar();
            return;
          }
        }
      }
      aiChat.lastChild.querySelector("p").textContent = "⚠️ Le serveur IA n'a pas pu générer le projet. Essaie avec une clé API Hugging Face.";
    } catch (e) {
      aiChat.lastChild.querySelector("p").textContent = `⚠️ Erreur: ${e.message}`;
    }
  }
  aiSend?.addEventListener("click", sendAIPrompt);
  aiInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); sendAIPrompt(); }
  });
  document.querySelectorAll(".ai-hint").forEach((btn) => {
    btn.addEventListener("click", () => {
      aiInput.value = btn.dataset.hint;
      aiInput.focus();
    });
  });
  document.querySelector("#aiVariantList")?.addEventListener("click", (e) => {
    const item = e.target.closest(".ai-variant-item");
    if (item) {
      const idx = parseInt(item.dataset.variant);
      const variant = state.aiAllVariants?.[idx];
      if (variant?.spaces?.length) {
        pushUndo();
        const builder = new SceneAIBuilder(scene, objectGroup, roomGroup, state);
        builder.buildProject(variant);
        state.aiLastBlueprint = variant;
        document.querySelectorAll(".ai-variant-item").forEach(el => el.classList.remove("active"));
        item.classList.add("active");
        const totalEls = variant.spaces.reduce((s, sp) => s + (sp.elements?.length || 0), 0);
        addAIMessage("system", `✅ Variante ${idx + 1} appliquée : ${variant.spaces.length} espace(s), ${totalEls} élément(s)`);
      }
    }
  });
  document.querySelector("#exportBlueprintBtn")?.addEventListener("click", () => {
    const bp = state.aiLastBlueprint;
    if (!bp) return;
    download(JSON.stringify(bp, null, 2), `${slug(bp.project_name || "blueprint")}.pixbp`, "application/json");
  });

  // --- New Pro UI handlers ---
  document.querySelectorAll("[data-sel-filter]").forEach((btn) => {
    btn.addEventListener("click", () => setSelectionFilter(btn.dataset.selFilter));
  });
  document.querySelectorAll("[data-transform]").forEach((btn) => {
    btn.addEventListener("click", () => setTransformTool(btn.dataset.transform));
  });
  document.querySelectorAll("[data-subobj]").forEach((btn) => {
    btn.addEventListener("click", () => setSubObjectLevel(btn.dataset.subobj));
  });
  dom.quadViewBtn?.addEventListener("click", toggleQuadView);
  dom.vpOverlay?.querySelectorAll(".vp-label").forEach(el => {
    el.addEventListener("click", () => {
      if (!state.quadView) toggleQuadView();
      setActiveView(el.dataset.vpId);
    });
  });

  // Keyboard shortcuts: Q/W/E/R + Space + Alt+W
  window.addEventListener("keydown", (event) => {
    if (event.target?.tagName === "INPUT" || event.target?.tagName === "TEXTAREA" || event.target?.tagName === "SELECT") return;
    const key = event.key.toLowerCase();
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if (key === "q") { event.preventDefault(); setTransformTool("select"); }
      else if (key === "w") { event.preventDefault(); setTransformTool("translate"); }
      else if (key === "e") { event.preventDefault(); setTransformTool("rotate"); }
      else if (key === "r") { event.preventDefault(); setTransformTool("scale"); }
      else if (key === " ") { event.preventDefault(); setTransformTool("select"); }
    }
    if (event.altKey && key === "w") {
      event.preventDefault();
      toggleQuadView();
    }
  });

  document.querySelectorAll("[data-land-mat]").forEach((btn) => {
    btn.addEventListener("click", () => applyLandscapeMaterial(btn.dataset.landMat));
  });
  document.querySelector("#addTreesBtn").addEventListener("click", addTreesToTerrain);
  dom.projectName.addEventListener("change", () => {
    const name = dom.projectName.value.trim();
    if (name) state.name = name;
    else dom.projectName.value = state.name;
    updateProjectUI();
  });
  dom.projectName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") dom.projectName.blur();
  });
  document.querySelectorAll("[data-env-preset]").forEach((btn) => {
    btn.addEventListener("click", () => applyEnvPreset(btn.dataset.envPreset));
  });
  document.querySelector("#importHDRBtn").addEventListener("click", () => document.querySelector("#hdrInput").click());
  document.querySelector("#hdrInput").addEventListener("change", importHDR);
  document.querySelector("#aiGenBtn").addEventListener("click", openAIGenerator);
  document.querySelector("#aiGenBtn2").addEventListener("click", openAIGenerator);
  const logoutBtn = document.querySelector("#logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try { await fetch("/api/logout", { method: "POST" }); } catch (e) {}
      window.location.href = "/login";
    });
  }
  setInterval(async () => {
    try {
      if (document.visibilityState === "visible") await fetch("/api/session");
    } catch (e) {}
  }, 5 * 60 * 1000);
  document.querySelector("#aiModalClose").addEventListener("click", closeAIGenerator);
  document.querySelector("#aiCancelBtn").addEventListener("click", closeAIGenerator);
  document.querySelector("#aiGenerateBtn").addEventListener("click", generateFromPrompt);
  document.querySelector("#aiPrompt").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey) generateFromPrompt();
  });
}

function addObject(type, saved = null) {
  const id = saved?.id || crypto.randomUUID();
  const spec = saved || defaultSpec(type, id);
  if (!spec.material) spec.material = materialForType(spec.type, stylePresets[state.style] || stylePresets.american);
  const mesh = createMesh(spec);
  objectGroup.add(mesh);
  state.objects.push(spec);
  selectObject(id);
  renderObjectList();
}

function defaultSpec(type, id) {
  const preset = stylePresets[state.style] || stylePresets.american;
  const base = {
    id,
    type,
    name: labelFor(type),
    color: colorFor(type),
    material: materialForType(type, preset),
    position: { x: 0, y: 0.5, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };

  if (type === "sofa") return { ...base, scale: { x: 2.2, y: 0.75, z: 0.85 }, position: { x: 0, y: 0.38, z: 1.1 } };
  if (type === "table") return { ...base, scale: { x: 1.6, y: 0.75, z: 0.9 }, position: { x: 0, y: 0.38, z: 0 } };
  if (type === "lamp") return { ...base, scale: { x: 0.35, y: 1.7, z: 0.35 }, position: { x: 2, y: 0.85, z: 1 } };
  if (type === "spotlight") return { ...base, scale: { x: 0.45, y: 0.28, z: 0.45 }, position: { x: 0, y: 2.85, z: 0 } };
  if (type === "wall") return { ...base, scale: { x: 2.8, y: 2.7, z: 0.12 }, position: { x: 0, y: 1.35, z: -1.5 } };
  if (type === "window") return { ...base, scale: { x: 1.6, y: 1, z: 0.08 }, position: { x: 0, y: 1.7, z: -2.46 } };
  if (type === "door") return { ...base, scale: { x: 0.95, y: 2.1, z: 0.08 }, position: { x: -1.2, y: 1.05, z: -2.46 } };
  if (type === "tvUnit") return { ...base, scale: { x: 2.2, y: 0.85, z: 0.45 }, position: { x: 0, y: 0.43, z: -2.15 } };
  if (type === "tv") return { ...base, scale: { x: 1.7, y: 1.05, z: 0.08 }, position: { x: 0, y: 1.35, z: -2.35 } };
  if (type === "fridge") return { ...base, scale: { x: 0.78, y: 1.9, z: 0.72 }, position: { x: 2.2, y: 0.95, z: -1.8 } };
  if (type === "oven") return { ...base, scale: { x: 0.72, y: 0.75, z: 0.62 }, position: { x: 1.2, y: 0.38, z: -1.9 } };
  if (type === "washer") return { ...base, scale: { x: 0.75, y: 0.82, z: 0.68 }, position: { x: 1.2, y: 0.41, z: -1.1 } };
  if (type === "cooktop") return { ...base, scale: { x: 0.95, y: 0.08, z: 0.62 }, position: { x: 0.2, y: 0.92, z: -1.4 } };
  if (type === "doorHandle") return { ...base, scale: { x: 0.35, y: 0.12, z: 0.12 }, position: { x: -0.85, y: 1, z: -2.39 } };
  if (type === "windowHandle") return { ...base, scale: { x: 0.18, y: 0.35, z: 0.08 }, position: { x: 0.55, y: 1.7, z: -2.38 } };
  if (type === "curtain") return { ...base, scale: { x: 1.95, y: 1.45, z: 0.08 }, position: { x: 0, y: 1.55, z: -2.25 } };
  if (type === "stairs") return { ...base, scale: { x: 1.8, y: 1, z: 2.2 }, position: { x: -2.2, y: 0.5, z: 0.5 } };
  if (type === "toilet") return { ...base, scale: { x: 0.55, y: 0.85, z: 0.75 }, position: { x: 2.2, y: 0.43, z: 1.5 } };
  if (type === "sink") return { ...base, scale: { x: 0.85, y: 0.85, z: 0.52 }, position: { x: 1.3, y: 0.43, z: 1.5 } };
  if (type === "shower") return { ...base, scale: { x: 1, y: 2.1, z: 1 }, position: { x: 2.2, y: 1.05, z: 0.2 } };
  if (type === "bathtub") return { ...base, scale: { x: 1.65, y: 0.62, z: 0.82 }, position: { x: 1.3, y: 0.31, z: 0.3 } };
  if (type === "armchair") return { ...base, scale: { x: 1.1, y: 0.85, z: 0.95 }, position: { x: 0, y: 0.43, z: 1.1 } };
  if (type === "pouf") return { ...base, scale: { x: 0.6, y: 0.45, z: 0.6 }, position: { x: 0, y: 0.23, z: 1.4 } };
  if (type === "coffeeTable") return { ...base, scale: { x: 1.2, y: 0.45, z: 0.7 }, position: { x: 0, y: 0.23, z: 0.5 } };
  if (type === "diningTable") return { ...base, scale: { x: 2, y: 0.75, z: 1 }, position: { x: 0, y: 0.38, z: 0 } };
  if (type === "diningChair") return { ...base, scale: { x: 0.55, y: 0.9, z: 0.6 }, position: { x: 1.3, y: 0.45, z: 0 } };
  if (type === "bed") return { ...base, scale: { x: 2.2, y: 0.55, z: 1.9 }, position: { x: 0, y: 0.28, z: 0 } };
  if (type === "wardrobe") return { ...base, scale: { x: 1.6, y: 2.2, z: 0.65 }, position: { x: -2.5, y: 1.1, z: 0 } };
  if (type === "nightstand") return { ...base, scale: { x: 0.55, y: 0.65, z: 0.45 }, position: { x: 1.4, y: 0.33, z: 1.1 } };
  if (type === "desk") return { ...base, scale: { x: 1.6, y: 0.75, z: 0.7 }, position: { x: 0, y: 0.38, z: 0 } };
  if (type === "bookshelf") return { ...base, scale: { x: 1.2, y: 2, z: 0.35 }, position: { x: -2.5, y: 1, z: 1.5 } };
  if (type === "officeChair") return { ...base, scale: { x: 0.6, y: 1, z: 0.6 }, position: { x: 0.8, y: 0.5, z: -0.8 } };
  if (type === "plant") return { ...base, scale: { x: 0.45, y: 0.8, z: 0.45 }, position: { x: 2, y: 0.4, z: 1.8 } };
  if (type === "tree") return { ...base, scale: { x: 1.5, y: 3, z: 1.5 }, position: { x: 3.5, y: 1.5, z: -3 } };
  if (type === "flowerPot") return { ...base, scale: { x: 0.3, y: 0.4, z: 0.3 }, position: { x: 2.2, y: 0.2, z: 2 } };
  if (type === "bench") return { ...base, scale: { x: 1.8, y: 0.8, z: 0.6 }, position: { x: 3, y: 0.4, z: -2 } };
  if (type === "sphere") return { ...base, scale: { x: 0.8, y: 0.8, z: 0.8 } };
  if (type === "cone") return { ...base, scale: { x: 0.8, y: 1, z: 0.8 } };
  if (type === "cylinder") return { ...base, scale: { x: 0.8, y: 1, z: 0.8 } };
  if (type === "rock") return { ...base, scale: { x: 1.2, y: 0.8, z: 1.2 }, position: { x: 3.2, y: 0.4, z: -1.6 } };
  if (type === "water") return { ...base, scale: { x: 3, y: 1, z: 3 }, position: { x: 0, y: 0.08, z: 0 } };
  if (type === "cloth") return { ...base, scale: { x: 1, y: 1, z: 1 }, position: { x: 0, y: 1.6, z: -0.6 } };
  if (type === "gas") return { ...base, scale: { x: 1.6, y: 1.4, z: 1.6 }, position: { x: 1.6, y: 0.6, z: 1.8 } };
  if (type === "particles") return { ...base, scale: { x: 1, y: 1, z: 1 }, position: { x: 0, y: 1.1, z: 0 } };
  return base;
}

function createMesh(spec) {
  let mesh;
  const material = createMaterial(spec.material, { fallbackColor: spec.color });
  const darkMaterial = createMaterial("darkScreen");
  const glassMaterial = createMaterial("glass");
  const metalMaterial = createMaterial("metal");
  const lightMaterial = createMaterial("lightWarm");
  const ceramicMaterial = createMaterial("ceramic");

  if (spec.type === "lamp") {
    mesh = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.25, 24), material);
    pole.position.y = 0.35;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.45, 32), material);
    shade.position.y = 1.1;
    mesh.add(pole, shade);
  } else if (spec.type === "sofa") {
    mesh = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1, 0.45, 1), material);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1, 0.75, 0.18), material);
    back.position.set(0, 0.18, -0.42);
    mesh.add(seat, back);
  } else if (spec.type === "tvUnit") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0, 0], [1, 0.55, 1], material));
    mesh.add(boxPart([-0.28, 0.02, -0.52], [0.03, 0.42, 0.04], darkMaterial, "darkScreen"));
    mesh.add(boxPart([0.28, 0.02, -0.52], [0.03, 0.42, 0.04], darkMaterial, "darkScreen"));
  } else if (spec.type === "tv") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0, 0], [1, 0.72, 0.08], darkMaterial, "darkScreen"));
    mesh.add(boxPart([0, -0.43, 0], [0.12, 0.18, 0.08], metalMaterial, "metal"));
    mesh.add(boxPart([0, -0.55, 0], [0.55, 0.05, 0.22], metalMaterial, "metal"));
  } else if (spec.type === "fridge") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0, 0], [1, 1, 1], material));
    mesh.add(boxPart([0, 0.18, -0.52], [0.92, 0.03, 0.035], metalMaterial, "metal"));
    mesh.add(boxPart([0.38, -0.2, -0.55], [0.05, 0.45, 0.06], metalMaterial, "metal"));
  } else if (spec.type === "oven" || spec.type === "washer") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0, 0], [1, 1, 1], material));
    if (spec.type === "oven") {
      mesh.add(boxPart([0, 0, -0.53], [0.72, 0.52, 0.04], darkMaterial, "darkScreen"));
      mesh.add(boxPart([0, 0.36, -0.55], [0.5, 0.04, 0.05], metalMaterial, "metal"));
    } else {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 40), darkMaterial);
      drum.rotation.x = Math.PI / 2;
      drum.position.z = -0.53;
      drum.userData.materialKey = "darkScreen";
      mesh.add(drum);
    }
  } else if (spec.type === "cooktop") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0, 0], [1, 1, 1], darkMaterial, "darkScreen"));
    [[-0.28, -0.2], [0.28, -0.2], [-0.28, 0.2], [0.28, 0.2]].forEach(([x, z]) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 28), metalMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.52, z);
      ring.userData.materialKey = "metal";
      mesh.add(ring);
    });
  } else if (spec.type === "doorHandle" || spec.type === "windowHandle") {
    mesh = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 24), metalMaterial);
    handle.rotation.z = Math.PI / 2;
    handle.userData.materialKey = "metal";
    mesh.add(handle);
  } else if (spec.type === "spotlight") {
    mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.35, 32), metalMaterial);
    body.userData.materialKey = "metal";
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 12), lightMaterial);
    bulb.position.y = -0.18;
    bulb.userData.materialKey = "lightWarm";
    mesh.add(body, bulb);
    const light = new THREE.PointLight(0xffe8b5, 1.2, 5);
    light.position.y = -0.4;
    mesh.add(light);
  } else if (spec.type === "curtain") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0.52, 0], [1.05, 0.05, 0.12], metalMaterial, "metal"));
    for (let i = 0; i < 6; i += 1) {
      const x = -0.42 + i * 0.17;
      mesh.add(boxPart([x, -0.05, 0], [0.11, 0.92, 0.08], material));
    }
  } else if (spec.type === "stairs") {
    mesh = new THREE.Group();
    for (let i = 0; i < 6; i += 1) {
      mesh.add(boxPart([0, -0.42 + i * 0.16, -0.42 + i * 0.16], [1, 0.16, 0.26], material));
    }
  } else if (spec.type === "toilet") {
    mesh = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.28, 0.38, 32), ceramicMaterial);
    bowl.scale.z = 1.25;
    bowl.userData.materialKey = "ceramic";
    mesh.add(bowl);
    mesh.add(boxPart([0, 0.42, 0.36], [0.78, 0.45, 0.18], ceramicMaterial, "ceramic"));
    mesh.add(boxPart([0, 0.05, -0.22], [0.48, 0.16, 0.42], ceramicMaterial, "ceramic"));
  } else if (spec.type === "sink") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, -0.25, 0], [0.26, 0.55, 0.26], ceramicMaterial, "ceramic"));
    mesh.add(boxPart([0, 0.2, 0], [1, 0.22, 0.72], ceramicMaterial, "ceramic"));
    mesh.add(boxPart([0, 0.38, 0.12], [0.12, 0.22, 0.08], metalMaterial, "metal"));
  } else if (spec.type === "shower") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, -0.48, 0], [1, 0.06, 1], ceramicMaterial, "ceramic"));
    mesh.add(boxPart([-0.48, 0, 0], [0.04, 1, 1], glassMaterial, "glass"));
    mesh.add(boxPart([0, 0, -0.48], [1, 1, 0.04], glassMaterial, "glass"));
    mesh.add(boxPart([0.38, 0.26, -0.42], [0.12, 0.12, 0.08], metalMaterial, "metal"));
  } else if (spec.type === "bathtub") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0, 0], [1, 0.52, 1], ceramicMaterial, "ceramic"));
    mesh.add(boxPart([0, 0.1, 0], [0.78, 0.38, 0.72], createMaterial("darkScreen"), "darkScreen"));
  } else if (spec.type === "armchair") {
    mesh = new THREE.Group();
    const armMat = createMaterial(spec.material, { fallbackColor: spec.color });
    mesh.add(boxPart([0, 0, 0], [0.9, 0.35, 0.85], armMat));
    mesh.add(boxPart([0, 0.18, -0.32], [0.9, 0.5, 0.18], armMat));
    mesh.add(boxPart([-0.42, 0.02, 0.05], [0.08, 0.35, 0.7], armMat));
    mesh.add(boxPart([0.42, 0.02, 0.05], [0.08, 0.35, 0.7], armMat));
  } else if (spec.type === "pouf") {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 24), material);
  } else if (spec.type === "coffeeTable") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0, 0], [1, 0.06, 0.85], material));
    mesh.add(boxPart([-0.4, -0.22, -0.32], [0.06, 0.38, 0.06], material));
    mesh.add(boxPart([0.4, -0.22, -0.32], [0.06, 0.38, 0.06], material));
    mesh.add(boxPart([-0.4, -0.22, 0.32], [0.06, 0.38, 0.06], material));
    mesh.add(boxPart([0.4, -0.22, 0.32], [0.06, 0.38, 0.06], material));
  } else if (spec.type === "diningTable") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0.22, 0], [0.95, 0.06, 0.95], material));
    mesh.add(boxPart([-0.4, -0.28, -0.4], [0.06, 0.44, 0.06], metalMaterial, "metal"));
    mesh.add(boxPart([0.4, -0.28, -0.4], [0.06, 0.44, 0.06], metalMaterial, "metal"));
    mesh.add(boxPart([-0.4, -0.28, 0.4], [0.06, 0.44, 0.06], metalMaterial, "metal"));
    mesh.add(boxPart([0.4, -0.28, 0.4], [0.06, 0.44, 0.06], metalMaterial, "metal"));
  } else if (spec.type === "diningChair") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, -0.15, 0], [0.42, 0.06, 0.42], material));
    mesh.add(boxPart([-0.18, 0.08, -0.16], [0.04, 0.4, 0.04], metalMaterial, "metal"));
    mesh.add(boxPart([0.18, 0.08, -0.16], [0.04, 0.4, 0.04], metalMaterial, "metal"));
    mesh.add(boxPart([-0.18, 0.08, 0.16], [0.04, 0.4, 0.04], metalMaterial, "metal"));
    mesh.add(boxPart([0.18, 0.08, 0.16], [0.04, 0.4, 0.04], metalMaterial, "metal"));
    mesh.add(boxPart([0, 0.15, -0.22], [0.42, 0.35, 0.04], material));
  } else if (spec.type === "bed") {
    mesh = new THREE.Group();
    const bedMat = createMaterial(spec.material, { fallbackColor: spec.color });
    mesh.add(boxPart([0, -0.1, 0], [1, 0.2, 0.9], bedMat));
    mesh.add(boxPart([0, 0.1, 0.02], [0.92, 0.12, 0.86], createMaterial("fabric", { fallbackColor: "#e8dfcf" })));
    mesh.add(boxPart([0, 0.18, 0.46], [0.95, 0.35, 0.06], bedMat));
  } else if (spec.type === "wardrobe") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0, 0], [1, 1, 1], material));
    mesh.add(boxPart([0.32, -0.1, -0.48], [0.3, 0.72, 0.04], material));
    mesh.add(boxPart([-0.32, -0.1, -0.48], [0.3, 0.72, 0.04], material));
    mesh.add(boxPart([0.4, 0.16, -0.55], [0.04, 0.3, 0.06], metalMaterial, "metal"));
  } else if (spec.type === "nightstand") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0, 0], [1, 1, 1], material));
    mesh.add(boxPart([0, 0.32, -0.48], [0.7, 0.02, 0.04], material));
  } else if (spec.type === "desk") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0.15, 0], [1, 0.06, 0.85], material));
    mesh.add(boxPart([-0.42, -0.3, -0.38], [0.06, 0.54, 0.06], metalMaterial, "metal"));
    mesh.add(boxPart([0.42, -0.3, -0.38], [0.06, 0.54, 0.06], metalMaterial, "metal"));
    mesh.add(boxPart([-0.42, -0.3, 0.38], [0.06, 0.54, 0.06], metalMaterial, "metal"));
    mesh.add(boxPart([0.42, -0.3, 0.38], [0.06, 0.54, 0.06], metalMaterial, "metal"));
  } else if (spec.type === "bookshelf") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0, 0], [1, 1, 1], material));
    mesh.add(boxPart([0, -0.2, -0.48], [0.88, 0.04, 0.04], material));
    mesh.add(boxPart([0, 0.1, -0.48], [0.88, 0.04, 0.04], material));
    mesh.add(boxPart([0, 0.4, -0.48], [0.88, 0.04, 0.04], material));
  } else if (spec.type === "officeChair") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, -0.3, 0], [0.55, 0.06, 0.55], material));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 12), metalMaterial);
    stem.position.y = -0.1;
    stem.userData.materialKey = "metal";
    mesh.add(stem);
    mesh.add(boxPart([0, 0.12, 0], [0.45, 0.08, 0.45], material));
    mesh.add(boxPart([0, 0.3, -0.22], [0.45, 0.3, 0.06], material));
  } else if (spec.type === "plant") {
    mesh = new THREE.Group();
    const potMat = createMaterial("ceramic", { fallbackColor: "#c97b5a" });
    mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.2, 16), potMat));
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), createMaterial("paintWarm", { fallbackColor: "#5a8a5a" }));
      leaf.position.set(Math.cos(i * 1.26) * 0.15, 0.15 + Math.random() * 0.1, Math.sin(i * 1.26) * 0.15);
      leaf.scale.y = 1.5;
      mesh.add(leaf);
    }
  } else if (spec.type === "tree") {
    mesh = new THREE.Group();
    const trunkMat = createMaterial("woodOak", { fallbackColor: "#7a5a3a" });
    const canopyMat = createMaterial("paintWarm", { fallbackColor: "#4a7a4a" });
    mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 1, 12), trunkMat));
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), canopyMat);
    canopy.position.y = 0.7;
    mesh.add(canopy);
  } else if (spec.type === "flowerPot") {
    const potMat = createMaterial("ceramic", { fallbackColor: "#d48a6a" });
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.25, 20), potMat);
  } else if (spec.type === "bench") {
    mesh = new THREE.Group();
    mesh.add(boxPart([0, 0, 0], [1, 0.06, 0.5], material));
    mesh.add(boxPart([-0.42, -0.2, -0.22], [0.06, 0.34, 0.06], material));
    mesh.add(boxPart([0.42, -0.2, -0.22], [0.06, 0.34, 0.06], material));
    mesh.add(boxPart([-0.42, -0.2, 0.22], [0.06, 0.34, 0.06], material));
    mesh.add(boxPart([0.42, -0.2, 0.22], [0.06, 0.34, 0.06], material));
    mesh.add(boxPart([0, 0.12, -0.26], [1, 0.18, 0.04], material));
  } else if (spec.type === "sphere") {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), material);
  } else if (spec.type === "cone") {
    mesh = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 32), material);
  } else if (spec.type === "cylinder") {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), material);
  } else if (spec.type === "rock") {
    const geo = new THREE.IcosahedronGeometry(0.6, 1);
    const np = geo.attributes.position;
    for (let i = 0; i < np.count; i++) {
      const d = 0.82 + Math.random() * 0.32;
      np.setXYZ(i, np.getX(i) * d, np.getY(i) * d, np.getZ(i) * d);
    }
    geo.computeVertexNormals();
    const rockMat = createMaterial(spec.material, { fallbackColor: spec.color });
    rockMat.flatShading = true;
    mesh = new THREE.Mesh(geo, rockMat);
  } else if (spec.type === "water") {
    const geo = new THREE.PlaneGeometry(2.4, 2.4, 24, 24);
    geo.rotateX(-Math.PI / 2);
    spec.anim = spec.anim || { type: "water", amp: 0.045, speed: 1.6 };
    mesh = new THREE.Mesh(geo, material);
  } else if (spec.type === "cloth") {
    const geo = new THREE.PlaneGeometry(2.4, 2.4, 20, 20);
    spec.anim = spec.anim || { type: "cloth", amp: 0.09, speed: 1.4 };
    mesh = new THREE.Mesh(geo, material);
  } else if (spec.type === "gas") {
    const geo = new THREE.SphereGeometry(1.3, 20, 14);
    spec.anim = spec.anim || { type: "pulse", amp: 0.35, speed: 0.7 };
    mesh = new THREE.Mesh(geo, material);
  } else if (spec.type === "particles") {
    const n = 240;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * 1.5;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * 1.2 + 0.2;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * 1.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    spec.anim = spec.anim || { type: "drift", amp: 0.5, speed: 0.6 };
    mesh = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffe9a8, size: 0.045, transparent: true, opacity: 0.85, depthWrite: false }));
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  }

  mesh.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.id = spec.id;
    }
  });
  mesh.userData.id = spec.id;
  mesh.userData.type = spec.type;
  applySpec(mesh, spec);
  const animType = spec.anim?.type;
  if (animType === "water" || animType === "cloth") {
    const p = mesh.geometry.attributes.position;
    mesh.userData.animBase = new Float32Array(p.array.slice());
  }
  mesh.userData.anim = animType ? spec.anim : null;
  return mesh;
}

function boxPart(position, scale, material, materialKey = "") {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  if (materialKey) mesh.userData.materialKey = materialKey;
  return mesh;
}

function applySpec(mesh, spec) {
  mesh.name = spec.name;
  mesh.position.set(spec.position.x, spec.position.y, spec.position.z);
  mesh.scale.set(spec.scale.x, spec.scale.y, spec.scale.z);
  mesh.rotation.set(spec.rotation?.x || 0, spec.rotation?.y || 0, spec.rotation?.z || 0);
  const material = createMaterial(spec.material, { fallbackColor: spec.color });
  mesh.traverse((child) => {
    if (child.isMesh) child.material = createMaterial(child.userData.materialKey || spec.material, { fallbackColor: spec.color });
  });
}

function getSelectedMesh() {
  const id = state.selectedIds[0];
  if (!id) return null;
  const obj = objectGroup.getObjectById(id);
  if (!obj) return null;
  let mesh = null;
  obj.traverse((child) => { if (child.isMesh) mesh = child; });
  return mesh;
}

function subdivideSelected() {
  const m = getSelectedMesh();
  if (!m) return;
  const geo = m.geometry;
  if (!geo.index) geo.setIndex(geo.attributes.position.array.length / 3);
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const v = [];
  for (let i = 0; i < pos.count; i++) v.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  const tris = [];
  for (let i = 0; i < idx.length; i += 3) tris.push([idx[i], idx[i + 1], idx[i + 2]]);
  const newVerts = [...v.map(p => [...p])];
  const edgeMap = {};
  function midEdge(i1, i2) {
    const k = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;
    if (edgeMap[k] !== undefined) return edgeMap[k];
    const idx = newVerts.length;
    newVerts.push([
      (newVerts[i1][0] + newVerts[i2][0]) / 2,
      (newVerts[i1][1] + newVerts[i2][1]) / 2,
      (newVerts[i1][2] + newVerts[i2][2]) / 2,
    ]);
    edgeMap[k] = idx;
    return idx;
  }
  const newTris = [];
  for (const t of tris) {
    const [a, b, c] = t;
    const ab = midEdge(a, b);
    const bc = midEdge(b, c);
    const ca = midEdge(c, a);
    newTris.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
  }
  const flat = [];
  for (const t of newTris) flat.push(t[0], t[1], t[2]);
  const newGeo = new THREE.BufferGeometry();
  const newPos = new Float32Array(newVerts.flat());
  newGeo.setAttribute("position", new THREE.BufferAttribute(newPos, 3));
  newGeo.setIndex(flat);
  newGeo.computeVertexNormals();
  m.geometry = newGeo;
  pushUndo();
}

function extrudeSelected() {
  if (extrudeSelectedFace()) return; // extrusion de face en mode sous-objet
  const m = getSelectedMesh();
  if (!m) return;
  const geo = m.geometry;
  if (!geo.index) geo.setIndex(geo.attributes.position.array.length / 3);
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const verts = [];
  for (let i = 0; i < pos.count; i++) verts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  const norms = [];
  geo.computeVertexNormals();
  const nAttr = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) norms.push(new THREE.Vector3(nAttr.getX(i), nAttr.getY(i), nAttr.getZ(i)));
  const dist = 0.3;
  const newVerts = verts.map((v, i) => v.clone().add(norms[i].clone().multiplyScalar(dist)));
  const allV = [...verts, ...newVerts];
  const off = verts.length;
  const ni = [];
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
    const na = a + off, nb = b + off, nc = c + off;
    ni.push(na, nb, nc);
    ni.push(a, b, na, b, nb, na);
    ni.push(b, c, nb, c, nc, nb);
    ni.push(c, a, nc, a, na, nc);
  }
  const nGeo = new THREE.BufferGeometry();
  const arr = new Float32Array(allV.length * 3);
  allV.forEach((v, i) => { arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; });
  nGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  nGeo.setIndex(ni);
  nGeo.computeVertexNormals();
  m.geometry = nGeo;
  pushUndo();
}

function bevelSelected(amount = 0.08) {
  const m = getSelectedMesh();
  if (!m) return;
  exitSubObjectMode();
  const res = bevelGeometry(m.geometry, amount);
  if (res) {
    m.geometry.dispose?.();
    m.geometry = res;
    pushUndo();
  } else {
    console.warn("bevelSelected: maillage non fermé (manifold) — bevel par sommet");
    bevelVertexNudge(m);
  }
}

function bevelVertexNudge(m) {
  const geo = m.geometry;
  if (!geo.index) geo.setIndex(geo.attributes.position.array.length / 3);
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const verts = [];
  for (let i = 0; i < pos.count; i++) verts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  const epsilon = 0.05;
  const newVerts = verts.map(v => v.clone());
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
    const center = new THREE.Vector3().add(verts[a]).add(verts[b]).add(verts[c]).divideScalar(3);
    for (const vi of [a, b, c]) {
      const dir = new THREE.Vector3().copy(center).sub(verts[vi]).normalize();
      newVerts[vi].add(dir.multiplyScalar(epsilon));
    }
  }
  const newGeo = new THREE.BufferGeometry();
  const newPos = new Float32Array(newVerts.map(v => [v.x, v.y, v.z]).flat());
  newGeo.setAttribute("position", new THREE.BufferAttribute(newPos, 3));
  newGeo.setIndex([...idx]);
  newGeo.computeVertexNormals();
  m.geometry = newGeo;
  pushUndo();
}

function toggleSmoothShading() {
  const m = getSelectedMesh();
  if (!m) return;
  const geo = m.geometry;
  if (m.userData._flatShading) {
    geo.computeVertexNormals();
    m.material.flatShading = false;
    m.userData._flatShading = false;
  } else {
    const pos = geo.attributes.position;
    const idx = geo.index ? geo.index.array : null;
    if (!idx) return;
    const faceNormals = new Float32Array(pos.count * 3);
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const va = new THREE.Vector3(pos.array[a], pos.array[a + 1], pos.array[a + 2]);
      const vb = new THREE.Vector3(pos.array[b], pos.array[b + 1], pos.array[b + 2]);
      const vc = new THREE.Vector3(pos.array[c], pos.array[c + 1], pos.array[c + 2]);
      const n = new THREE.Triangle(va, vb, vc).getNormal(new THREE.Vector3());
      for (const vi of [a, b, c]) { faceNormals[vi] = n.x; faceNormals[vi + 1] = n.y; faceNormals[vi + 2] = n.z; }
    }
    geo.setAttribute("normal", new THREE.BufferAttribute(faceNormals, 3));
    m.material.flatShading = true;
    m.userData._flatShading = true;
  }
  m.material.needsUpdate = true;
  pushUndo();
}

function meshMirrorSelected(axis) {
  const m = getSelectedMesh();
  if (!m) return;
  const geo = m.geometry.clone();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ai = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const arr = pos.array;
    arr[i * 3 + ai] *= -1;
  }
  if (geo.index) {
    const idx = [...geo.index.array];
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    geo.setIndex(idx);
  }
  geo.computeVertexNormals();
  const merged = mergeGeometries([m.geometry, geo]);
  m.geometry = merged;
  pushUndo();
}

function weldSelected() {
  const m = getSelectedMesh();
  if (!m) return;
  const geo = m.geometry;
  if (!geo.index) geo.setIndex(geo.attributes.position.array.length / 3);
  const pos = geo.attributes.position;
  const idx = [...geo.index.array];
  const threshold = 0.01;
  const thresholdSq = threshold * threshold;
  const verts = [];
  for (let i = 0; i < pos.count; i++) verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  const remap = new Array(verts.length).fill(0).map((_, i) => i);
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const dx = verts[i][0] - verts[j][0], dy = verts[i][1] - verts[j][1], dz = verts[i][2] - verts[j][2];
      if (dx * dx + dy * dy + dz * dz < thresholdSq) remap[j] = remap[i];
    }
  }
  const newIdx = idx.map(i => remap[i]);
  const newGeo = new THREE.BufferGeometry();
  const newPos = new Float32Array(verts.flat());
  newGeo.setAttribute("position", new THREE.BufferAttribute(newPos, 3));
  newGeo.setIndex(newIdx);
  newGeo.computeVertexNormals();
  m.geometry = newGeo;
  pushUndo();
}

function collapseSelected() {
  const m = getSelectedMesh();
  if (!m) return;
  const geo = m.geometry;
  if (!geo.index) geo.setIndex(geo.attributes.position.array.length / 3);
  const pos = geo.attributes.position;
  const idx = [...geo.index.array];
  const verts = [];
  for (let i = 0; i < pos.count; i++) verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  const avg = [0, 0, 0];
  for (const v of verts) { avg[0] += v[0]; avg[1] += v[1]; avg[2] += v[2]; }
  avg[0] /= verts.length; avg[1] /= verts.length; avg[2] /= verts.length;
  for (const v of verts) { v[0] = avg[0]; v[1] = avg[1]; v[2] = avg[2]; }
  const newGeo = new THREE.BufferGeometry();
  const newPos = new Float32Array(verts.flat());
  newGeo.setAttribute("position", new THREE.BufferAttribute(newPos, 3));
  newGeo.setIndex(idx);
  newGeo.computeVertexNormals();
  m.geometry = newGeo;
  pushUndo();
}

function createMaterial(key = "paintWarm", options = {}) {
  const spec = materialLibrary[key] || materialLibrary.paintWarm;
  const material = new THREE.MeshStandardMaterial({
    color: spec.color || options.fallbackColor || "#cccccc",
    roughness: spec.roughness ?? 0.7,
    metalness: spec.metalness ?? 0,
    transparent: spec.transparent || false,
    opacity: spec.opacity ?? 1,
    side: options.side || spec.side || THREE.FrontSide,
  });
  if (spec.blend === "additive") {
    material.blending = THREE.AdditiveBlending;
    material.depthWrite = false;
  }
  if (spec.texture) {
    const texture = getProceduralTexture(key, spec.texture);
    texture.repeat.set(...(options.repeat || [1, 1]));
    material.map = texture;
  }
  return material;
}

function getProceduralTexture(key, type) {
  const cacheKey = `${key}:${type}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (type === "brick") drawBrickTexture(ctx);
  else if (type === "wood") drawWoodTexture(ctx, materialLibrary[key].color);
  else if (type === "tile") drawTileTexture(ctx);
  else if (type === "reinforcedConcrete") drawReinforcedConcreteTexture(ctx);
  else if (type === "fabric") drawFabricTexture(ctx, materialLibrary[key].color);
  else drawConcreteTexture(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  textureCache.set(cacheKey, texture);
  return texture;
}

function drawConcreteTexture(ctx) {
  ctx.fillStyle = "#8e9189";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i += 1) {
    const shade = 120 + Math.random() * 50;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.16)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function drawReinforcedConcreteTexture(ctx) {
  drawConcreteTexture(ctx);
  ctx.strokeStyle = "rgba(54,58,56,0.34)";
  ctx.lineWidth = 3;
  for (let x = 28; x < 256; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 22, 256);
    ctx.stroke();
  }
  for (let y = 36; y < 256; y += 58) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + 10);
    ctx.stroke();
  }
}

function drawBrickTexture(ctx) {
  ctx.fillStyle = "#7f3f34";
  ctx.fillRect(0, 0, 256, 256);
  const brickH = 32;
  const brickW = 76;
  for (let y = 0; y < 256; y += brickH) {
    const offset = (y / brickH) % 2 ? -brickW / 2 : 0;
    for (let x = offset; x < 256; x += brickW) {
      ctx.fillStyle = `rgb(${150 + Math.random() * 35}, ${70 + Math.random() * 24}, ${50 + Math.random() * 18})`;
      ctx.fillRect(x + 2, y + 2, brickW - 4, brickH - 4);
    }
  }
  ctx.strokeStyle = "#d8c2aa";
  ctx.lineWidth = 2;
  for (let y = 0; y <= 256; y += brickH) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
}

function drawWoodTexture(ctx, baseColor) {
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 7) {
    ctx.strokeStyle = `rgba(70,42,22,${0.12 + Math.random() * 0.2})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y) * 2);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x / 18 + y / 12) * 4);
    ctx.stroke();
  }
}

function drawTileTexture(ctx) {
  ctx.fillStyle = "#d8d1c2";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#9f9a91";
  ctx.lineWidth = 3;
  for (let p = 0; p <= 256; p += 64) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 256);
    ctx.moveTo(0, p);
    ctx.lineTo(256, p);
    ctx.stroke();
  }
}

function drawFabricTexture(ctx, baseColor) {
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  for (let p = 0; p < 256; p += 6) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 256);
    ctx.moveTo(0, p);
    ctx.lineTo(256, p);
    ctx.stroke();
  }
}

function materialForType(type, preset) {
  const style = state?.style || "american";
  const matMap = STYLE_MATERIAL_MAP[style];
  if (matMap && matMap[type]) return matMap[type];
  if (type === "wall") return preset.wall;
  if (type === "window") return "glass";
  if (type === "door" || type === "table" || type === "tvUnit" || type === "stairs") return preset.furniture;
  if (type === "lamp" || type === "spotlight" || type === "doorHandle" || type === "windowHandle") return "metal";
  if (type === "sofa" || type === "curtain") return "fabric";
  if (type === "tv" || type === "cooktop" || type === "oven") return "darkScreen";
  if (type === "fridge" || type === "washer") return "metal";
  if (type === "toilet" || type === "sink" || type === "bathtub") return "ceramic";
  if (type === "shower") return "glass";
  if (type === "armchair" || type === "pouf") return "fabric";
  if (type === "coffeeTable" || type === "diningTable" || type === "nightstand" || type === "desk" || type === "bench") return preset.furniture;
  if (type === "diningChair") return preset.furniture;
  if (type === "bed") return preset.furniture;
  if (type === "wardrobe" || type === "bookshelf") return preset.furniture;
  if (type === "officeChair") return "fabric";
  if (type === "plant" || type === "tree" || type === "flowerPot") return "paintWarm";
  if (type === "rock") return "rock";
  if (type === "water") return "water";
  if (type === "cloth") return "fabric";
  if (type === "gas") return "smokeGas";
  if (type === "particles") return "lightWarm";
  return preset.accent;
}

function labelFor(type) {
  return {
    box: "Cube",
    sofa: "Sofa",
    table: "Table",
    lamp: "Lamp",
    spotlight: "Spot",
    wall: "Mur",
    door: "Porte",
    window: "Fenetre",
    tvUnit: "Meuble TV",
    tv: "TV",
    fridge: "Frigo",
    oven: "Four",
    washer: "Lave linge",
    cooktop: "Plaque cuisson",
    doorHandle: "Poignee porte",
    windowHandle: "Poignee fenetre",
    curtain: "Rideaux",
    stairs: "Escalier",
    toilet: "Toilette",
    sink: "Lavabo",
    shower: "Douche",
    bathtub: "Baignoire",
    armchair: "Fauteuil",
    pouf: "Pouf",
    coffeeTable: "Table basse",
    diningTable: "Table manger",
    diningChair: "Chaise",
    bed: "Lit",
    wardrobe: "Armoire",
    nightstand: "Table nuit",
    desk: "Bureau",
    bookshelf: "Bibliotheque",
    officeChair: "Chaise bureau",
    plant: "Plante",
    tree: "Arbre",
    flowerPot: "Pot fleur",
    bench: "Banc",
    sphere: "Sphere",
    cone: "Cone",
    cylinder: "Cylindre",
    rock: "Roche",
    water: "Eau fluide",
    cloth: "Tissu",
    gas: "Gaz",
    particles: "Particules",
  }[type] || "Objet";
}

function colorFor(type) {
  return {
    box: "#4da3ff",
    sofa: "#bb7d5a",
    table: "#c7a55a",
    lamp: "#e7d58f",
    spotlight: "#f0d27a",
    wall: "#d8d2c5",
    door: "#e7c46a",
    window: "#88c8d8",
    tvUnit: "#9b7047",
    tv: "#111315",
    fridge: "#d8dde0",
    oven: "#3d4246",
    washer: "#d8dde0",
    cooktop: "#111315",
    doorHandle: "#9a9fa2",
    windowHandle: "#9a9fa2",
    curtain: "#b7a080",
    stairs: "#b98a55",
    toilet: "#f2eee4",
    sink: "#f2eee4",
    shower: "#88c8d8",
    bathtub: "#f2eee4",
    armchair: "#bb7d5a",
    pouf: "#d4a57a",
    coffeeTable: "#b98a55",
    diningTable: "#c7a55a",
    diningChair: "#b98a55",
    bed: "#e8dfcf",
    wardrobe: "#9b7047",
    nightstand: "#b98a55",
    desk: "#b98a55",
    bookshelf: "#9b7047",
    officeChair: "#3d4246",
    plant: "#5a8a5a",
    tree: "#4a7a4a",
    flowerPot: "#d48a6a",
    bench: "#8a6a4a",
    sphere: "#4da3ff",
    cone: "#4da3ff",
    cylinder: "#4da3ff",
    rock: "#7a7a7a",
    water: "#2f7fb2",
    cloth: "#bb7d5a",
    gas: "#9aa4ac",
    particles: "#ffe9a8",
  }[type] || "#8aa0a6";
}

function selectFromPointer(event) {
  if (measureActive) return;
  if (state.selectionMode !== "point") return;
  const bounds = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(objectGroup.children, true);
  if (hits.length) {
    const hitId = hits[0].object.userData.id;
    if (state.boolean.active) {
      performBoolean(hitId);
    } else {
      selectObject(hitId, event.shiftKey);
    }
  }
}

let boxStartX = 0, boxStartY = 0;

function startBoxSelect(event) {
  if (state.selectionMode !== "rect" || event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  boxStartX = event.clientX - rect.left;
  boxStartY = event.clientY - rect.top;
  const overlay = document.querySelector("#boxOverlay");
  overlay.classList.remove("hidden");
  overlay.style.left = boxStartX + "px";
  overlay.style.top = boxStartY + "px";
  overlay.style.width = "0px";
  overlay.style.height = "0px";
}

function moveBoxSelect(event) {
  if (state.selectionMode !== "rect") return;
  const overlay = document.querySelector("#boxOverlay");
  if (overlay.classList.contains("hidden")) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  overlay.style.left = Math.min(x, boxStartX) + "px";
  overlay.style.top = Math.min(y, boxStartY) + "px";
  overlay.style.width = Math.abs(x - boxStartX) + "px";
  overlay.style.height = Math.abs(y - boxStartY) + "px";
}

function endBoxSelect(event) {
  if (state.selectionMode !== "rect") return;
  const overlay = document.querySelector("#boxOverlay");
  if (overlay.classList.contains("hidden")) return;
  overlay.classList.add("hidden");
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const minX = Math.min(x, boxStartX);
  const maxX = Math.max(x, boxStartX);
  const minY = Math.min(y, boxStartY);
  const maxY = Math.max(y, boxStartY);
  const area = (maxX - minX) * (maxY - minY);
  if (area < 20) return;
  const vpWidth = rect.width;
  const vpHeight = rect.height;
  const ndcMin = new THREE.Vector2((minX / vpWidth) * 2 - 1, -((maxY / vpHeight) * 2 - 1));
  const ndcMax = new THREE.Vector2((maxX / vpWidth) * 2 - 1, -((minY / vpHeight) * 2 - 1));
  const box = new THREE.Box2(ndcMin, ndcMax);
  const selected = [];
  objectGroup.children.forEach((child) => {
    if (!child.isMesh) return;
    const pos = new THREE.Vector3();
    child.getWorldPosition(pos);
    const projected = pos.clone().project(camera);
    if (projected.x >= box.min.x && projected.x <= box.max.x && projected.y >= box.min.y && projected.y <= box.max.y) {
      const depthInRange = projected.z >= -1 && projected.z <= 1;
      if (depthInRange) selected.push(child);
    }
  });
  if (selected.length) {
    state.selectedIds = [];
    selected.forEach((child) => state.selectedIds.push(child.userData.id));
    const primary = primaryId();
    const mesh = primary ? findMesh(primary) : null;
    transformControls.detach();
    if (mesh && state.selectedIds.length === 1) transformControls.attach(mesh);
    renderObjectList();
    renderInspector();
  }
}

/* ---- Lasso Selection ---- */
let lassoPoints = null;
let lassoActive = false;

function startLassoSelect(event) {
  if (state.selectionMode !== "line" || event.button !== 0) return;
  if (state.draw.active) return;
  const tag = event.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
  lassoActive = true;
  lassoPoints = [];
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  lassoPoints.push({ x, y });
  renderer.domElement.setPointerCapture(event.pointerId);
}

function moveLassoSelect(event) {
  if (!lassoActive || !lassoPoints) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  lassoPoints.push({ x, y });
  drawLassoPath();
}

function endLassoSelect(event) {
  if (!lassoActive || !lassoPoints) return;
  lassoActive = false;
  renderer.domElement.releasePointerCapture(event.pointerId);
  if (lassoPoints.length < 5) { lassoPoints = null; clearLassoPath(); return; }
  const rect = renderer.domElement.getBoundingClientRect();
  const vpWidth = rect.width;
  const vpHeight = rect.height;
  const ndcPoints = lassoPoints.map((p) => new THREE.Vector2((p.x / vpWidth) * 2 - 1, -((p.y / vpHeight) * 2 - 1)));
  lassoPoints = null;
  clearLassoPath();
  const selected = [];
  objectGroup.children.forEach((child) => {
    if (!child.isMesh) return;
    const pos = new THREE.Vector3();
    child.getWorldPosition(pos);
    const projected = pos.clone().project(camera);
    if (projected.z < -1 || projected.z > 1) return;
    const p = new THREE.Vector2(projected.x, projected.y);
    if (pointInPolygon(p, ndcPoints)) selected.push(child);
  });
  if (selected.length) {
    state.selectedIds = [];
    selected.forEach((child) => state.selectedIds.push(child.userData.id));
    const primary = primaryId();
    const mesh = primary ? findMesh(primary) : null;
    transformControls.detach();
    if (mesh && state.selectedIds.length === 1) transformControls.attach(mesh);
    renderObjectList();
    renderInspector();
  }
}

function drawLassoPath() {
  if (!lassoPoints || lassoPoints.length < 2) return;
  const canvas = dom.drawCanvas;
  if (!canvas) return;
  renderDraw();
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio, 2);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.beginPath();
  ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
  for (let i = 1; i < lassoPoints.length; i++) {
    ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
  }
  ctx.closePath();
  ctx.strokeStyle = "#35b49c";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(53,180,156,0.12)";
  ctx.fill();
}

function clearLassoPath() {
  renderDraw();
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > point.y) !== (yj > point.y) && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function updateSelectCursor(event) {
  if (state.draw.active || state.landscape.mesh) {
    renderer.domElement.style.cursor = "default";
    return;
  }
  if (state.selectionMode === "rect" || state.selectionMode === "line") {
    renderer.domElement.style.cursor = "crosshair";
    return;
  }
  if (state.selectionMode !== "point") {
    renderer.domElement.style.cursor = "default";
    return;
  }
  const bounds = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(objectGroup.children, true);
  const overSelectable = hits.some((h) => h.object.userData.id);
  renderer.domElement.style.cursor = overSelectable ? "pointer" : "default";
}

function selectSameType() {
  const id = primaryId();
  if (!id) return;
  const spec = findSpec(id);
  if (!spec) return;
  state.selectedIds = state.objects.filter((o) => o.type === spec.type).map((o) => o.id);
  const primary = primaryId();
  const mesh = primary ? findMesh(primary) : null;
  transformControls.detach();
  if (mesh && state.selectedIds.length === 1) transformControls.attach(mesh);
  renderObjectList();
  renderInspector();
}

function selectObject(id, additive) {
  if (additive) {
    const idx = state.selectedIds.indexOf(id);
    if (idx !== -1) {
      state.selectedIds.splice(idx, 1);
    } else {
      state.selectedIds.push(id);
    }
  } else {
    state.selectedIds = [id];
  }
  const primary = primaryId();
  const mesh = primary ? findMesh(primary) : null;
  transformControls.detach();
  if (mesh && state.selectedIds.length === 1) transformControls.attach(mesh);
  renderObjectList();
  renderInspector();
}

function findMesh(id) {
  if (isClusterId(id)) return findClusterAnchor(id);
  return objectGroup.children.find((mesh) => mesh.userData.id === id);
}

function findSpec(id) {
  return state.objects.find((object) => object.id === id);
}

function primaryId() {
  return state.selectedIds.length ? state.selectedIds[state.selectedIds.length - 1] : null;
}

function renderObjectList() {
  dom.objectList.innerHTML = "";
  state.objects.forEach((object) => {
    const item = document.createElement("button");
    const sel = state.selectedIds.includes(object.id);
    item.className = `object-item${sel ? " active" : ""}`;
    item.innerHTML = `<span>${escapeHTML(object.name)}</span><span class="object-type">${escapeHTML(object.type)}</span>`;
    item.addEventListener("click", (e) => selectObject(object.id, e.shiftKey || e.ctrlKey || e.metaKey));
    dom.objectList.appendChild(item);
  });
  state.clusters.forEach((cluster) => {
    const item = document.createElement("button");
    const sel = state.selectedIds.includes(cluster.id);
    item.className = `object-item cluster-item${sel ? " active" : ""}`;
    item.innerHTML = `<span>${escapeHTML(cluster.name)}</span><span class="object-type">${cluster.members.length} obj</span>`;
    item.addEventListener("click", (e) => selectObject(cluster.id, e.shiftKey || e.ctrlKey || e.metaKey));
    dom.objectList.appendChild(item);
  });
  populateSceneTree();
  updateModifierStack();
  updateStatusBar();
  updatePipeline();
}

function renderInspector() {
  const id = state.selectedIds.length <= 1 ? primaryId() : null;
  const spec = id ? findSpec(id) : null;
  if (state.selectedIds.length > 1) {
    dom.emptyInspector.textContent = `${state.selectedIds.length} objets sélectionnés`;
    dom.emptyInspector.classList.remove("hidden");
    dom.inspector.classList.add("hidden");
    return;
  }
  if (id && isClusterId(id)) {
    const cluster = findCluster(id);
    dom.inspector.classList.add("hidden");
    dom.emptyInspector.classList.remove("hidden");
    dom.emptyInspector.textContent = cluster
      ? `${cluster.name} — ${cluster.members.length} objets (bouge le gizmo pour déplacer le groupe)`
      : "Groupe";
    return;
  }
  dom.emptyInspector.classList.toggle("hidden", Boolean(spec));
  dom.emptyInspector.textContent = "Sélectionne un objet dans la scène.";
  dom.inspector.classList.toggle("hidden", !spec);
  if (!spec) return;

  setValue("objectName", spec.name);
  setValue("posX", spec.position.x);
  setValue("posY", spec.position.y);
  setValue("posZ", spec.position.z);
  setValue("scaleX", spec.scale.x);
  setValue("scaleY", spec.scale.y);
  setValue("scaleZ", spec.scale.z);
  setValue("objectColor", spec.color);
  setValue("objectMaterial", spec.material || "paintWarm");
  setValue("rotX", THREE.MathUtils.radToDeg(spec.rotation?.x || 0));
  setValue("rotY", THREE.MathUtils.radToDeg(spec.rotation?.y || 0));
  setValue("rotZ", THREE.MathUtils.radToDeg(spec.rotation?.z || 0));
}

function setValue(id, value) {
  const input = document.querySelector(`#${id}`);
  if (document.activeElement !== input) input.value = value;
}

function updateSelectedFromInspector() {
  const id = primaryId();
  if (!id) return;
  const spec = findSpec(id);
  const mesh = findMesh(id);
  if (!spec || !mesh) return;
  spec.name = document.querySelector("#objectName").value || spec.name;
  spec.position = {
    x: numberValue("posX", spec.position.x),
    y: numberValue("posY", spec.position.y),
    z: numberValue("posZ", spec.position.z),
  };
  spec.scale = {
    x: numberValue("scaleX", spec.scale.x),
    y: numberValue("scaleY", spec.scale.y),
    z: numberValue("scaleZ", spec.scale.z),
  };
  spec.rotation = {
    x: THREE.MathUtils.degToRad(numberValue("rotX", 0)),
    y: THREE.MathUtils.degToRad(numberValue("rotY", 0)),
    z: THREE.MathUtils.degToRad(numberValue("rotZ", 0)),
  };
  spec.color = document.querySelector("#objectColor").value;
  spec.material = document.querySelector("#objectMaterial").value;
  applySpec(mesh, spec);
  renderObjectList();
}

function numberValue(id, fallback) {
  const value = Number(document.querySelector(`#${id}`).value);
  return Number.isFinite(value) ? value : fallback;
}

function syncObjectFromMesh(mesh) {
  const spec = findSpec(mesh.userData.id);
  if (!spec) return;
  spec.position = { x: round(mesh.position.x), y: round(mesh.position.y), z: round(mesh.position.z) };
  spec.scale = { x: round(mesh.scale.x), y: round(mesh.scale.y), z: round(mesh.scale.z) };
  spec.rotation = { x: round(mesh.rotation.x), y: round(mesh.rotation.y), z: round(mesh.rotation.z) };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function importPanorama(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.panoramaDataUrl = reader.result;
    state.panoramaName = file.name;
    dom.panoramaStatus.textContent = file.name;
    updatePanorama();
    updatePipeline();
  };
  reader.readAsDataURL(file);
}

function importPlanImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.plan.imageDataUrl = reader.result;
    state.plan.imageName = file.name;
    loadPlanImage();
    setMode("plan");
    updatePipeline();
  };
  reader.readAsDataURL(file);
}

function loadPlanImage() {
  if (!state.plan.imageDataUrl) {
    planImage = null;
    renderPlan();
    return;
  }
  planImage = new Image();
  planImage.onload = renderPlan;
  planImage.src = state.plan.imageDataUrl;
}

function updatePanorama() {
  if (!state.panoramaDataUrl) return;
  loader.load(state.panoramaDataUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    if (panoramaMesh) panoScene.remove(panoramaMesh);
    const geometry = new THREE.SphereGeometry(500, 64, 32);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    panoramaMesh = new THREE.Mesh(geometry, material);
    panoScene.add(panoramaMesh);
    scene.background = texture;
  });
}

function applyRoomInputs() {
  pushUndo();
  state.room = {
    width: numberValue("roomWidth", state.room.width),
    depth: numberValue("roomDepth", state.room.depth),
    height: numberValue("roomHeight", state.room.height),
    fromPlan: false,
  };
  buildRoom();
}

function applyStylePreset() {
  pushUndo();
  state.style = document.querySelector("#stylePreset").value;
  const preset = stylePresets[state.style] || stylePresets.american;
  state.objects.forEach((object) => {
    object.material = materialForType(object.type, preset);
    object.color = materialLibrary[object.material]?.color || object.color;
    const mesh = findMesh(object.id);
    if (mesh) applySpec(mesh, object);
  });
  buildRoom();
  renderInspector();
}

function applyMaterialToSelection(materialKey) {
  pushUndo();
  state.selectedIds.forEach((id) => {
    const spec = findSpec(id);
    const mesh = findMesh(id);
    if (!spec || !mesh) return;
    spec.material = materialKey;
    spec.color = materialLibrary[materialKey]?.color || spec.color;
    applySpec(mesh, spec);
  });
  renderInspector();
}

function setMode(mode) {
  state.mode = mode;
  document.querySelector("#modelModeBtn").classList.toggle("active", mode === "model");
  document.querySelector("#planModeBtn").classList.toggle("active", mode === "plan");
  document.querySelector("#panoModeBtn").classList.toggle("active", mode === "pano");
  document.querySelector("#splitModeBtn").classList.toggle("active", mode === "split");
  dom.viewport.classList.toggle("hidden", mode !== "model" && mode !== "split");
  dom.planViewport.classList.toggle("hidden", mode !== "plan");
  dom.panoramaViewport.classList.toggle("hidden", mode !== "pano" && mode !== "split");
  dom.viewport.classList.toggle("split-left", mode === "split");
  dom.panoramaViewport.classList.toggle("split-right", mode === "split");
  if (mode !== "model") {
    if (state.draw.active) {
      state.draw.tool = null;
      state.draw.active = false;
      state.draw.current = null;
      dom.drawCanvas.classList.remove("active");
      dom.drawCanvas.style.pointerEvents = "none";
      document.querySelectorAll("[data-draw-tool]").forEach((btn) => btn.classList.remove("active"));
  renderDraw();
  updateDrawPipeline();
}
    if (state.boolean.active) {
      state.boolean.active = false;
      state.boolean.firstId = null;
      document.querySelector("#booleanBtn").classList.remove("active");
      document.querySelector("#booleanStatus").classList.add("hidden");
    }
    if (state.deform.active) {
      state.deform.active = false;
      document.querySelector("#deformBtn").classList.remove("active");
    }
  }
  resize();
  renderPlan();
}

function newProject() {
  exitSubObjectMode();
  clearMeasurements();
  state.name = "Projet sans titre";
  state.style = "american";
  state.panoramaDataUrl = "";
  state.panoramaName = "";
  state.plan = { imageDataUrl: "", imageName: "", scale: 70, tool: "wall", segments: [] };
  state.objects = [];
  state.selectedIds = [];
  state.clusters = [];
  state.room = { width: 7, depth: 5, height: 3 };
  state.draw = { tool: null, active: false, shapes: [], current: null, scale: 100 };
  state.boolean = { active: false, firstId: null, operation: "subtract" };
  state.deform = { active: false, type: "bend", strength: 0.3, geoBackup: null };
  state.snap = { enabled: false, size: 0.5 };
  state.cine = { shots: [], objKeys: [], index: -1, playing: false, t: 0, rec: null, loop: false, duration: null };
  renderCineTimeline();
  updateCineHead();
  state.selectionMode = "point";
  document.querySelector("#booleanBtn").classList.remove("active");
  document.querySelector("#deformBtn").classList.remove("active");
  document.querySelector("#snapBtn").classList.remove("active");
  document.querySelectorAll("[data-sel-mode]").forEach((btn) => btn.classList.toggle("active", btn.dataset.selMode === "point"));
  document.querySelector("#boxSelectBtn")?.classList.remove("active");
  state.showGrid = true;
  landscapeGroup.clear();
  state.landscape.mesh = null;
  document.querySelector("#booleanStatus").classList.add("hidden");
  dom.drawCanvas.classList.remove("active");
  dom.drawCanvas.style.pointerEvents = "none";
  document.querySelectorAll("[data-draw-tool]").forEach((btn) => btn.classList.remove("active"));
  scene.background = new THREE.Color(0x111315);
  scene.environment = null;
  objectGroup.clear();
  transformControls.detach();
  transformControls.setTranslationSnap(null);
  transformControls.setRotationSnap(null);
  if (panoramaMesh) panoScene.remove(panoramaMesh);
  panoramaMesh = null;
  state.envPreset = "";
  textureCache.clear();
  document.querySelector("#roomWidth").value = state.room.width;
  document.querySelector("#roomDepth").value = state.room.depth;
  document.querySelector("#roomHeight").value = state.room.height;
  document.querySelector("#planScale").value = state.plan.scale;
  document.querySelector("#stylePreset").value = state.style;
  dom.panoramaStatus.textContent = "Aucune image chargee";
  dom.planStatus.textContent = "Clique et glisse dans le plan pour tracer.";
  planImage = null;
  setPlanTool("wall");
  buildRoom();
  state.undo = { history: [], index: -1, max: 50 };
  pushUndo();
  updateProjectUI();
  renderObjectList();
  renderInspector();
  renderPlan();
  renderDraw();
}

function saveProject() {
  const data = JSON.stringify(toProjectJSON(), null, 2);
  download(data, `${slug(state.name)}.pix`, "application/json");
}

function saveAsProject() {
  const name = prompt("Nom du projet :", state.name);
  if (!name || !name.trim()) return;
  state.name = name.trim();
  dom.projectName.value = state.name;
  saveProject();
}

function toProjectJSON() {
  const ls = state.landscape;
  const landscapeHeightData = ls.mesh ? Array.from(ls.mesh.geometry.attributes.position.array) : null;
  return {
    app: "Iner Studio",
    version: 2,
    savedAt: new Date().toISOString(),
    name: state.name,
    style: state.style,
    room: state.room,
    panorama: {
      name: state.panoramaName,
      dataUrl: state.panoramaDataUrl,
    },
    plan: state.plan,
    objects: state.objects,
    clusters: state.clusters,
    draw: {
      shapes: state.draw.shapes,
      scale: state.draw.scale,
    },
    landscape: ls.mesh ? {
      size: ls.size,
      resolution: ls.resolution,
      brushSize: ls.brushSize,
      brushStrength: ls.brushStrength,
      tool: ls.tool,
      heightData: landscapeHeightData,
    } : null,
    snap: state.snap,
    showGrid: state.showGrid,
    envPreset: state.envPreset || "",
    cine: cineData(),
  };
}

function openProject(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const project = JSON.parse(reader.result);
      loadProject(project, file.name);
    } catch {
      alert("Projet invalide.");
    }
  };
  reader.readAsText(file);
}

function loadProject(project, fileName) {
  newProject();
  state.name = project.name || fileName.replace(/\.(pix|inrproject)$/i, "");
  state.style = project.style || "american";
  state.room = project.room || state.room;
  state.plan = {
    imageDataUrl: project.plan?.imageDataUrl || "",
    imageName: project.plan?.imageName || "",
    scale: project.plan?.scale || 70,
    tool: project.plan?.tool || "wall",
    segments: project.plan?.segments || [],
  };
  state.panoramaDataUrl = project.panorama?.dataUrl || "";
  state.panoramaName = project.panorama?.name || "";
  document.querySelector("#roomWidth").value = state.room.width;
  document.querySelector("#roomDepth").value = state.room.depth;
  document.querySelector("#roomHeight").value = state.room.height;
  document.querySelector("#planScale").value = state.plan.scale;
  document.querySelector("#stylePreset").value = state.style;
  setPlanTool(state.plan.tool);
  buildRoom();
  loadPlanImage();
  if (state.panoramaDataUrl) {
    dom.panoramaStatus.textContent = state.panoramaName || "Panorama charge";
    updatePanorama();
  }
  (project.objects || []).forEach((object) => addObject(object.type, object));
  state.clusters = (project.clusters || []).filter((c) => Array.isArray(c.members)).map((c) => ({
    id: c.id && !findClusterAnchor(c.id) ? c.id : crypto.randomUUID(),
    name: c.name || "Groupe",
    members: (c.members || []).filter((m) => state.objects.some((o) => o.id === m)),
  }));
  state.clusters = state.clusters.filter((c) => c.members.length > 0);
  state.clusters.forEach((cluster) => createClusterAnchor(cluster));

  if (project.draw?.shapes) {
    state.draw.shapes = project.draw.shapes;
    state.draw.scale = project.draw.scale || 100;
    renderDraw();
  }

  if (project.landscape) {
    const ld = project.landscape;
    state.landscape.size = ld.size || 20;
    state.landscape.resolution = ld.resolution || 64;
    state.landscape.brushSize = ld.brushSize || 2;
    state.landscape.brushStrength = ld.brushStrength || 0.1;
    state.landscape.tool = ld.tool || "raise";
    createTerrain();
    if (ld.heightData) {
      const mesh = state.landscape.mesh;
      if (mesh) {
        const pos = mesh.geometry.attributes.position;
        const arr = ld.heightData;
        for (let i = 0; i < Math.min(pos.count, arr.length / 3); i++) {
          pos.setY(i, arr[i * 3 + 1]);
        }
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
      }
    }
  }

  if (project.snap) {
    state.snap = project.snap;
    document.querySelector("#snapBtn").classList.toggle("active", state.snap.enabled);
    applySnap();
  }

  if (project.showGrid != null) {
    state.showGrid = project.showGrid;
    if (gridHelper) gridHelper.visible = state.showGrid;
    document.querySelector("#gridBtn").classList.toggle("active", state.showGrid);
  }

  if (project.envPreset) {
    state.envPreset = project.envPreset;
    applyEnvPreset(project.envPreset);
  }

  restoreCineData(project.cine);

  updateProjectUI();
}

function exportOBJ() {
  const exporter = new OBJExporter();
  const exportRoot = new THREE.Group();
  exportRoot.add(roomGroup.clone(), objectGroup.clone());
  const obj = exporter.parse(exportRoot);
  download(obj, `${slug(state.name)}.obj`, "text/plain");
}

function exportGLB() {
  const exporter = new GLTFExporter();
  const exportRoot = new THREE.Group();
  exportRoot.add(roomGroup.clone(true), objectGroup.clone(true));
  exporter.parse(exportRoot, (result) => {
    const blob = new Blob([result], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug(state.name)}.glb`;
    link.click();
    URL.revokeObjectURL(url);
  }, (error) => {
    console.error("GLB export error:", error);
  }, { binary: true, includeCustomExtensions: false });
}

function exportPanorama() {
  const eqW = 4096, eqH = 2048;
  const faceSize = 2048;
  const origBg = scene.background;
  const origClearColor = renderer.getClearColor(new THREE.Color());
  const origClearAlpha = renderer.getClearAlpha();
  const origPixelRatio = renderer.getPixelRatio();
  renderer.setPixelRatio(1);

  const rt = new THREE.WebGLRenderTarget(faceSize, faceSize, { type: THREE.UnsignedByteType });
  const tempCam = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
  tempCam.position.set(0, 1.6, 0);

  const dirs = [
    { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
    { dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
    { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
    { dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
    { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
    { dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  ];

  const faces = [];
  for (const d of dirs) {
    tempCam.lookAt(d.dir.clone().add(tempCam.position), d.up);
    renderer.setRenderTarget(rt);
    renderer.render(scene, tempCam);
    const pixels = new Uint8Array(faceSize * faceSize * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, faceSize, faceSize, pixels);
    faces.push(pixels);
  }
  renderer.setRenderTarget(null);

  const eqCanvas = document.createElement("canvas");
  eqCanvas.width = eqW;
  eqCanvas.height = eqH;
  const eqCtx = eqCanvas.getContext("2d");
  const eqData = eqCtx.createImageData(eqW, eqH);

  for (let y = 0; y < eqH; y++) {
    for (let x = 0; x < eqW; x++) {
      const theta = (x / eqW) * 2 * Math.PI;
      const phi = (y / eqH) * Math.PI;
      const dir = new THREE.Vector3(
        -Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      );
      const absX = Math.abs(dir.x), absY = Math.abs(dir.y), absZ = Math.abs(dir.z);
      let faceIdx, u, v;
      if (absX >= absY && absX >= absZ) {
        faceIdx = dir.x > 0 ? 2 : 3;
        u = dir.z / absX; v = -dir.y / absX;
      } else if (absY >= absX && absY >= absZ) {
        faceIdx = dir.y > 0 ? 4 : 5;
        u = dir.x / absY; v = dir.z / absY;
      } else {
        faceIdx = dir.z > 0 ? 0 : 1;
        u = dir.x / absZ; v = -dir.y / absZ;
      }
      const px = Math.min(faceSize - 1, Math.floor((u + 1) / 2 * faceSize));
      const py = Math.min(faceSize - 1, Math.floor((v + 1) / 2 * faceSize));
      const srcIdx = (py * faceSize + px) * 4;
      const dstIdx = (y * eqW + x) * 4;
      if (srcIdx >= 0 && srcIdx + 2 < faces[faceIdx].length) {
        eqData.data[dstIdx] = faces[faceIdx][srcIdx];
        eqData.data[dstIdx + 1] = faces[faceIdx][srcIdx + 1];
        eqData.data[dstIdx + 2] = faces[faceIdx][srcIdx + 2];
        eqData.data[dstIdx + 3] = 255;
      }
    }
  }
  eqCtx.putImageData(eqData, 0, 0);

  const link = document.createElement("a");
  link.download = `${slug(state.name)}_360.png`;
  link.href = eqCanvas.toDataURL("image/png");
  link.click();

  renderer.setPixelRatio(origPixelRatio);
  scene.background = origBg;
  renderer.setClearColor(origClearColor, origClearAlpha);
  rt.dispose();
}

function takeScreenshot() {
  const rect = dom.viewport.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const scale = 2;
  const origPR = renderer.getPixelRatio();
  renderer.setPixelRatio(origPR * scale);
  renderer.setSize(w * scale, h * scale, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = `${slug(state.name)}.png`;
  link.href = dataUrl;
  link.click();
  renderer.setPixelRatio(origPR);
  resize();
}

/* ---- Environment / HDRI ---- */
let pmremGenerator = null;

function getPMREM() {
  if (!pmremGenerator) pmremGenerator = new THREE.PMREMGenerator(renderer);
  return pmremGenerator;
}

const envPresets = {
  studio: { top: 0xf0f0f0, bottom: 0xaaaaaa, intensity: 1.0 },
  outdoor: { top: 0x87ceeb, bottom: 0xd4c9a8, intensity: 1.5 },
  sunset: { top: 0xff7744, bottom: 0xffaa77, intensity: 1.2 },
  night: { top: 0x0a0a1a, bottom: 0x1a1a2e, intensity: 0.6 },
};

function applyEnvPreset(preset) {
  state.envPreset = preset;
  document.querySelectorAll("[data-env-preset]").forEach((btn) => btn.classList.toggle("active", btn.dataset.envPreset === preset));

  if (!preset) {
    scene.background = new THREE.Color(0x111315);
    scene.environment = null;
    return;
  }

  const colors = envPresets[preset];
  if (!colors) return;

  const pmrem = getPMREM();
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(colors.top);

  const hemi = new THREE.HemisphereLight(colors.top, colors.bottom, 2);
  envScene.add(hemi);

  const envMap = pmrem.fromScene(envScene, 0, 0.1).texture;
  scene.environment = envMap;
  scene.background = new THREE.Color(colors.top);
  scene.backgroundIntensity = colors.intensity;
  scene.environmentIntensity = colors.intensity;
}

function importHDR(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  document.querySelectorAll("[data-env-preset]").forEach((btn) => btn.classList.remove("active"));
  state.envPreset = "__custom";
  const reader = new FileReader();
  reader.onload = () => {
    const loader = new RGBELoader();
    const data = reader.result;
    const rgba = loader.parse(data);
    const pmrem = getPMREM();
    const envMap = pmrem.fromEquirectangular(rgba).texture;
    scene.environment = envMap;
    scene.background = envMap;
    rgba.dispose();
  };
  reader.readAsArrayBuffer(file);
  event.target.value = "";
}

function importGLB(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const loader = new GLTFLoader();
    loader.parse(reader.result, "", (gltf) => {
      const importedIds = [];
      gltf.scene.traverse((child) => {
        if (!child.isMesh) return;
        const id = crypto.randomUUID();
        child.userData.id = id;
        child.userData.type = "box";
        const mat = child.material;
        const color = mat?.color ? "#" + mat.color.getHexString() : "#cccccc";
        const spec = {
          id,
          type: "box",
          name: child.name || "Imported",
          position: { x: round(child.position.x), y: round(child.position.y), z: round(child.position.z) },
          scale: { x: round(child.scale.x), y: round(child.scale.y), z: round(child.scale.z) },
          rotation: { x: round(child.rotation.x), y: round(child.rotation.y), z: round(child.rotation.z) },
          color,
          material: "paintWarm",
        };
        state.objects.push(spec);
        objectGroup.add(child);
        importedIds.push(id);
      });
      if (importedIds.length) {
        selectObject(importedIds[importedIds.length - 1]);
      }
      renderObjectList();
      renderInspector();
    }, (error) => {
      console.error("GLB import error:", error);
      alert("Erreur lors de l'import GLB.");
    });
  };
  reader.readAsArrayBuffer(file);
  event.target.value = "";
}

function duplicateSelected() {
  pushUndo();
  if (!state.selectedIds.length) return;
  state.selectedIds.forEach((id) => {
    const spec = findSpec(id);
    if (!spec) return;
    const newSpec = JSON.parse(JSON.stringify(spec));
    newSpec.id = crypto.randomUUID();
    newSpec.name = `${spec.name} copie`;
    newSpec.position.x += 0.3;
    newSpec.position.z += 0.3;
    state.objects.push(newSpec);
    const mesh = createMesh(newSpec);
    objectGroup.add(mesh);
  });
  renderObjectList();
}

function deleteSelected() {
  if (!state.selectedIds.length) return;
  let ids = [...state.selectedIds];
  const deletedClusters = new Set();
  ids.forEach((id) => {
    const cluster = findCluster(id);
    if (cluster) {
      deletedClusters.add(cluster.id);
      cluster.members.forEach((m) => { if (!ids.includes(m)) ids.push(m); });
    }
  });
  exitSubObjectMode();
  pushUndo();
  ids.forEach((id) => {
    const mesh = findMesh(id);
    if (mesh) objectGroup.remove(mesh);
    state.objects = state.objects.filter((object) => object.id !== id);
  });
  state.clusters = state.clusters.filter((cluster) => {
    const anchor = findClusterAnchor(cluster.id);
    if (deletedClusters.has(cluster.id)) {
      if (anchor) objectGroup.remove(anchor);
      return false;
    }
    cluster.members = cluster.members.filter((m) => !ids.includes(m));
    if (!cluster.members.length) {
      if (anchor) objectGroup.remove(anchor);
      return false;
    }
    return true;
  });
  state.selectedIds = [];
  transformControls.detach();
  renderObjectList();
  renderInspector();
}

function scaleUpSelected() {
  pushUndo();
  state.selectedIds.forEach((id) => {
    const spec = findSpec(id);
    const mesh = findMesh(id);
    if (!spec || !mesh) return;
    const scale = 1.2;
    spec.scale.x *= scale;
    spec.scale.y *= scale;
    spec.scale.z *= scale;
    mesh.scale.set(spec.scale.x, spec.scale.y, spec.scale.z);
    mesh.updateMatrix();
  });
  renderInspector();
}

/* ---- Boolean Operations ---- */
function toggleBoolean() {
  const bool = state.boolean;
  const status = document.querySelector("#booleanStatus");

  if (!bool.active) {
    if (!primaryId()) {
      status.textContent = "Select first object";
      status.classList.remove("hidden");
      setTimeout(() => status.classList.add("hidden"), 2000);
      return;
    }
    bool.active = true;
    bool.firstId = primaryId();
    bool.operation = "subtract";
    document.querySelector("#booleanBtn").classList.add("active");
    status.textContent = "Click second object";
    status.classList.remove("hidden");
  } else {
    const ops = ["subtract", "union", "intersect"];
    const idx = ops.indexOf(bool.operation);
    bool.operation = ops[(idx + 1) % ops.length];
    status.textContent = `Mode: ${bool.operation}`;
  }
  updateStatusBar();
}

function performBoolean(hitId) {
  pushUndo();
  const bool = state.boolean;
  if (!bool.active || !bool.firstId || hitId === bool.firstId) return;

  const meshA = findMesh(bool.firstId);
  const meshB = findMesh(hitId);
  const specA = findSpec(bool.firstId);
  const specB = findSpec(hitId);
  if (!meshA || !meshB || !specA || !specB) return;

  const getOperandMesh = (mesh) => {
    if (mesh.isMesh) return mesh;
    let result = null;
    mesh.traverse((child) => {
      if (child.isMesh && !result) result = child;
    });
    return result;
  };

  const opA = getOperandMesh(meshA);
  const opB = getOperandMesh(meshB);
  if (!opA || !opB) {
    document.querySelector("#booleanStatus").textContent = "Need mesh objects";
    return;
  }

  opA.updateWorldMatrix(true, false);
  opB.updateWorldMatrix(true, false);

  let resultMesh;
  try {
    switch (bool.operation) {
      case "union":
        resultMesh = CSG.union(opA, opB);
        break;
      case "subtract":
        resultMesh = CSG.subtract(opA, opB);
        break;
      case "intersect":
        resultMesh = CSG.intersect(opA, opB);
        break;
    }
  } catch (e) {
    document.querySelector("#booleanStatus").textContent = "Boolean failed";
    console.error(e);
    return;
  }

  if (!resultMesh) return;

  const resultId = crypto.randomUUID();
  resultMesh.userData.id = resultId;
  resultMesh.userData.type = "box";
  resultMesh.castShadow = true;
  resultMesh.receiveShadow = true;

  objectGroup.remove(meshA, meshB);
  objectGroup.add(resultMesh);

  state.objects = state.objects.filter((o) => o.id !== bool.firstId && o.id !== hitId);
  state.objects.push({
    id: resultId,
    type: "box",
    name: `Boolean ${bool.operation}`,
    color: "#4da3ff",
    material: "paintWarm",
    position: { x: round(resultMesh.position.x), y: round(resultMesh.position.y), z: round(resultMesh.position.z) },
    scale: { x: 1, y: 1, z: 1 },
    rotation: { x: 0, y: 0, z: 0 },
  });

  bool.active = false;
  bool.firstId = null;
  document.querySelector("#booleanBtn").classList.remove("active");
  document.querySelector("#booleanStatus").classList.add("hidden");
  selectObject(resultId);
  updateStatusBar();
}

/* ---- Landscape ---- */
function hash2D(x, z) {
  let h = x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) & 2147483647) / 2147483648;
}

function smoothNoise(x, z, scale) {
  const sx = x / scale;
  const sz = z / scale;
  const ix = Math.floor(sx);
  const iz = Math.floor(sz);
  const fx = sx - ix;
  const fz = sz - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const v00 = hash2D(ix, iz);
  const v10 = hash2D(ix + 1, iz);
  const v01 = hash2D(ix, iz + 1);
  const v11 = hash2D(ix + 1, iz + 1);
  return v00 + (v10 - v00) * ux + (v01 - v00) * uz + (v11 - v10 - v01 + v00) * ux * uz;
}

function fbmNoise(x, z, octaves = 4) {
  let value = 0;
  let amplitude = 1;
  let frequency = 0.5;
  let maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise(x * frequency, z * frequency, 2);
    maxVal += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxVal;
}

function createTerrain() {
  const ls = state.landscape;
  ls.size = numberValue("terrainSize", ls.size);
  ls.resolution = numberValue("terrainRes", ls.resolution);

  landscapeGroup.clear();
  const size = ls.size;
  const res = Math.max(4, Math.min(256, ls.resolution));
  const geo = new THREE.PlaneGeometry(size, size, res, res);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const half = size / 2;
  const heightScale = 1.2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = (fbmNoise(x + half, z + half, 4) * 2 - 1) * heightScale;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x5a8a4a,
    roughness: 0.9,
    metalness: 0,
    flatShading: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.userData.isTerrain = true;
  landscapeGroup.add(mesh);
  ls.mesh = mesh;

  const brushRing = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 32),
    new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthTest: false })
  );
  brushRing.rotation.x = -Math.PI / 2;
  brushRing.visible = false;
  brushRing.userData.isBrush = true;
  landscapeGroup.add(brushRing);
  document.querySelectorAll("[data-land-mat]").forEach((btn) => btn.classList.remove("active"));
  const grassBtn = document.querySelector('[data-land-mat="grass"]');
  if (grassBtn) grassBtn.classList.add("active");
  updateStatusBar();
}

const landscapeMaterials = {
  grass: { color: 0x5a8a4a, roughness: 0.9 },
  dirt: { color: 0x8B6B4A, roughness: 0.95 },
  rock: { color: 0x6a6a6a, roughness: 0.85, metalness: 0.1 },
  snow: { color: 0xdde0e6, roughness: 0.7 },
  sand: { color: 0xc4b896, roughness: 0.92 },
  brick: { color: 0x8a4a3a, roughness: 0.88 },
  stone: { color: 0x7a7a7a, roughness: 0.82, metalness: 0.05 },
};

function applyLandscapeMaterial(key) {
  const ls = state.landscape;
  if (!ls.mesh) return;
  const def = landscapeMaterials[key];
  if (!def) return;
  ls.mesh.material.color.setHex(def.color);
  ls.mesh.material.roughness = def.roughness;
  if (def.metalness != null) ls.mesh.material.metalness = def.metalness;
  ls.mesh.material.needsUpdate = true;
  document.querySelectorAll("[data-land-mat]").forEach((btn) => btn.classList.remove("active"));
  const btn = document.querySelector(`[data-land-mat="${key}"]`);
  if (btn) btn.classList.add("active");
  updateStatusBar();
}

function addTreesToTerrain() {
  const ls = state.landscape;
  if (!ls.mesh) { alert("Cree d'abord un terrain"); return; }
  pushUndo();
  const half = ls.size / 2 - 1;
  const count = 6 + Math.floor(Math.random() * 5);
  const treeTypes = ["tree", "plant", "flowerPot"];
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * half * 2;
    const z = (Math.random() - 0.5) * half * 2;
    const type = treeTypes[Math.floor(Math.random() * treeTypes.length)];
    const id = crypto.randomUUID();
    const spec = defaultSpec(type, id);
    spec.position = { x, y: 0, z };
    const scale = 0.5 + Math.random() * 0.8;
    spec.scale = { x: scale, y: scale, z: scale };
    if (type === "plant") spec.scale = { x: 0.4, y: 0.6, z: 0.4 };
    if (type === "flowerPot") spec.scale = { x: 0.25, y: 0.35, z: 0.25 };
    const mesh = createMesh(spec);
    const y = getTerrainHeight(x, z);
    mesh.position.set(x, y, z);
    objectGroup.add(mesh);
    state.objects.push(spec);
  }
  renderObjectList();
  updateStatusBar();
}

function getTerrainHeight(x, z) {
  const ls = state.landscape;
  if (!ls.mesh) return 0;
  const geo = ls.mesh.geometry;
  const pos = geo.attributes.position;
  const half = ls.size / 2;
  let closest = 0;
  let minDist = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < minDist) { minDist = d; closest = pos.getY(i); }
  }
  return closest;
}

function getTerrainHit(event) {
  const ls = state.landscape;
  if (!ls.mesh) return null;
  const bounds = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(ls.mesh);
  return hits.length ? hits[0] : null;
}

function startSculpt(event) {
  if (event.button !== 0) return;
  const ls = state.landscape;
  if (!ls.mesh) return;
  const hit = getTerrainHit(event);
  if (!hit) return;
  ls.sculpting = true;
  renderer.domElement.setPointerCapture(event.pointerId);
  applyBrush(hit);
}

function moveSculpt(event) {
  const ls = state.landscape;
  const brush = landscapeGroup.getObjectById(landscapeGroup.children.find((c) => c.userData.isBrush)?.id);
  if (!ls.mesh || !brush) return;
  const hit = getTerrainHit(event);

  if (hit) {
    brush.position.copy(hit.point);
    brush.position.y += 0.02;
    const size = numberValue("brushSize", ls.brushSize);
    brush.scale.set(size / 2, size / 2, size / 2);
    brush.visible = true;
  } else {
    brush.visible = false;
  }

  if (ls.sculpting && hit) {
    applyBrush(hit);
  }
}

function endSculpt(event) {
  const ls = state.landscape;
  if (!ls.sculpting) return;
  ls.sculpting = false;
  renderer.domElement.releasePointerCapture(event.pointerId);
}

function applyBrush(hit) {
  const ls = state.landscape;
  const mesh = ls.mesh;
  if (!mesh) return;
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const size = numberValue("brushSize", ls.brushSize);
  const strength = numberValue("brushStrength", ls.brushStrength);
  const tool = ls.tool;
  const center = hit.point;
  const radius = size / 2;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const dx = vx - center.x;
    const dz = vz - center.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= radius) continue;
    const falloff = 1 - (dist / radius);
    const currentY = pos.getY(i);

    let delta = 0;
    switch (tool) {
      case "raise":
        delta = strength * falloff;
        break;
      case "lower":
        delta = -strength * falloff;
        break;
      case "smooth": {
        let avg = 0;
        let count = 0;
        for (let j = 0; j < pos.count; j++) {
          const nx = pos.getX(j);
          const nz = pos.getZ(j);
          const nd = Math.sqrt((nx - vx) ** 2 + (nz - vz) ** 2);
          if (nd < size / 8 && j !== i) {
            avg += pos.getY(j);
            count++;
          }
        }
        if (count) delta = (avg / count - currentY) * strength;
        break;
      }
      case "flatten":
        delta = (center.y - currentY) * strength;
        break;
    }
    pos.setY(i, currentY + delta);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.attributes.position.needsUpdate = true;
  mesh.geometry = geo;
}

function setSculptTool(tool) {
  state.landscape.tool = tool;
  document.querySelectorAll("[data-sculpt]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sculpt === tool);
  });
  updateStatusBar();
}

/* ---- Connect ---- */
function connectObjects() {
  pushUndo();
  const allMeshes = [];
  objectGroup.children.forEach((child) => {
    if (child.isMesh) {
      allMeshes.push(child);
    } else if (child.isGroup) {
      child.traverse((c) => { if (c.isMesh) allMeshes.push(c); });
    }
  });
  if (allMeshes.length < 2) return;

  const geoms = allMeshes.map((m) => {
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    return g;
  });

  let merged;
  try {
    merged = mergeGeometries(geoms, false);
  } catch {
    return;
  }

  const mat = allMeshes[0].material.clone();
  const newMesh = new THREE.Mesh(merged, mat);
  const resultId = crypto.randomUUID();
  newMesh.userData.id = resultId;
  newMesh.userData.type = "box";
  newMesh.position.set(0, 0, 0);
  newMesh.castShadow = true;
  newMesh.receiveShadow = true;

  const connectedIds = new Set();
  objectGroup.children.forEach((child) => {
    const id = child.userData.id;
    if (id) connectedIds.add(id);
  });

  objectGroup.clear();
  objectGroup.add(newMesh);

  state.objects = state.objects.filter((o) => !connectedIds.has(o.id));
  state.objects.push({
    id: resultId,
    type: "box",
    name: "Connect",
    color: "#4da3ff",
    material: "paintWarm",
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: { x: 0, y: 0, z: 0 },
  });

  selectObject(resultId);
}

/* ---- Deform ---- */
function toggleDeform() {
  const def = state.deform;
  if (!def.active) {
    if (!primaryId()) return;
    pushUndo();
    def.active = true;
    def.type = "bend";
    document.querySelector("#deformBtn").classList.add("active");
    applyDeformToSelected(def.type);
  } else {
    const types = ["bend", "twist", "taper", null];
    const idx = types.indexOf(def.type);
    const next = types[(idx + 1) % types.length];
    if (!next) {
      def.active = false;
      document.querySelector("#deformBtn").classList.remove("active");
      applyDeformToSelected(null);
    } else {
      pushUndo();
      def.type = next;
      applyDeformToSelected(def.type);
    }
  }
  updateStatusBar();
}

function applyDeformToSelected(type) {
  const id = primaryId();
  if (!id) return;
  const mesh = findMesh(id);
  if (!mesh) return;

  let target = mesh;
  if (!mesh.isMesh) {
    mesh.traverse((c) => { if (c.isMesh && target === mesh) target = c; });
  }
  if (!target.isMesh) return;

  if (type === null) {
    const backup = state.deform.geoBackup;
    if (backup) {
      const pos = target.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, backup[i * 3], backup[i * 3 + 1], backup[i * 3 + 2]);
      }
      pos.needsUpdate = true;
      target.geometry.computeVertexNormals();
    }
    return;
  }

  if (!state.deform.geoBackup) {
    const pos = target.geometry.attributes.position;
    const backup = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      backup[i * 3] = pos.getX(i);
      backup[i * 3 + 1] = pos.getY(i);
      backup[i * 3 + 2] = pos.getZ(i);
    }
    state.deform.geoBackup = backup;
  }

  const geo = target.geometry.clone();
  const pos = geo.attributes.position;
  const strength = state.deform.strength;

  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const height = Math.max(maxY - minY, 0.01);

  const center = new THREE.Vector3();
  geo.computeBoundingBox();
  geo.boundingBox.getCenter(center);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (y - minY) / height;

    let nx = x, ny = y, nz = z;

    switch (type) {
      case "bend": {
        const angle = strength * Math.PI * (t - 0.5);
        const cos_a = Math.cos(angle);
        const sin_a = Math.sin(angle);
        nx = center.x + (x - center.x) * cos_a - (z - center.z) * sin_a;
        nz = center.z + (x - center.x) * sin_a + (z - center.z) * cos_a;
        ny = y;
        break;
      }
      case "twist": {
        const angle = strength * Math.PI * 2 * (t - 0.5);
        const cos_a = Math.cos(angle);
        const sin_a = Math.sin(angle);
        nx = center.x + (x - center.x) * cos_a - (z - center.z) * sin_a;
        nz = center.z + (x - center.x) * sin_a + (z - center.z) * cos_a;
        ny = y;
        break;
      }
      case "taper": {
        const scale = 1 + strength * (t - 0.5);
        nx = center.x + (x - center.x) * scale;
        nz = center.z + (z - center.z) * scale;
        ny = y;
        break;
      }
    }

    pos.setXYZ(i, nx, ny, nz);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  target.geometry = geo;
}

/* ============================================================
   Mesures et cotes 3D
   ============================================================ */

function toggleMeasure() {
  measureActive = !measureActive;
  const btn = document.querySelector("#measureBtn");
  if (btn) btn.classList.toggle("active", measureActive);
  const panel = document.querySelector("#measurePanel");
  if (panel) panel.classList.toggle("hidden", !measureActive);
  if (!measureActive) {
    measurePoints = [];
    renderMeasurePreview();
  }
  updateStatusBar();
}

function raycastWorldPoint(event, includeRooms = false) {
  const bounds = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const targets = includeRooms ? [objectGroup, roomGroup, landscapeGroup] : [objectGroup];
  const hits = raycaster.intersectObjects(targets, true);
  if (hits.length) return hits[0].point.clone();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const fallback = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(ground, fallback)) return fallback;
  return null;
}

function initMeasureGroup() {
  if (measureGroup) return;
  measureGroup = new THREE.Group();
  measureGroup.name = "_measurements";
  scene.add(measureGroup);
}

function onMeasurePointer(event) {
  if (!measureActive || event.button !== 0) return;
  const tag = event.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
  const point = raycastWorldPoint(event, true);
  if (!point) return;
  measurePoints.push(point);
  if (measurePoints.length === 2) {
    commitMeasurement(measurePoints[0], measurePoints[1]);
    measurePoints = [];
  }
  renderMeasurePreview();
}

function commitMeasurement(p1, p2) {
  initMeasureGroup();
  const group = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x35b49c });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), lineMat);
  group.add(line);
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0x35b49c });
  for (const p of [p1, p2]) {
    const sph = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), sphereMat);
    sph.position.copy(p);
    group.add(sph);
  }
  const dist = p1.distanceTo(p2);
  const hDelta = Math.abs(p1.y - p2.y);
  const horizontal = new THREE.Vector3(p1.x, 0, p1.z).distanceTo(new THREE.Vector3(p2.x, 0, p2.z));
  const mid = p1.clone().add(p2).multiplyScalar(0.5);
  const sprite = makeMeasureSprite(`d = ${dist.toFixed(2)} m\nH ${horizontal.toFixed(2)} m · h ${hDelta.toFixed(2)} m`);
  sprite.position.set(mid.x, mid.y + 0.4, mid.z);
  group.add(sprite);
  group.userData.isMeasure = true;
  measureGroup.add(group);
  MEASURE_LIST.push({ p1, p2, group });
  renderMeasurementsPanel();
}

function makeMeasureSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  const lines = text.split("\n");
  ctx.fillStyle = "rgba(10,14,16,0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#35b49c";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
  ctx.fillStyle = "#d9ece6";
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, 26 + i * 36));
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.15, 0.25, 1);
  return sprite;
}

function renderMeasurePreview() {
  if (!measureGroup) return;
  measureGroup.children.filter((c) => c.userData.preview).forEach((c) => measureGroup.remove(c));
  if (measurePoints.length === 1) {
    const sph = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0x35b49c }));
    sph.position.copy(measurePoints[0]);
    sph.userData.preview = true;
    measureGroup.add(sph);
  }
}

function renderMeasurementsPanel() {
  const el = document.querySelector("#measureList");
  if (!el) return;
  el.innerHTML = MEASURE_LIST.map((m, i) =>
    `<button class="measure-item" data-measure-idx="${i}">Mesure ${i + 1} · ${m.p1.distanceTo(m.p2).toFixed(2)} m</button>`
  ).join("");
  el.querySelectorAll(".measure-item").forEach((b) => {
    b.addEventListener("click", () => removeMeasurement(Number(b.dataset.measureIdx)));
  });
}

function removeMeasurement(idx) {
  const m = MEASURE_LIST[idx];
  if (!m) return;
  measureGroup.remove(m.group);
  m.group.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material?.map) c.material.map.dispose();
    if (c.material) c.material.dispose();
  });
  MEASURE_LIST.splice(idx, 1);
  renderMeasurementsPanel();
}

function clearMeasurements() {
  while (MEASURE_LIST.length) removeMeasurement(0);
}

/* ============================================================
   Physique simple : chute au sol + collision avec les murs
   ============================================================ */

function dropSelectedToFloor() {
  if (!state.selectedIds.length) { setStatusInfo("Aucun objet sélectionné"); return; }
  pushUndo();
  state.selectedIds.forEach((id) => {
    const mesh = findMesh(id);
    if (!mesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    const delta = -box.min.y;
    if (Math.abs(delta) > 0.001) {
      mesh.position.y += delta;
      syncObjectFromMesh(mesh);
    }
  });
  renderInspector();
  renderObjectList();
  setStatusInfo("Objets déposés au sol");
}

function getWallBoxes(excludeId) {
  const boxes = [];
  roomGroup.children.forEach((child) => {
    if (!child.isMesh) return;
    const b = new THREE.Box3().setFromObject(child);
    if (b.max.y > 0.02) boxes.push(b);
  });
  objectGroup.children.forEach((child) => {
    if (!child.userData.id || child.userData.id === excludeId) return;
    const t = child.userData.type;
    if (t !== "wall" && t !== "window" && t !== "door") return;
    boxes.push(new THREE.Box3().setFromObject(child));
  });
  return boxes;
}

function collisionClamp(mesh) {
  if (!state.physics.collision) return;
  const box = new THREE.Box3().setFromObject(mesh);
  const walls = getWallBoxes(mesh.userData.id);
  for (const wall of walls) {
    if (!box.intersectsBox(wall)) continue;
    const dxMin = wall.min.x - box.max.x;
    const dxMax = wall.max.x - box.min.x;
    const dzMin = wall.min.z - box.max.z;
    const dzMax = wall.max.z - box.min.z;
    const pushX = Math.abs(dxMin) < Math.abs(dxMax) ? dxMin : dxMax;
    const pushZ = Math.abs(dzMin) < Math.abs(dzMax) ? dzMin : dzMax;
    if (Math.abs(pushX) < Math.abs(pushZ)) mesh.position.x += pushX;
    else mesh.position.z += pushZ;
  }
}

function toggleCollision() {
  state.physics.collision = !state.physics.collision;
  const btn = document.querySelector("#collisionBtn");
  if (btn) btn.classList.toggle("active", state.physics.collision);
  updateStatusBar();
}

/* ============================================================
   Édition sous-objet (Vertex / Edge / Face)
   ============================================================ */

function initSubHelpers() {
  if (subHelperGroup) return;
  subHelperGroup = new THREE.Group();
  subHelperGroup.name = "_subHelpers";
  scene.add(subHelperGroup);
  subProxy = new THREE.Object3D();
  subProxy.userData.subMarker = true;
  scene.add(subProxy);
}

function ensureIndexedGeometry(geo) {
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

function enterSubMode(level) {
  initSubHelpers();
  exitSubObjectMode(false);
  const mesh = getSelectedMesh();
  if (!mesh) { setStatusInfo("Sélectionne d'abord un objet 3D"); return; }
  mesh.geometry = ensureIndexedGeometry(mesh.geometry);
  subData = buildSubData(mesh, level);
  rebuildSubMarkers();
  setStatusInfo(`Mode ${level}: clique sur le maillage pour sélectionner, puis déplace avec W`);
  transformControls.setTranslationSnap(null);
}

function buildSubData(mesh, mode) {
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
  tris.forEach((t, fi) => {
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

function featureWorldPosition() {
  if (!subData || subData.selected == null) return null;
  const { mesh, unique, tris, edges, selected, selType } = subData;
  const local = new THREE.Vector3();
  if (selType === "vertex") local.copy(unique[selected].pos);
  else if (selType === "edge") {
    const ed = edges[selected];
    local.addVectors(unique[ed.a].pos, unique[ed.b].pos).multiplyScalar(0.5);
  } else {
    const tri = tris[selected];
    tri.forEach(u => local.add(unique[u].pos));
    local.divideScalar(3);
  }
  return mesh.localToWorld(local);
}

function attachSubProxy() {
  if (!subData || subData.selected == null) return;
  const worldPos = featureWorldPosition();
  if (!worldPos) return;
  subProxy.position.copy(worldPos);
  subProxyStart = worldPos.clone();
  transformControls.attach(subProxy);
  transformControls.mode = "translate";
}

function distPointToSegment(p, a, b) {
  const ab = b.clone().sub(a);
  const ap = p.clone().sub(a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / (ab.lengthSq() || 1)));
  return p.distanceTo(a.clone().add(ab.multiplyScalar(t)));
}

function pickSubFeature(event) {
  if (!subData) return;
  if (transformControls.object?.userData.subMarker) return; // gizmo en cours sur une feature
  const mesh = subData.mesh;
  if (!mesh.visible) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(mesh, false);
  if (!hits.length) return;
  const hit = hits[0];
  const lp = mesh.worldToLocal(hit.point.clone());
  const faceIndex = hit.faceIndex;
  const { unique, tris, pos } = subData;
  const mode = subData.mode;
  if (mode === "face") {
    subData.selected = Math.floor(faceIndex / 3);
    subData.selType = "face";
  } else if (mode === "vertex") {
    const tri = tris[Math.floor(faceIndex / 3)];
    let best = tri[0], bd = Infinity;
    for (const u of tri) {
      const d = unique[u].pos.distanceTo(lp);
      if (d < bd) { bd = d; best = u; }
    }
    subData.selected = best;
    subData.selType = "vertex";
  } else {
    const tri = tris[Math.floor(faceIndex / 3)];
    let bestKey = null, bd = Infinity;
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const rec = subData.edges[subData.edgeByKey.get(key)];
      const d = distPointToSegment(lp, unique[rec.a].pos, unique[rec.b].pos);
      if (d < bd) { bd = d; bestKey = key; }
    }
    subData.selected = subData.edgeByKey.get(bestKey);
    subData.selType = "edge";
  }
  attachSubProxy();
  rebuildSubMarkers();
}

function applySubObjectDrag() {
  if (!subData || subData.selected == null || !subProxyStart) return;
  const { mesh, unique, tris, edges, selected, selType } = subData;
  const worldPos = subProxy.position;
  const deltaWorld = worldPos.clone().sub(subProxyStart);
  const a = mesh.worldToLocal(deltaWorld.clone());
  const b = mesh.worldToLocal(new THREE.Vector3(0, 0, 0));
  const deltaLocal = a.sub(b);
  subProxyStart.copy(worldPos);
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
  rebuildSubMarkers();
}

function rebuildSubMarkers() {
  if (!subHelperGroup || !subData) return;
  const { mesh, mode, unique, tris, edges, selected } = subData;
  subHelperGroup.clear();
  if (unique.length > 4000) return;
  const dot = new THREE.MeshBasicMaterial({ color: 0x35b49c, transparent: true, opacity: 0.9 });
  const selDot = new THREE.MeshBasicMaterial({ color: 0xffb74d });
  const world = new THREE.Vector3();
  const addDot = (localPos, sel, r) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), sel ? selDot : dot);
    s.position.copy(mesh.localToWorld(localPos.clone()));
    s.userData.subMarker = true;
    subHelperGroup.add(s);
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
      t.forEach(u => c.add(unique[u].pos));
      c.divideScalar(3);
      addDot(c, i === selected, i === selected ? 0.16 : 0.07);
    });
  }
}

function exitSubObjectMode(clearButtons = true) {
  if (subHelperGroup) subHelperGroup.clear();
  if (transformControls.object?.userData.subMarker) transformControls.detach();
  subData = null;
  subProxyStart = null;
  if (clearButtons && state.subObjectLevel !== "object") {
    state.subObjectLevel = "object";
    document.querySelectorAll("[data-subobj]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.subobj === "object");
    });
  }
}

function extrudeSelectedFace(dist = 0.3) {
  if (!subData || subData.selType !== "face" || subData.selected == null) return false;
  const { mesh, unique, tris, selected } = subData;
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
  pushUndo();
  subData = buildSubData(mesh, "face");
  subData.selected = oldTris;
  subData.selType = "face";
  attachSubProxy();
  rebuildSubMarkers();
  return true;
}

/* ============================================================
   Bevel réel (chanfrein) sur maillage fermé
   ============================================================ */

function faceNormalArr(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let nx = ab[1] * ac[2] - ab[2] * ac[1];
  let ny = ab[2] * ac[0] - ab[0] * ac[2];
  let nz = ab[0] * ac[1] - ab[1] * ac[0];
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function bevelGeometry(srcGeo, amount) {
  if (!srcGeo.index) srcGeo.setIndex(Array.from({ length: srcGeo.attributes.position.count }, (_, i) => i));
  const pos = srcGeo.attributes.position;
  const srcIdx = srcGeo.index.array;
  const uidOf = new Map();
  const unique = [];
  const order = [];
  const p = new Array(3);
  for (let i = 0; i < pos.count; i++) {
    p[0] = pos.getX(i); p[1] = pos.getY(i); p[2] = pos.getZ(i);
    const k = `${p[0].toFixed(6)},${p[1].toFixed(6)},${p[2].toFixed(6)}`;
    if (uidOf.has(k)) order.push(uidOf.get(k));
    else { uidOf.set(k, unique.length); unique.push([p[0], p[1], p[2]]); order.push(unique.length - 1); }
  }
  const tris = [];
  for (let i = 0; i < srcIdx.length; i += 3) {
    tris.push([order[srcIdx[i]], order[srcIdx[i + 1]], order[srcIdx[i + 2]]]);
  }
  const fnorm = tris.map(t => faceNormalArr(unique[t[0]], unique[t[1]], unique[t[2]]));
  const centroid = tris.map(t => [
    (unique[t[0]][0] + unique[t[1]][0] + unique[t[2]][0]) / 3,
    (unique[t[0]][1] + unique[t[1]][1] + unique[t[2]][1]) / 3,
    (unique[t[0]][2] + unique[t[1]][2] + unique[t[2]][2]) / 3,
  ]);
  const edgeMap = new Map();
  const incident = unique.map(() => []);
  tris.forEach((t, fi) => {
    for (let e = 0; e < 3; e++) {
      incident[t[e]].push(fi);
      const a = t[e], b = t[(e + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { a, b, tris: [] });
      edgeMap.get(key).tris.push(fi);
    }
  });
  for (const ed of edgeMap.values()) if (ed.tris.length !== 2) return null; // non manifold
  const parent = tris.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { parent[find(i)] = find(j); };
  edgeMap.forEach(ed => {
    const f1 = ed.tris[0], f2 = ed.tris[1];
    const n1 = fnorm[f1], n2 = fnorm[f2];
    if (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] > 0.9999) union(f1, f2);
  });
  const groups = new Map();
  const groupOf = tris.map((_, fi) => {
    const r = find(fi);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(fi);
    return r;
  });
  const k = Math.max(0.03, Math.min(0.4, amount));
  // point d'insertion d'un sommet dans un groupe de faces coplanaires
  const cutPt = new Map();
  const ins = (u, g) => {
    const key = `${u}:${g}`;
    if (cutPt.has(key)) return cutPt.get(key);
    const uu = unique[u];
    let ax = 0, ay = 0, az = 0, cnt = 0;
    groups.get(g).forEach(fi => {
      if (tris[fi].indexOf(u) < 0) return;
      ax += centroid[fi][0]; ay += centroid[fi][1]; az += centroid[fi][2]; cnt++;
    });
    const pt = [uu[0] + (ax / cnt - uu[0]) * k, uu[1] + (ay / cnt - uu[1]) * k, uu[2] + (az / cnt - uu[2]) * k];
    cutPt.set(key, pt);
    return pt;
  };
  const outPts = [];
  const outTris = [];
  const outIdx = new Map();
  const addVec = a3 => {
    const idx = outPts.length / 3;
    outPts.push(a3[0], a3[1], a3[2]);
    return idx;
  };
  // chaque point de coupe est partagé entre bouchons, bandes et coins (maillage fermé)
  const vIdx = (u, g) => {
    const key = `${u}:${g}`;
    if (outIdx.has(key)) return outIdx.get(key);
    const idx = addVec(ins(u, g));
    outIdx.set(key, idx);
    return idx;
  };
  // bouchons de faces (conservent l'orientation d'origine)
  tris.forEach((t, ft) => {
    const g = groupOf[ft];
    const a = vIdx(t[0], g), b = vIdx(t[1], g), c = vIdx(t[2], g);
    outTris.push(a, b, c);
  });
  // bandes de chanfrein entre faces voisines non coplanaires
  edgeMap.forEach(ed => {
    const f1 = ed.tris[0], f2 = ed.tris[1];
    const g1 = groupOf[f1], g2 = groupOf[f2];
    if (g1 === g2) return;
    const A = vIdx(ed.a, g1), B = vIdx(ed.b, g1), C = vIdx(ed.b, g2), D = vIdx(ed.a, g2);
    const pA = ins(ed.a, g1), pB = ins(ed.b, g1), pD = ins(ed.a, g2);
    const dx = (pB[0] - pA[0]) * (pD[1] - pA[1]) - (pB[1] - pA[1]) * (pD[0] - pA[0]);
    const dy = (pB[2] - pA[2]) * (pD[0] - pA[0]) - (pB[0] - pA[0]) * (pD[2] - pA[2]);
    const dz = (pB[0] - pA[0]) * (pD[2] - pA[2]) - (pB[2] - pA[2]) * (pD[0] - pA[0]);
    const n1 = fnorm[f1], n2 = fnorm[f2];
    const ndot = dx * (n1[0] + n2[0]) + dy * (n1[1] + n2[1]) + dz * (n1[2] + n2[2]);
    if (ndot >= 0) outTris.push(A, B, D, B, C, D);
    else outTris.push(A, D, B, B, D, C);
  });
  function perp(v) {
    let rx = 0, ry = 0, rz = 0;
    if (Math.abs(v[0]) < 0.9) { rx = 1; } else { ry = 1; }
    const px = ry * v[2] - rz * v[1];
    const py = rz * v[0] - rx * v[2];
    const pz = rx * v[1] - ry * v[0];
    const l = Math.hypot(px, py, pz) || 1;
    return [px / l, py / l, pz / l];
  }
  // fermeture des coins (cône des faces incidentes)
  unique.forEach((u, i) => {
    const fs = incident[i];
    if (fs.length < 3) return;
    let dx = 0, dy = 0, dz = 0;
    fs.forEach(f => { dx += fnorm[f][0]; dy += fnorm[f][1]; dz += fnorm[f][2]; });
    const dl = Math.hypot(dx, dy, dz) || 1;
    const d3 = [dx / dl, dy / dl, dz / dl];
    const tA = perp(d3);
    const tB = [d3[1] * tA[2] - d3[2] * tA[1], d3[2] * tA[0] - d3[0] * tA[2], d3[0] * tA[1] - d3[1] * tA[0]];
    const uu = unique[i];
    const seen = new Set();
    const gs = [];
    fs.forEach(f => {
      const g = groupOf[f];
      if (seen.has(g)) return;
      seen.add(g);
      gs.push(g);
    });
    if (gs.length < 3) return;
    const pairs = gs.map(g => ({ g, pt: ins(i, g) }));
    pairs.sort((m, n) => {
      const v1 = [m.pt[0] - uu[0], m.pt[1] - uu[1], m.pt[2] - uu[2]];
      const v2 = [n.pt[0] - uu[0], n.pt[1] - uu[1], n.pt[2] - uu[2]];
      const a1 = v1[0] * tA[0] + v1[1] * tA[1] + v1[2] * tA[2];
      const b1 = v1[0] * tB[0] + v1[1] * tB[1] + v1[2] * tB[2];
      const a2 = v2[0] * tA[0] + v2[1] * tA[1] + v2[2] * tA[2];
      const b2 = v2[0] * tB[0] + v2[1] * tB[1] + v2[2] * tB[2];
      return Math.atan2(b1, a1) - Math.atan2(b2, a2);
    });
    const n0 = faceNormalArr(pairs[0].pt, pairs[1].pt, pairs[2].pt);
    const outward = n0[0] * d3[0] + n0[1] * d3[1] + n0[2] * d3[2] >= 0;
    const idxs = pairs.map(p => vIdx(i, p.g));
    for (let oi = 1; oi < idxs.length - 1; oi++) {
      if (outward) outTris.push(idxs[0], idxs[oi], idxs[oi + 1]);
      else outTris.push(idxs[0], idxs[oi + 1], idxs[oi]);
    }
  });
  // passe finale : normaliser l'orientation (extérieur) de chaque triangle
  let ccx = 0, ccy = 0, ccz = 0;
  for (let oi = 0; oi < outPts.length; oi += 3) { ccx += outPts[oi]; ccy += outPts[oi + 1]; ccz += outPts[oi + 2]; }
  const ccn = outPts.length / 3;
  ccx /= ccn; ccy /= ccn; ccz /= ccn;
  for (let oi = 0; oi < outTris.length; oi += 3) {
    const a = outTris[oi], b = outTris[oi + 1], c = outTris[oi + 2];
    const p0 = [outPts[a * 3] - ccx, outPts[a * 3 + 1] - ccy, outPts[a * 3 + 2] - ccz];
    const p1 = [outPts[b * 3] - ccx, outPts[b * 3 + 1] - ccy, outPts[b * 3 + 2] - ccz];
    const p2 = [outPts[c * 3] - ccx, outPts[c * 3 + 1] - ccy, outPts[c * 3 + 2] - ccz];
    const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const nx = u[1] * v[2] - u[2] * v[1];
    const ny = u[2] * v[0] - u[0] * v[2];
    const nz = u[0] * v[1] - u[1] * v[0];
    const mx = (p0[0] + p1[0] + p2[0]) / 3, my = (p0[1] + p1[1] + p2[1]) / 3, mz = (p0[2] + p1[2] + p2[2]) / 3;
    if (nx * mx + ny * my + nz * mz < 0) {
      outTris[oi + 1] = c;
      outTris[oi + 2] = b;
    }
  }
  const outGeo = new THREE.BufferGeometry();
  outGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(outPts), 3));
  outGeo.setIndex(outTris);
  outGeo.computeVertexNormals();
  return outGeo;
}

/* ---- Undo / Redo ---- */
function pushUndo() {
  const u = state.undo;
  const snapshot = {
    objects: structuredClone(state.objects),
    clusters: structuredClone(state.clusters),
    room: structuredClone(state.room),
    style: state.style,
    plan: structuredClone(state.plan),
    draw: { tool: null, active: false, shapes: structuredClone(state.draw.shapes), current: null, scale: state.draw.scale },
    cine: cineData(),
  };

  if (u.index < u.history.length - 1) {
    u.history = u.history.slice(0, u.index + 1);
  }
  u.history.push(snapshot);
  if (u.history.length > u.max) u.history.shift();
  u.index = u.history.length - 1;
}

function undo() {
  const u = state.undo;
  if (u.index <= 0) return;
  u.index--;
  restoreSnapshot(u.history[u.index]);
}

function redo() {
  const u = state.undo;
  if (u.index >= u.history.length - 1) return;
  u.index++;
  restoreSnapshot(u.history[u.index]);
}

function restoreSnapshot(snapshot) {
  exitSubObjectMode();
  objectGroup.clear();
  transformControls.detach();
  state.selectedIds = [];

  state.objects = structuredClone(snapshot.objects);
  state.clusters = structuredClone(snapshot.clusters || []);
  state.room = structuredClone(snapshot.room);
  state.style = snapshot.style;
  state.plan = structuredClone(snapshot.plan);
  state.draw.shapes = structuredClone(snapshot.draw.shapes);
  state.draw.current = null;
  restoreCineData(snapshot.cine);

  buildRoom();
  state.objects.forEach((spec) => {
    const mesh = createMesh(spec);
    objectGroup.add(mesh);
  });
  state.clusters.forEach((cluster) => createClusterAnchor(cluster));

  document.querySelector("#roomWidth").value = state.room.width;
  document.querySelector("#roomDepth").value = state.room.depth;
  document.querySelector("#roomHeight").value = state.room.height;
  document.querySelector("#stylePreset").value = state.style;
  renderObjectList();
  renderInspector();
  renderDraw();
  updateProjectUI();
}

function focusCamera() {
  camera.position.set(6, 5, 7);
  controls.target.set(0, 1.3, 0);
  controls.update();
}

/* ---- AI Text-to-3D Generator ---- */
function openAIGenerator() {
  document.querySelector("#aiModal").classList.remove("hidden");
  const savedKey = localStorage.getItem("hf_api_key") || "";
  document.querySelector("#aiApiKey").value = savedKey;
  document.querySelector("#aiPrompt").focus();
  document.querySelector("#aiProgress").classList.add("hidden");
}

function closeAIGenerator() {
  const key = document.querySelector("#aiApiKey").value.trim();
  if (key) localStorage.setItem("hf_api_key", key);
  document.querySelector("#aiModal").classList.add("hidden");
}

async function generateFromPrompt() {
  const prompt = document.querySelector("#aiPrompt").value.trim();
  if (!prompt) return;
  const apiKey = document.querySelector("#aiApiKey").value.trim();
  const progress = document.querySelector("#aiProgress");
  const status = document.querySelector("#aiStatus");
  progress.classList.remove("hidden");
  status.textContent = "Analyse du texte...";

  const keywords = parsePrompt(prompt);
  status.textContent = `Objet detecte: ${labelFor(keywords.type)}`;

  let blob = null;

  try {
    status.textContent = "Generation via serveur Python...";
    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, apiKey }),
    });
    if (resp.ok) {
      const ct = resp.headers.get("content-type") || "";
      if (ct.includes("json")) {
        const json = await resp.json();
        if (json.error) throw new Error(json.error);
      } else {
        blob = await resp.blob();
      }
    }
  } catch (e) {
    console.warn("Serveur Python:", e);
  }

  if (!blob && apiKey) {
    try {
      status.textContent = "Generation via API Hugging Face...";
      blob = await callHuggingFaceAPI(prompt, apiKey);
    } catch {
      status.textContent = "Erreur API...";
    }
  }

  if (blob && blob.size > 200) {
    status.textContent = "Chargement du modele 3D...";
    const url = URL.createObjectURL(blob);
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
      pushUndo();
      const group = gltf.scene;
      const id = crypto.randomUUID();
      group.userData.id = id;
      group.userData.isImported = true;
      group.position.copy(importPosition());
      objectGroup.add(group);
      state.objects.push({ id, type: "ai", name: prompt.slice(0, 30), position: posFromGroup(group), scale: { x: 1, y: 1, z: 1 }, material: null, color: "#888888" });
      selectObject(id);
      renderObjectList();
      URL.revokeObjectURL(url);
      closeAIGenerator();
      updateStatusBar();
    }, undefined, () => {
      status.textContent = "Erreur de chargement, fallback local...";
      setTimeout(() => callLocalGeneration(keywords, status, progress), 500);
    });
    return;
  }
  status.textContent = "Generation locale...";
  // Try structured JSON project generation
  try {
    status.textContent = "Generation du projet IA...";
    const projResp = await fetch("/api/generate-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, apiKey, style: state.style }),
    });
    if (projResp.ok) {
      const data = await projResp.json();
      const variants = data.variants || (data.spaces ? [data] : []);
      const bp = variants[0];
      if (bp && bp.spaces && bp.spaces.length > 0) {
        status.textContent = `Construction du projet: ${bp.project_name || "Sans titre"}...`;
        const builder = new SceneAIBuilder(scene, objectGroup, roomGroup, state);
        builder.buildProject(bp);
        state.aiLastBlueprint = bp;
        state.aiAllVariants = variants;
        closeAIGenerator();
        updateStatusBar();
        return;
      }
    }
  } catch (e) {
    console.warn("Project generation:", e);
  }

  setTimeout(() => callLocalGeneration(keywords, status, progress), 300);
}

function callLocalGeneration(keywords, statusEl, progress) {
  statusEl.textContent = `Creation d'un ${labelFor(keywords.type)}...`;
  pushUndo();
  addObject(keywords.type);
  const obj = state.objects[state.objects.length - 1];
  if (obj) {
    if (keywords.color) obj.color = keywords.color;
    if (keywords.scale) {
      obj.scale = { x: keywords.scale, y: keywords.scale, z: keywords.scale };
      const mesh = findMesh(obj.id);
      if (mesh) mesh.scale.set(keywords.scale, keywords.scale, keywords.scale);
    }
    if (keywords.material) {
      obj.material = keywords.material;
      const mesh = findMesh(obj.id);
      if (mesh) {
        mesh.traverse((child) => {
          if (child.isMesh) child.material = createMaterial(keywords.material);
        });
      }
    }
    renderObjectList();
    renderInspector();
  }
  closeAIGenerator();
  updateStatusBar();
}

function parsePrompt(text) {
  const lower = text.toLowerCase();
  let type = "box";
  let color = null;
  let material = null;
  let scale = null;

  const typeMap = {
    sofa: ["sofa", "canap", "divan", "couch"],
    armchair: ["armchair", "fauteuil", "bergere"],
    pouf: ["pouf", "ottoman", "tabouret"],
    coffeeTable: ["coffee table", "table basse"],
    diningTable: ["dining table", "table manger", "table de cuisine"],
    diningChair: ["chair", "chaise", "chaise de cuisine"],
    bed: ["bed", "lit"],
    wardrobe: ["wardrobe", "armoire", "placard"],
    nightstand: ["nightstand", "table nuit", "chevet"],
    desk: ["desk", "bureau"],
    bookshelf: ["bookshelf", "bibliotheque", "etagere"],
    officeChair: ["office chair", "chaise bureau", "fauteuil bureau"],
    plant: ["plant", "plante", "potted plant"],
    tree: ["tree", "arbre"],
    flowerPot: ["flower pot", "pot fleur", "vase", "pot"],
    bench: ["bench", "banc"],
    lamp: ["lamp", "lampe", "lampadaire", "luminaire"],
    tvUnit: ["tv unit", "meuble tv"],
    tv: ["tv", "television", "ecran"],
    fridge: ["fridge", "refrigerateur", "frigo"],
    oven: ["oven", "four"],
    washer: ["washer", "machine laver"],
    stairs: ["stairs", "escalier", "marche"],
    toilet: ["toilet", "wc", "toilette"],
    sink: ["sink", "lavabo", "evier"],
    shower: ["shower", "douche"],
    bathtub: ["bathtub", "baignoire", "bain"],
    table: ["table"],
    wall: ["wall", "mur", "cloison"],
    door: ["door", "porte"],
    window: ["window", "fenetre"],
    box: ["box", "cube", "boite", "caisse"],
    sphere: ["sphere", "spherique", "rond", "boule"],
    cone: ["cone", "conique", "pyramide"],
    cylinder: ["cylinder", "cylindre", "tube", "colonne"],
  };

  for (const [key, words] of Object.entries(typeMap)) {
    if (words.some((w) => lower.includes(w))) {
      type = key;
      break;
    }
  }

  if (lower.includes("rouge") || lower.includes("red")) color = "#cc3333";
  else if (lower.includes("bleu") || lower.includes("blue")) color = "#3366cc";
  else if (lower.includes("vert") || lower.includes("green")) color = "#339933";
  else if (lower.includes("noir") || lower.includes("black")) color = "#222222";
  else if (lower.includes("blanc") || lower.includes("white")) color = "#eeeeee";
  else if (lower.includes("jaune") || lower.includes("yellow")) color = "#ddcc33";
  else if (lower.includes("violet") || lower.includes("purple")) color = "#8833aa";
  else if (lower.includes("orange")) color = "#dd6633";
  else if (lower.includes("rose") || lower.includes("pink")) color = "#dd77aa";
  else if (lower.includes("gris") || lower.includes("gray") || lower.includes("grey")) color = "#888888";
  else if (lower.includes("marron") || lower.includes("brown")) color = "#8B5A2B";

  if (lower.includes("bois") || lower.includes("wood") || lower.includes("oak") || lower.includes("chene") || lower.includes("walnut") || lower.includes("noyer")) material = "woodOak";
  else if (lower.includes("metal") || lower.includes("metallique") || lower.includes("acier") || lower.includes("steel")) material = "metal";
  else if (lower.includes("verre") || lower.includes("glass") || lower.includes("vitre") || lower.includes("crystal")) material = "glass";
  else if (lower.includes("tissu") || lower.includes("fabric") || lower.includes("velours") || lower.includes("tissu")) material = "fabric";
  else if (lower.includes("ceramique") || lower.includes("ceramic") || lower.includes("porcelaine")) material = "ceramic";
  else if (lower.includes("beton") || lower.includes("concrete") || lower.includes("brique") || lower.includes("brick")) material = "concrete";

  if (lower.includes("grand") || lower.includes("big") || lower.includes("large") || lower.includes("haut") || lower.includes("tall") || lower.includes("geant")) scale = 1.5;
  else if (lower.includes("petit") || lower.includes("small") || lower.includes("mini") || lower.includes("nain")) scale = 0.6;
  else if (lower.includes("moyen") || lower.includes("medium")) scale = 0.9;

  return { type, color, material, scale };
}

async function callHuggingFaceAPI(prompt, apiKey) {
  const models = [
    "Tencent/Hunyuan3D-2",
    "stabilityai/TripoSR",
  ];
  for (const model of models) {
    try {
      const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: prompt }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.warn(`HF API ${model}: ${response.status} ${text.slice(0, 100)}`);
        continue;
      }
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        const json = await response.json();
        if (json.glb || json.model) {
          const base64 = json.glb || json.model;
          const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          return new Blob([bin], { type: "model/gltf-binary" });
        }
        console.warn(`HF API ${model}: unexpected JSON response`, json);
        continue;
      }
      const blob = await response.blob();
      if (blob.size > 500) return blob;
    } catch (e) {
      console.warn(`HF API ${model}:`, e);
    }
  }
  return null;
}

function importPosition() {
  const existing = state.objects.filter((o) => o.type !== "wall" && o.type !== "door" && o.type !== "window");
  const x = existing.length > 3 ? (Math.random() - 0.5) * 2 : 0;
  const z = existing.length > 3 ? (Math.random() - 0.5) * 2 : 1.5;
  return new THREE.Vector3(x, 0.5, z);
}

function posFromGroup(group) {
  return { x: group.position.x, y: group.position.y, z: group.position.z };
}

function setPlanTool(tool) {
  state.plan.tool = tool;
  document.querySelectorAll("[data-plan-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.planTool === tool);
  });
}

function startPlanSegment(event) {
  if (state.mode !== "plan") return;
  isDrawingPlan = true;
  const point = planPointFromEvent(event);
  draftSegment = { id: crypto.randomUUID(), type: state.plan.tool, a: point, b: point };
  dom.planCanvas.setPointerCapture(event.pointerId);
  renderPlan();
}

function movePlanSegment(event) {
  if (!isDrawingPlan || !draftSegment) return;
  draftSegment.b = planPointFromEvent(event);
  renderPlan();
}

function endPlanSegment(event) {
  if (!isDrawingPlan || !draftSegment) return;
  draftSegment.b = planPointFromEvent(event);
  const length = distance(draftSegment.a, draftSegment.b);
  if (length > 10) {
    state.plan.segments.push(draftSegment);
    dom.planStatus.textContent = `${state.plan.segments.length} element(s) dans le plan`;
  }
  draftSegment = null;
  isDrawingPlan = false;
  renderPlan();
}

function planPointFromEvent(event) {
  const rect = dom.planCanvas.getBoundingClientRect();
  return {
    x: Math.round(event.clientX - rect.left),
    y: Math.round(event.clientY - rect.top),
  };
}

function renderPlan() {
  const canvas = dom.planCanvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  drawPlanGrid(ctx, rect.width, rect.height);
  if (planImage) drawPlanImage(ctx, rect.width, rect.height);
  [...state.plan.segments, draftSegment].filter(Boolean).forEach((segment) => drawPlanSegment(ctx, segment));
}

function drawPlanGrid(ctx, width, height) {
  ctx.fillStyle = "#16191b";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#283036";
  ctx.lineWidth = 1;
  const step = Math.max(20, state.plan.scale / 2);
  for (let x = 0; x <= width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawPlanImage(ctx, width, height) {
  const imageRatio = planImage.width / planImage.height;
  const viewRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (imageRatio > viewRatio) drawHeight = width / imageRatio;
  else drawWidth = height * imageRatio;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  ctx.globalAlpha = 0.45;
  ctx.drawImage(planImage, x, y, drawWidth, drawHeight);
  ctx.globalAlpha = 1;
}

function drawPlanSegment(ctx, segment) {
  const colors = {
    wall: "#f3f1ea",
    door: "#e7c46a",
    window: "#58b9d0",
  };
  ctx.strokeStyle = colors[segment.type] || colors.wall;
  ctx.lineWidth = segment.type === "wall" ? 6 : 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(segment.a.x, segment.a.y);
  ctx.lineTo(segment.b.x, segment.b.y);
  ctx.stroke();

  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = "12px system-ui";
  const mid = midpoint(segment.a, segment.b);
  const metres = distance(segment.a, segment.b) / state.plan.scale;
  ctx.fillText(`${segment.type} ${metres.toFixed(1)}m`, mid.x + 6, mid.y - 6);
}

function buildFromPlan() {
  if (!state.plan.segments.length) {
    dom.planStatus.textContent = "Trace au moins un mur dans le plan.";
    return;
  }
  pushUndo();

  const allPoints = state.plan.segments.flatMap((segment) => [segment.a, segment.b]);
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const width = Math.max(2, (maxX - minX) / state.plan.scale);
  const depth = Math.max(2, (maxY - minY) / state.plan.scale);
  const height = numberValue("roomHeight", state.room.height);

  state.room = { width: round(width + 0.6), depth: round(depth + 0.6), height, fromPlan: true };
  document.querySelector("#roomWidth").value = state.room.width;
  document.querySelector("#roomDepth").value = state.room.depth;
  document.querySelector("#roomHeight").value = state.room.height;

  const generatedIds = new Set(state.objects.filter((object) => object.fromPlan).map((object) => object.id));
  objectGroup.children.filter((mesh) => generatedIds.has(mesh.userData.id)).forEach((mesh) => objectGroup.remove(mesh));
  state.objects = state.objects.filter((object) => !object.fromPlan);

  buildRoom();
  state.plan.segments.forEach((segment) => addPlanSegmentObject(segment, minX, minY, width, depth));
  focusCamera();
  setMode("model");
  dom.planStatus.textContent = `${state.plan.segments.length} element(s) converti(s) en 3D`;
  updatePipeline();
}

function addPlanSegmentObject(segment, minX, minY, width, depth) {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const length = Math.max(0.15, Math.hypot(dx, dy) / state.plan.scale);
  const mid = midpoint(segment.a, segment.b);
  const x = (mid.x - minX) / state.plan.scale - width / 2;
  const z = (mid.y - minY) / state.plan.scale - depth / 2;
  const angle = -Math.atan2(dy, dx);
  const type = segment.type === "wall" ? "wall" : segment.type;
  const height = segment.type === "wall" ? state.room.height : segment.type === "door" ? 2.1 : 1.1;
  const y = segment.type === "window" ? 1.45 : height / 2;
  const thickness = segment.type === "wall" ? 0.14 : 0.08;
  const preset = stylePresets[state.style] || stylePresets.american;
  const material = materialForType(type, preset);
  const spec = {
    id: `plan-${segment.id}`,
    type,
    name: `${labelFor(type)} plan`,
    color: materialLibrary[material]?.color || colorFor(type),
    material,
    position: { x: round(x), y: round(y), z: round(z) },
    rotation: { x: 0, y: round(angle), z: 0 },
    scale: { x: round(length), y: round(height), z: thickness },
    fromPlan: true,
  };
  addObject(type, spec);
}

function clearPlan() {
  state.plan.segments = [];
  draftSegment = null;
  isDrawingPlan = false;
  dom.planStatus.textContent = "Plan vide.";
  updatePipeline();
  renderPlan();
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function updateProjectUI() {
  dom.projectName.value = state.name;
  dom.projectMeta.textContent = ".pix";
}

function updatePipeline() {
  const steps = {
    pano: Boolean(state.panoramaDataUrl),
    plan: state.plan.segments.length > 0 || Boolean(state.plan.imageDataUrl),
    build: state.room.fromPlan || state.objects.length > 0,
    furnish: state.objects.length > 0,
    save: true,
    export: state.objects.length > 0,
  };
  document.querySelectorAll("[data-pipeline]").forEach((item) => {
    const step = item.dataset.pipeline;
    item.classList.toggle("done", steps[step]);
  });
  updateDrawPipeline();
}

function updateDrawPipeline() {
  const steps = {
    draw2d: state.draw.shapes.length > 0,
    extrude: state.objects.length > 0,
    exportDraw: state.objects.length > 0,
  };
  document.querySelectorAll("[data-draw-pipeline]").forEach((item) => {
    const step = item.dataset.drawPipeline;
    item.classList.toggle("done", steps[step]);
  });
}

function setStatusInfo(msg) {
  if (dom.statusInfo) dom.statusInfo.textContent = msg;
}

function updateStatusBar() {
  const mode = state.draw.active ? `Draw: ${state.draw.tool}` :
    state.boolean.active ? `Boolean: ${state.boolean.operation}` :
    state.deform.active ? `Deform: ${state.deform.type}` :
    state.landscape.mesh ? `Sculpt: ${state.landscape.tool}` :
    state.subObjectLevel !== "object" ? `Edit ${state.subObjectLevel}` :
    "Model";
  dom.statusMode.textContent = `Mode: ${mode}`;

  const id = primaryId();
  if (id) {
    if (isClusterId(id)) {
      const cluster = findCluster(id);
      dom.statusInfo.textContent = cluster ? `${cluster.name} (${cluster.members.length} objets groupés)` : "Groupe";
    } else {
      const spec = findSpec(id);
      const mesh = findMesh(id);
      const verts = mesh?.geometry?.attributes?.position?.count || 0;
      const info = state.selectedIds.length > 1
        ? `${state.selectedIds.length} objets sélectionnés`
        : `${spec?.name || "?"} (${verts} verts)`;
      dom.statusInfo.textContent = info;
    }
  } else {
    dom.statusInfo.textContent = state.objects.length
      ? `${state.objects.length} objets dans la scène`
      : "Aucun objet";
  }

  let hint = "";
  if (state.cine.playing) hint = "Lecture cinématique · bouton Lire pour arrêter";
  else if (measureActive) hint = "Clique 2 points dans la scène pour créer une cote";
  else if (state.draw.active) hint = "Clique et glisse dans la vue pour dessiner";
  else if (state.boolean.active && state.boolean.firstId) hint = "Clique le second objet pour l'opération booléenne";
  else if (state.boolean.active) hint = "Clique le premier objet pour le booléen";
  else if (state.deform.active) hint = "Clique Deform pour cycler Bend / Twist / Taper";
  else if (state.landscape.mesh) hint = "Clique et glisse sur le terrain pour sculpter";
  else if (state.snap.enabled) hint = "Snapping actif";
  else if (state.subObjectLevel !== "object") hint = "Clique le maillage pour sélectionner un élément · Extrude en mode face · Q pour désélectionner";
  else if (state.quadView) hint = "Alt+W: vue unique · Clique une étiquette pour activer la vue";
  else hint = "Q: sélection · W: déplacer · E: tourner · R: échelle · Alt+W: quad view";
  dom.statusHint.textContent = hint;
  updateSelectionInfo();
}


function resize() {
  const rect = dom.viewport.getBoundingClientRect();
  if (rect.width && rect.height) {
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(Math.round(rect.width), Math.round(rect.height), true);
    if (vpFrontCam) {
      const s = Math.max(rect.width, rect.height) / 40;
      vpFrontCam.left = -s; vpFrontCam.right = s;
      vpFrontCam.top = s; vpFrontCam.bottom = -s;
      vpFrontCam.updateProjectionMatrix();
      vpTopCam.left = -s; vpTopCam.right = s;
      vpTopCam.top = s; vpTopCam.bottom = -s;
      vpTopCam.updateProjectionMatrix();
      vpLeftCam.left = -s; vpLeftCam.right = s;
      vpLeftCam.top = s; vpLeftCam.bottom = -s;
      vpLeftCam.updateProjectionMatrix();
    }
  }

  const panoRect = dom.panoramaViewport.getBoundingClientRect();
  if (panoRect.width && panoRect.height) {
    panoCamera.aspect = panoRect.width / panoRect.height;
    panoCamera.updateProjectionMatrix();
    panoRenderer.setSize(panoRect.width, panoRect.height, false);
  }
  renderPlan();
  renderDraw();
}

function animate() {
  requestAnimationFrame(animate);
  const aNow = performance.now();
  const dt = Math.min(0.05, (aNow - window.__lastAnimT) / 1000);
  window.__lastAnimT = aNow;
  if (state.anim.playing && !state.cine.playing) {
    state.anim.t += dt;
    updateSceneAnimation(dt);
  }
  if (state.cine.playing) cineTick(dt);
  controls.update();
  panoControls.update();
  if (quadViewActive && vpFrontCam && vpTopCam && vpLeftCam) {
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const hw = Math.floor(w / 2), hh = Math.floor(h / 2);
    renderer.setScissorTest(true);
    renderer.setViewport(0, hh, hw, hh);
    renderer.setScissor(0, hh, hw, hh);
    vpFrontCam.aspect = hw / hh;
    vpFrontCam.updateProjectionMatrix();
    renderer.render(scene, vpFrontCam);
    renderer.setViewport(hw, hh, w - hw, hh);
    renderer.setScissor(hw, hh, w - hw, hh);
    vpTopCam.aspect = (w - hw) / hh;
    vpTopCam.updateProjectionMatrix();
    renderer.render(scene, vpTopCam);
    renderer.setViewport(0, 0, hw, hh);
    renderer.setScissor(0, 0, hw, hh);
    vpLeftCam.aspect = hw / hh;
    vpLeftCam.updateProjectionMatrix();
    renderer.render(scene, vpLeftCam);
    renderer.setViewport(hw, 0, w - hw, hh);
    renderer.setScissor(hw, 0, w - hw, hh);
    camera.aspect = (w - hw) / hh;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
  } else {
    renderer.render(scene, camera);
  }
  panoRenderer.render(panoScene, panoCamera);
}

function download(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "inerre-project";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}
