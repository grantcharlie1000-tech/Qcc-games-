/** Campaign progress, unlocks, outfits and the validated shell snapshot. Nothing restored is trusted: positions
 * come from checkpoint indices, stars must exist on this course, and locked outfits cannot be equipped. */
import type { Course } from './types';
import { createTrial, type Trial } from './trial';

export const SNAPSHOT_VERSION = 1;

export type HatKind = 'cat' | 'earmuff' | 'pompom' | 'santa' | 'star';
export type Bottom = 'tights' | 'skirt' | 'shorts';
export interface Outfit {
  id: string; name: string;
  jumper: number; trim: number; motif: number; hood: boolean;
  hat: HatKind; hatColor: number; hatTrim: number;
  bottom: Bottom; bottomColor: number;
  sockA: number; sockB: number; boots: number;
  /** How it is earned, shown in the wardrobe. */
  unlock: string;
}

export const OUTFITS: readonly Outfit[] = [
  { id: 'snowdrop', name: 'Snowdrop Knit', jumper: 0xf2afc8, trim: 0xe98aae, motif: 0xfbefe0, hood: false, hat: 'cat', hatColor: 0xf7c3d6, hatTrim: 0xfbefe0, bottom: 'tights', bottomColor: 0x3d3442, sockA: 0xf2afc8, sockB: 0xfbefe0, boots: 0xf3e6d6, unlock: 'Ready from the start' },
  { id: 'peppermint', name: 'Peppermint Swirl', jumper: 0xfbefe0, trim: 0xe2486a, motif: 0xe2486a, hood: false, hat: 'pompom', hatColor: 0xe2486a, hatTrim: 0xfbefe0, bottom: 'skirt', bottomColor: 0xe2486a, sockA: 0xe2486a, sockB: 0xfbefe0, boots: 0xfbefe0, unlock: 'Clear Giftwrap Gardens' },
  { id: 'mint', name: 'Mint Hoodie', jumper: 0xb9dfc9, trim: 0x8ccbab, motif: 0xfbefe0, hood: true, hat: 'earmuff', hatColor: 0xf2afc8, hatTrim: 0xe98aae, bottom: 'skirt', bottomColor: 0xc8b8e8, sockA: 0xc8b8e8, sockB: 0xfbefe0, boots: 0xf3e6d6, unlock: 'Clear Candy Cane Catwalk' },
  { id: 'lilac', name: 'Lilac Yarn', jumper: 0xc8b8e8, trim: 0x9b86cf, motif: 0xfbefe0, hood: false, hat: 'cat', hatColor: 0xfbefe0, hatTrim: 0xc8b8e8, bottom: 'tights', bottomColor: 0x3d3442, sockA: 0xc8b8e8, sockB: 0xfbefe0, boots: 0xf3e6d6, unlock: 'Clear Cozy Knit Workshop' },
  { id: 'frost', name: 'Rink Frost', jumper: 0xbfd9ee, trim: 0x8fbbe0, motif: 0xfbefe0, hood: true, hat: 'pompom', hatColor: 0xfbefe0, hatTrim: 0x8fbbe0, bottom: 'shorts', bottomColor: 0x7d8597, sockA: 0x8fbbe0, sockB: 0xfbefe0, boots: 0xfbefe0, unlock: 'Clear Peppermint Ice Rink' },
  { id: 'bauble', name: 'Bauble Gold', jumper: 0xf3c768, trim: 0xd9a441, motif: 0x6e203c, hood: false, hat: 'star', hatColor: 0xf3c768, hatTrim: 0x6e203c, bottom: 'skirt', bottomColor: 0x6e203c, sockA: 0x6e203c, sockB: 0xf3c768, boots: 0xf3e6d6, unlock: 'Clear Ornament Skyway' },
  { id: 'cocoa', name: 'Cocoa Cable', jumper: 0x8d2a4b, trim: 0x6e203c, motif: 0xfbefe0, hood: false, hat: 'santa', hatColor: 0xc8b8e8, hatTrim: 0xfbefe0, bottom: 'shorts', bottomColor: 0x7d8597, sockA: 0x8d2a4b, sockB: 0xfbefe0, boots: 0xf3e6d6, unlock: 'Finish the North Pole Runway' },
  { id: 'starlight', name: 'Starlight', jumper: 0xfbefe0, trim: 0xf3c768, motif: 0xf3c768, hood: false, hat: 'star', hatColor: 0xfbefe0, hatTrim: 0xf3c768, bottom: 'tights', bottomColor: 0x3d3442, sockA: 0xf3c768, sockB: 0xfbefe0, boots: 0xfbefe0, unlock: 'Collect all 30 stars' },
];
/** Which campaign checkpoint earns each chapter outfit. */
const CHAPTER_OUTFITS: readonly [number, string][] = [[5, 'peppermint'], [10, 'mint'], [15, 'lilac'], [20, 'frost'], [25, 'bauble'], [30, 'cocoa']];

