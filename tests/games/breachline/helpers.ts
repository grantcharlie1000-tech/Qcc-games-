import { TICK } from '../../../src/games/breachline/config';
import { HostSession } from '../../../src/games/breachline/net';
import { idleIntent, type Match, type SimEvent } from '../../../src/games/breachline/state';

/** Runs a host session for `seconds`, collecting every event. Stops early when `until` says so. */
export function run(session: HostSession, seconds: number, until?: (m: Match) => boolean, intent = idleIntent()): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < seconds / TICK; i++) {
    session.step(intent, TICK);
    events.push(...session.drain());
    if (until?.(session.m)) break;
  }
  return events;
}
export const count = (events: SimEvent[], type: SimEvent['e']) => events.filter(e => e.e === type).length;
