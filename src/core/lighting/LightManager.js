import * as THREE from "three";

export class LightManager {
  constructor(scene, settings = {}) {
    this.scene = scene;
    this.lights = { hemi: null, sun: null, fill: null, bounce: null, spot: null };
    this.initLights();
    this.sync(settings);
  }

  initLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x283038, 1.5);
    hemi.intensity = 0.9;
    this.scene.add(hemi);
    this.lights.hemi = hemi;

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
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
    this.scene.add(sun);
    this.lights.sun = sun;
    window.__inerreSun = sun;

    const fill = new THREE.DirectionalLight(0xa8c8ff, 0.6);
    fill.position.set(-6, 4, -5);
    this.scene.add(fill);
    this.lights.fill = fill;

    const bounce = new THREE.PointLight(0xffffff, 0.35, 20);
    bounce.position.set(0, 1.2, 0);
    this.scene.add(bounce);
    this.lights.bounce = bounce;

    const spot = new THREE.SpotLight(0xffffff, 3, 30, Math.PI / 6, 0.5, 1);
    spot.position.set(0, 6, 3);
    spot.visible = false;
    this.scene.add(spot);
    this.lights.spot = spot;
    this.scene.add(spot.target);
  }

  sync(settings = {}) {
    const r = settings;
    const sun = this.lights.sun;
    if (sun) {
      const elev = Math.max(1, r.sunElevation ?? 50) * Math.PI / 180;
      const azim = (r.sunAzimuth ?? 30) * Math.PI / 180;
      const d = 20;
      sun.position.set(
        d * Math.cos(elev) * Math.cos(azim),
        d * Math.sin(elev),
        d * Math.cos(elev) * Math.sin(azim)
      );
      sun.intensity = r.sunIntensity ?? 2.8;
      sun.castShadow = r.sunShadows ?? true;
    }
    if (this.lights.hemi) this.lights.hemi.intensity = r.hemiIntensity ?? 0.9;
    const spot = this.lights.spot;
    if (spot) {
      spot.visible = r.spotOn ?? false;
      spot.intensity = r.spotIntensity ?? 3;
      const p = r.spotPos || { x: 0, y: 6, z: 3 };
      spot.position.set(p.x, p.y, p.z);
    }
  }
}