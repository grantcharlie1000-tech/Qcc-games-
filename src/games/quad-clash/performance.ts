/** Both presets keep the same picture. Potato saves GPU work by pacing renders at 30 Hz. */
export type QualityId = 'potato' | 'balanced';
const PICTURE = {pixelCap:2,maxPixels:1920*1080,shadows:true,textureSize:2048,anisotropy:8,effects:1} as const;
export const QUALITY = {
  potato: {...PICTURE,name:'Potato — 30 fps',fps:30},
  balanced: {...PICTURE,name:'Balanced — 60 fps',fps:60},
} as const;
export const isQuality = (v: unknown): v is QualityId => v === 'potato' || v === 'balanced';
export function renderRatio(width: number,height: number,dpr: number,quality: QualityId): number {
  const p=QUALITY[quality],area=Math.max(1,width)*Math.max(1,height);
  return Math.min(Number.isFinite(dpr)&&dpr>0?dpr:1,p.pixelCap,Math.sqrt(p.maxPixels/area));
}

/** Scheduling carry is separate from elapsed visual time, so 60/75/144 Hz displays share one animation speed. */
export class RenderPacer {
  private carry=0;
  private elapsed=0;
  reset(): void {this.carry=this.elapsed=0;}
  next(interval: number,fps: number): number {
    if(!Number.isFinite(interval)||interval<=0)return 0;
    this.carry+=interval;this.elapsed+=interval;
    const period=1/fps;
    if(this.carry<period)return 0;
    this.carry%=period;
    const elapsed=this.elapsed;this.elapsed=0;
    return Math.min(elapsed,0.1);
  }
}

