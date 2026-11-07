/** Course assembly: derived lookups (solids per stage, fail planes) from authored parts. */
import { COURSE_VERSION } from './config';
import type { Checkpoint, Course, Decor, Snowball, Solid, StageInfo, Star, Sweeper } from './types';

export interface CourseParts {
  solids: Solid[];
  checkpoints: Checkpoint[];
  sweepers?: Sweeper[];
  snowballs?: Snowball[];
  stars?: Star[];
  stages?: StageInfo[];
  decor?: Decor[];
  startLine?: { z: number; x0: number; x1: number };
}

/** How far below the lowest nearby surface the fail plane sits. */
export const FALL_MARGIN = 7;

export function assembleCourse(parts: CourseParts): Course {
  const solids = parts.solids.map((s, i) => ({ ...s, id: i }));
  // Authored ids may be arbitrary; checkpoints refer to them, so remap.
  const remap = new Map(parts.solids.map((s, i) => [s.id, i]));
  const checkpoints = parts.checkpoints.map(c => ({ ...c, solid: remap.get(c.solid) ?? -1 }));
  if (checkpoints.some(c => c.solid < 0)) throw new Error('A checkpoint refers to a missing solid');
  const stages = (parts.stages ?? []).map(s => ({ ...s, route: s.route.map(r => ({ ...r, id: remap.get(r.id) ?? -1 })) }));
  const maxStage = Math.max(checkpoints.length - 1, ...solids.map(s => s.stage));
  const byStage: number[][] = Array.from({ length: maxStage + 1 }, () => []);
  for (const s of solids) byStage[s.stage].push(s.id);
  const lowest = (stage: number) => {
    let low = Infinity;
    for (const id of byStage[stage] ?? []) {
      const s = solids[id], top = s.y + s.hy;
      low = Math.min(low, top, top + (s.motion?.dy ?? 0));
    }
    return low;
  };
  const killY = checkpoints.map((_, i) => {
    let low = Infinity;
    for (let s = Math.max(0, i - 1); s <= Math.min(maxStage, i + 1); s++) low = Math.min(low, lowest(s));
    return (Number.isFinite(low) ? low : 0) - FALL_MARGIN;
  });
  const cp0 = checkpoints[0];
  const s0 = solids[cp0.solid];
  return {
    version: COURSE_VERSION,
    solids,
    sweepers: parts.sweepers ?? [],
    snowballs: parts.snowballs ?? [],
    checkpoints,
    stars: parts.stars ?? [],
    stages,
    decor: parts.decor ?? [],
    startLine: parts.startLine ?? { z: s0.z - s0.hz - 100, x0: s0.x - s0.hx, x1: s0.x + s0.hx },
    killY,
    byStage,
  };
}
