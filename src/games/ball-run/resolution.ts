/** Keep the original 1.5 DPR ceiling. Sustained slow frames reduce GPU fill cost;
 * recovery is deliberately slower so resizing the drawing buffer cannot oscillate. */
export class AdaptiveResolution {
  private budget = 1.5;
  private slowMs = 0;
  private fastMs = 0;
  private windowMs = 0;
  private frames = 0;

  get cap(): number { return this.budget; }

  observe(frameMs: number): number {
    if (!(frameMs > 0 && frameMs < 1000)) return this.budget;
    this.windowMs += frameMs;
    this.frames++;
    if (this.windowMs < 1000) return this.budget;
    const average = this.windowMs / this.frames;
    if (average > 25) {
      this.fastMs = 0;
      this.slowMs += this.windowMs;
      if (this.slowMs >= 2000) { this.budget = Math.max(1, this.budget - .25); this.slowMs = 0; }
    } else if (average < 19) {
      this.slowMs = 0;
      this.fastMs += this.windowMs;
      if (this.fastMs >= 8000) { this.budget = Math.min(1.5, this.budget + .25); this.fastMs = 0; }
    } else {
      this.slowMs = this.fastMs = 0;
    }
    this.windowMs = this.frames = 0;
    return this.budget;
  }
}
