export class Panorama360Mode {
  static id = "PANORAMA_360";
  static label = "360°";

  constructor(ctx) {
    this.id = Panorama360Mode.id;
    this.label = Panorama360Mode.label;
    this.ctx = ctx;
  }

  onEnter() {
    if (this.ctx.setLegacyMode) this.ctx.setLegacyMode("pano");
    if (this.ctx.dom.statusMode) this.ctx.dom.statusMode.textContent = "Mode: 360°";
    if (this.ctx.updateStatusBar) this.ctx.updateStatusBar();
  }

  onExit() { /* keep pano scene alive; hidden by ModeUI */ }

  update() { }
}