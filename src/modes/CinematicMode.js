export class CinematicMode {
  static id = "CINEMATIC";
  static label = "Cinématique";

  constructor(ctx) {
    this.id = CinematicMode.id;
    this.label = CinematicMode.label;
    this.ctx = ctx;
  }

  onEnter() {
    if (this.ctx.showPanel) this.ctx.showPanel("cine");
    if (this.ctx.onCineEnter) this.ctx.onCineEnter();
    if (this.ctx.dom.statusMode) this.ctx.dom.statusMode.textContent = "Mode: Cinématique";
    if (this.ctx.updateStatusBar) this.ctx.updateStatusBar();
  }

  onExit() {
    if (this.ctx.onCineExit) this.ctx.onCineExit();
  }

  update(dt, t) {
    if (this.ctx.onCineUpdate) this.ctx.onCineUpdate(dt, t);
  }
}