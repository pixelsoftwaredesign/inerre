export class LandscapeMode {
  static id = "LANDSCAPE";
  static label = "Paysage";

  constructor(ctx) {
    this.id = LandscapeMode.id;
    this.label = LandscapeMode.label;
    this.ctx = ctx;
  }

  onEnter() {
    if (this.ctx.showPanel) this.ctx.showPanel("landscape");
    if (this.ctx.onLandscapeEnter) this.ctx.onLandscapeEnter();
    if (this.ctx.dom.statusMode) this.ctx.dom.statusMode.textContent = "Mode: Paysage";
    if (this.ctx.updateStatusBar) this.ctx.updateStatusBar();
  }

  onExit() {
    if (this.ctx.onLandscapeExit) this.ctx.onLandscapeExit();
  }

  update(dt, _t) {
    if (this.ctx.onLandscapeUpdate) this.ctx.onLandscapeUpdate(dt);
  }
}