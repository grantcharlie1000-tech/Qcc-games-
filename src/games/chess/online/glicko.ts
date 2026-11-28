/**
 * Glicko-2 (Glickman, 2012 "Example of the Glicko-2 system"), one game per
 * rating period. Ratings are QCC chess ratings, not FIDE or any other site.
 */
export interface Rating { readonly rating: number; readonly deviation: number; readonly volatility: number }
export const INITIAL_RATING: Rating = Object.freeze({ rating: 1500, deviation: 350, volatility: 0.06 });
const SCALE = 173.7178;
const TAU = 0.5;
const MIN_RD = 45;
const MAX_RD = 350;
/** A player is provisional until their deviation falls below this. */
export const PROVISIONAL_RD = 110;

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu: number, muj: number, phij: number) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

/** Updates `player` after one game against `opponent`. `score` is 1, 0.5 or 0. */
export function rate(player: Rating, opponent: Rating, score: 0 | 0.5 | 1): Rating {
  return ratePeriod(player, [{ opponent, score }]);
}

/** Glicko-2 update for one rating period containing `games`. */
export function ratePeriod(player: Rating, games: readonly { opponent: Rating; score: number }[]): Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.deviation / SCALE;
  let vInv = 0, sum = 0;
  for (const { opponent, score } of games) {
    const muj = (opponent.rating - 1500) / SCALE, phij = opponent.deviation / SCALE;
    const gj = g(phij), e = expected(mu, muj, phij);
    vInv += gj * gj * e * (1 - e);
    sum += gj * (score - e);
  }
  const v = 1 / vInv;
  const delta = v * sum;

  // Step 5: new volatility by the Illinois algorithm.
  const a = Math.log(player.volatility ** 2);
  const f = (x: number) => (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) / (2 * (phi * phi + v + Math.exp(x)) ** 2) - (x - a) / (TAU * TAU);
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * TAU) < 0) k++; B = a - k * TAU; }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const sigma = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + sigma * sigma);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;
  return {
    rating: Math.round((SCALE * muNew + 1500) * 100) / 100,
    deviation: Math.round(Math.min(MAX_RD, Math.max(MIN_RD, SCALE * phiNew)) * 100) / 100,
    volatility: Math.round(sigma * 1e6) / 1e6,
  };
}

/** Deviation grows while a player is inactive (Glicko step 6 with no games), per 30 idle days. */
export function decay(r: Rating, idleDays: number): Rating {
  const periods = Math.floor(Math.max(0, idleDays) / 30);
  if (!periods) return r;
  const phi = r.deviation / SCALE;
  const grown = Math.sqrt(phi * phi + periods * r.volatility * r.volatility) * SCALE;
  return { ...r, deviation: Math.round(Math.min(MAX_RD, grown) * 100) / 100 };
}
