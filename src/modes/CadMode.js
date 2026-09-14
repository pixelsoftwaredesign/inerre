export class CadMode {
  static id = "CAD";
  static label = "CAD";

  constructor(ctx) {
    this.id = CadMode.id;
    this.label = CadMode.label;
    this.ctx = ctx;
  }

  onEnter() {
    if (this.ctx.setLegacyMode) this.ctx.setLegacyMode("model");
    if (this.ctx.dom.statusMode) this.ctx.dom.statusMode.textContent = "Mode: CAD";
    if (this.ctx.updateStatusBar) this.ctx.updateStatusBar();
  }

  onExit() { /* viewport remains; panels hidden by ModeUI */ }

  update() { /* plan/draw legacy logic lives in app.js */ }
}