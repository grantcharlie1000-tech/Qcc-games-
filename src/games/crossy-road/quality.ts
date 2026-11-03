/** Resolution budget, kept separate from geometry/detail quality. */
export class AdaptiveResolution {
  private level=0;
  private elapsed=0;
  private frames=0;
  private bad=0;
  private good=0;
  get cap(): number { return 2-this.level*.5; }
  get low(): boolean {return this.level===2;}
  observe(seconds: number): void {
    if(!(seconds>0)||!Number.isFinite(seconds))return;
    // Bound a tab/debugger interruption to one quarter-second contribution.
    // One isolated hitch cannot fill two bad windows, while repeated or uneven
    // slow frames still lower resolution rather than continually clearing it.
    seconds=Math.min(seconds,.25);
    let remaining=seconds;
    while(remaining>1e-12){
      // Split an interval at the exact window edge; discarding its remainder
      // makes the recovery delay depend on the previous frame cadence.
      const take=Math.min(remaining,1-this.elapsed);
      this.elapsed+=take;this.frames+=take/seconds;remaining-=take;
      if(this.elapsed<1-1e-9)continue;
      const mean=this.elapsed/this.frames;
      this.elapsed=0;this.frames=0;
      this.bad=mean>.020?this.bad+1:0;
      this.good=mean<.0175?this.good+1:0;
      // After DPR1.5, allow four further bad seconds before DPR1. Every upward recovery needs eight good seconds.
      if(this.bad>=(this.level===1?4:2)){this.level=Math.min(2,this.level+1);this.bad=this.good=0;}
      else if(this.good>=8){this.level=Math.max(0,this.level-1);this.bad=this.good=0;}
    }
  }
  private clear():void{this.elapsed=this.frames=this.bad=this.good=0;}
  reset(): void {this.level=0;this.clear();}
}
