import * as THREE from "three";

export class CameraManager {
  constructor(camera, { getTarget = () => new THREE.Vector3(), getAspect = () => 1 } = {}) {
    this.camera = camera;
    this.getTarget = getTarget;
    this.getAspect = getAspect;
    this.ortho = null;
    this.mode = "persp";
  }

  setOrthoAspect(aspect) {
    if (this.ortho) {
      this.ortho.aspect = aspect;
      this.ortho.updateProjectionMatrix();
    }
  }

  switchMode(mode) {
    this.mode = mode === "ortho" ? "ortho" : "persp";
    return this.mode;
  }

  active(dist = 18) {
    if (this.mode !== "ortho") return this.camera;
    if (!this.ortho) {
      this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    }
    this.ortho.position.copy(this.camera.position);
    this.ortho.lookAt(this.getTarget());
    const aspect = this.getAspect() || 1;
    this.ortho.left = -dist * aspect;
    this.ortho.right = dist * aspect;
    this.ortho.top = dist;
    this.ortho.bottom = -dist;
    this.ortho.updateProjectionMatrix();
    return this.ortho;
  }
}