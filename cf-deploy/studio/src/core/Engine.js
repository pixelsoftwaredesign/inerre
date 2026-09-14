export class Engine {
  constructor({ onModeChange = null } = {}) {
    this.modes = new Map();
    this.active = null;
    this.onModeChange = onModeChange;
  }

  registerMode(mode) {
    this.modes.set(mode.id, mode);
    return this;
  }

  getMode(id) {
    return this.modes.get(id) || null;
  }

  setActiveMode(id) {
    const next = this.modes.get(id);
    if (!next || next === this.active) return next || null;
    if (this.active && this.active.onExit) this.active.onExit();
    this.active = next;
    if (this.active && this.active.onEnter) this.active.onEnter();
    if (this.onModeChange) this.onModeChange(this.active);
    return this.active;
  }

  update(dt, t) {
    if (this.active && this.active.update) this.active.update(dt, t);
  }

  pointerDown(event) {
    if (this.active && this.active.onPointerDown) this.active.onPointerDown(event);
  }

  pointerMove(event) {
    if (this.active && this.active.onPointerMove) this.active.onPointerMove(event);
  }

  pointerUp(event) {
    if (this.active && this.active.onPointerUp) this.active.onPointerUp(event);
  }

  keyDown(event) {
    if (this.active && this.active.onKeyDown) this.active.onKeyDown(event);
  }
}