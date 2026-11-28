/** Potato displays at 60 by drawing a smaller picture without shadows or heavy effects. Balanced keeps full lighting and effects, also at 60. Textures stay shared so switching preset does not rebuild them. */
import { FLOOR_DISPLAY_HZ, FLOOR_PIXEL_CAP } from '../../perf/floor';
export type QualityId = 'potato' | 'balanced';
const SHARED = { textureSize: 2048, anisotropy: 8 } as const;
export const QUALITY = {
  potato: { ...SHARED, pixelCap: 1, maxPixels: FLOOR_PIXEL_CAP, shadows: false, effects: 0.35, name: 'Potato — 60 fps', fps: FLOOR_DISPLAY_HZ },
  balanced: { ...SHARED, pixelCap: 2, maxPixels: 1920 * 1080, shadows: true, effects: 1, name: 'Balanced — 60 fps', fps: FLOOR_DISPLAY_HZ },
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