export interface Progress {
  checkpoint: number;
  stars: string[];
  outfit: string;
  bow: boolean;
  help: boolean;
  complete: boolean;
  bestTrialMs: number | null;
}

export function defaultProgress(): Progress {
  return { checkpoint: 0, stars: [], outfit: 'snowdrop', bow: false, help: false, complete: false, bestTrialMs: null };
}

export function earnedUnlocks(p: Pick<Progress, 'checkpoint' | 'stars' | 'complete'>): string[] {
  const out = ['snowdrop'];
  if (p.checkpoint >= 1 || p.complete) out.push('bow');
  for (const [cp, id] of CHAPTER_OUTFITS) if (p.checkpoint >= cp || p.complete) out.push(id);
  if (p.stars.length >= 30) out.push('starlight');
  return out;
}

const int = (v: unknown, lo: number, hi: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : fallback;

export function readProgress(value: unknown, course: Course): Progress {
  const p = defaultProgress();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return p;
  const v = value as Record<string, unknown>;
  const last = course.checkpoints.length - 1;
  p.checkpoint = int(v.checkpoint, 0, last, 0);
  const known = new Set(course.stars.map(s => s.id));
  p.stars = Array.isArray(v.stars) ? [...new Set(v.stars.filter((id): id is string => typeof id === 'string' && known.has(id)))] : [];
  p.complete = v.complete === true || p.checkpoint === last;
  p.help = v.help === true;
  const best = v.bestTrialMs;
  p.bestTrialMs = typeof best === 'number' && Number.isInteger(best) && best > 0 && best < 1e8 && p.complete ? best : null;
  const earned = earnedUnlocks(p);
  p.bow = v.bow === true && earned.includes('bow');
  p.outfit = typeof v.outfit === 'string' && earned.includes(v.outfit) && OUTFITS.some(o => o.id === v.outfit) ? v.outfit : 'snowdrop';
  return p;
}

export type Mode = 'campaign' | 'trial';
export interface Snapshot { progress: Progress; mode: Mode; at: number; trial?: Trial }

export function writeSnapshot(progress: Progress, mode: Mode, at: number, trial: Trial | null, now: number) {
  return {
    v: SNAPSHOT_VERSION, progress: { ...progress, stars: [...progress.stars] }, mode, at,
    trial: mode === 'trial' && trial ? { started: trial.started, elapsed: trial.started ? Math.round(trial.elapsedBefore + now - trial.startAt) : 0, checkpoint: trial.checkpoint } : undefined,
  };
}

export function readSnapshot(value: unknown, course: Course): Snapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.v !== SNAPSHOT_VERSION) return null;
  const progress = readProgress(v.progress, course);
  const last = course.checkpoints.length - 1;
  if (v.mode === 'trial' && progress.complete && v.trial && typeof v.trial === 'object') {
    const t = v.trial as Record<string, unknown>;
    const trial = createTrial(false, last);
    trial.started = t.started === true;
    trial.elapsedBefore = trial.started ? int(t.elapsed, 0, 1e8, 0) : 0;
    trial.checkpoint = int(t.checkpoint, 0, last, 0);
    trial.eligible = false;
    trial.reason = 'restored';
    return { progress, mode: 'trial', at: trial.checkpoint, trial };
  }
  return { progress, mode: 'campaign', at: int(v.at, 0, progress.checkpoint, progress.checkpoint) };
}
