export class SceneManager {
  constructor({ scene, camera, objectGroup, roomGroup, landscapeGroup, gridHelper }) {
    this.scene = scene;
    this.camera = camera;
    this.objectGroup = objectGroup;
    this.roomGroup = roomGroup;
    this.landscapeGroup = landscapeGroup;
    this.gridHelper = gridHelper;
  }

  findMesh(id) {
    const obj = this.objectGroup.getObjectById(id);
    if (!obj) return null;
    let mesh = null;
    obj.traverse((child) => { if (child.isMesh) mesh = child; });
    return mesh;
  }

  addObject(group) {
    this.objectGroup.add(group);
  }

  removeObject(group) {
    this.objectGroup.remove(group);
  }
}