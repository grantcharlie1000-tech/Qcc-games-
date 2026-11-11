/** Reload beats shared by the reload animation (render/hero) and the reload sounds (audio). Times are fractions of
 * `WeaponDef.reload` in `config.ts`, which they must not change. Both sessions read this table; either may tune the
 * numbers (pull, edit, push). Do not add beat names the other side does not handle without noting it in its status
 * file. Contract: docs/superpowers/plans/2026-11-11-breachline-audio-overhaul.md section 4. */
import type { WeaponId } from './config';

export interface ReloadBeat { name: 'release' | 'out' | 'fetch' | 'in' | 'seat' | 'bolt' | 'shell' | 'pump'; at: number }

const b = (...pairs: [ReloadBeat['name'], number][]): ReloadBeat[] => pairs.map(([name, at]) => ({ name, at }));

export const RELOADS: Record<WeaponId, { tactical: ReloadBeat[]; empty: ReloadBeat[] }> = {
  ar: {
    tactical: b(['release', 0.12], ['out', 0.19], ['fetch', 0.34], ['in', 0.58], ['seat', 0.66]),
    empty: b(['release', 0.09], ['out', 0.15], ['fetch', 0.28], ['in', 0.5], ['seat', 0.57], ['bolt', 0.8]),
  },
  carbine: {
    tactical: b(['release', 0.12], ['out', 0.19], ['fetch', 0.34], ['in', 0.58], ['seat', 0.66]),
    empty: b(['release', 0.09], ['out', 0.15], ['fetch', 0.28], ['in', 0.5], ['seat', 0.57], ['bolt', 0.8]),
  },
  smg: {
    tactical: b(['release', 0.13], ['out', 0.2], ['fetch', 0.35], ['in', 0.58], ['seat', 0.66]),
    empty: b(['release', 0.1], ['out', 0.16], ['fetch', 0.29], ['in', 0.5], ['seat', 0.57], ['bolt', 0.8]),
  },
  shotgun: {
    // Shell by shell from the side saddle into the tube; an empty gun gets one through the port and a pump first.
    tactical: b(['shell', 0.17], ['shell', 0.32], ['shell', 0.47], ['shell', 0.62], ['shell', 0.77]),
    empty: b(['shell', 0.16], ['pump', 0.33], ['shell', 0.5], ['shell', 0.65], ['shell', 0.8]),
  },
  dmr: {
    tactical: b(['release', 0.12], ['out', 0.19], ['fetch', 0.34], ['in', 0.58], ['seat', 0.66]),
    empty: b(['release', 0.09], ['out', 0.15], ['fetch', 0.28], ['in', 0.5], ['seat', 0.57], ['bolt', 0.8]),
  },
  pistol: {
    tactical: b(['release', 0.12], ['out', 0.18], ['fetch', 0.32], ['in', 0.56], ['seat', 0.64]),
    // 'bolt' on the pistol is the slide release.
    empty: b(['release', 0.1], ['out', 0.15], ['fetch', 0.28], ['in', 0.5], ['seat', 0.58], ['bolt', 0.78]),
  },
};
