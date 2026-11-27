/** One steady frame after the floor-tier quality scale. Counts are work, not timers. */
export interface FrameSnapshot {
  draws: number;
  triangles: number;
  /** Shaded device pixels, including overdraw. */
  fillPixels: number;
  /** Objects or buffers allocated on this frame and not reused from a pool. */
  allocations: number;
  /** DOM nodes whose style, transform, or text changes on this frame. */
  animatedDom: number;
  /** Forced layout reads (getBoundingClientRect, offsetWidth, getComputedStyle). */
  layoutReads: number;
  /** GPU or canvas readbacks (readPixels, getImageData) on this frame. */
  gpuReadbacks: number;
}

export interface Layout {
  cssWidth: number;
  cssHeight: number;
  dpr: 1;
}

export type SurfaceGroup = 'shell-glass' | '2d-dom' | 'three' | 'heavy-sim' | 'apps';

export interface SurfaceCollector {
  readonly id: string;
  readonly group: SurfaceGroup;
  /** Runs the shipped heavy steady update and render at the floor tier. */
  collect(layout: Layout): FrameSnapshot;
}
