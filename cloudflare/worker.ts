// Cloudflare Workers entry for QCC. Static files come from the assets binding (dist/).
// Existing handlers are reused unchanged; the client keeps calling the same URLs.
import {Pool} from 'pg';
import {createGuardedHandler} from '../netlify/lib/runtime.mts';
import {createAccountsHandler} from '../src/accounts/server';
import {createLeaderboardHandler} from '../src/leaderboard/server';
import {createTurnHandler} from '../src/multiplayer/turn-server';
import {handleMoviesCatalog} from '../netlify/functions/movies-search.mts';

interface Limiter {limit(options: {key: string}): Promise<{success: boolean}>}
interface Env {
 RL_ACCOUNTS?: Limiter;
 RL_LEADERBOARD?: Limiter;
 RL_TURN?: Limiter;
 ASSETS: {fetch(request: Request): Promise<Response>};
 HYPERDRIVE: {connectionString: string};
 TMDB_READ_TOKEN?: string;
 CLOUDFLARE_TURN_KEY_ID?: string;
 CLOUDFLARE_TURN_API_TOKEN?: string;
 QCC_DEPLOY_CONTEXT?: string;
 QCC_DB_EXPECTED_ENV?: string;
 [flag: string]: unknown;
}

// Replaces Netlify's per-IP rules (accounts 600/min, leaderboard 300/min, turn 20/min).
// Fails closed: a missing binding returns 503 instead of silently serving unlimited traffic.
async function limited(limiter: Limiter | undefined, request: Request): Promise<Response | null> {
 const unavailable503 = () => Response.json({error: 'Service temporarily unavailable.'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
 if (!limiter) return unavailable503();
 try {
  const {success} = await limiter.limit({key: request.headers.get('cf-connecting-ip') ?? 'unknown'});
  return success ? null : Response.json({error: 'Too many requests.'}, {status: 429, headers: {'Cache-Control': 'no-store', 'Retry-After': '60'}});
 } catch { return unavailable503(); }
}

let turn: ReturnType<typeof createTurnHandler> | undefined;
const unavailable = (what: string) => Response.json({error: `${what} temporarily unavailable.`}, {status: 503, headers: {'Cache-Control': 'no-store'}});

async function withDb(env: Env, request: Request, factory: Parameters<typeof createGuardedHandler>[1]) {
 // Workers cannot share I/O objects across requests, so each request gets its own short-lived pool.
 const pool = new Pool({connectionString: env.HYPERDRIVE.connectionString, max: 1, maxUses: 1});
 try {
  const flags = Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v === 'string')) as NodeJS.ProcessEnv;
  const handle = createGuardedHandler(pool, factory, {allowMissingMarker: true, context: env.QCC_DEPLOY_CONTEXT ?? 'production', env: flags});
  return await handle(request);
 } finally { await pool.end().catch(() => undefined); }
}

export default {
 async fetch(request: Request, env: Env, ctx: {waitUntil(p: Promise<unknown>): void}): Promise<Response> {
  const {pathname} = new URL(request.url);
  try {
   if (pathname === '/.netlify/functions/accounts') { const blocked = await limited(env.RL_ACCOUNTS, request); if (blocked) return blocked; return await withDb(env, request, createAccountsHandler); }
   if (pathname === '/.netlify/functions/leaderboard') { const blocked = await limited(env.RL_LEADERBOARD, request); if (blocked) return blocked; return await withDb(env, request, createLeaderboardHandler); }
   if (pathname === '/.netlify/functions/turn') {
    const blocked = await limited(env.RL_TURN, request); if (blocked) return blocked;
    turn ??= createTurnHandler({keyId: env.CLOUDFLARE_TURN_KEY_ID, apiToken: env.CLOUDFLARE_TURN_API_TOKEN});
    return await turn(request, request.headers.get('cf-connecting-ip') ?? '');
   }
   if (pathname === '/api/movies') {
    if (request.method !== 'GET') return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET'}});
    return await handleMoviesCatalog(request, env.TMDB_READ_TOKEN ?? '');
   }
  } catch { return unavailable('Service'); }
  void ctx;
  return env.ASSETS.fetch(request);
 },
};
