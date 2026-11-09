/** The first campaign used a million-point stage sort key as a displayed score.
 * Old clients and cloud snapshots can still send it. Keep the earned stage credit,
 * without inventing spark/time bonuses that cannot be recovered from that key. */
export function normalizeLastLightScore(score:number):number {
 return score>=1_000_000&&score<=40_999_999?Math.floor(score/1_000_000)*1000:score;
}
export const LAST_LIGHT_MAX_SCORE=62_000;
