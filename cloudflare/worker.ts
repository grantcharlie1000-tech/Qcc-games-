// Cloudflare Workers entry for QCC. Static files come from the assets binding (dist/).
// Existing handlers are reused unchanged; the client keeps calling the same URLs.
import {Pool} from 'pg';
import {createGuardedHandler} from '../netlify/lib/runtime.mts';
import {createAccountsHandler} from '../src/accounts/server';
import {createLeaderboardHandler} from '../src/leaderboard/server';
import {createTurnHandler} from '../src/multiplayer/turn-server';
import {handleMoviesCatalog} from '../netlify/functions/movies-search.mts';

interface Env {
 ASSETS: {fetch(request: Request): Promise<Response>};
 HYPERDRIVE: {connectionString: string};
 TMDB_READ_TOKEN?: string;
 CLOUDFLARE_TURN_KEY_ID?: string;
 CLOUDFLARE_TURN_API_TOKEN?: string;
 QCC_DEPLOY_CONTEXT?: string;
 QCC_DB_EXPECTED_ENV?: string;
 [flag: string]: unknown;
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
   if (pathname === '/.netlify/functions/accounts') return await withDb(env, request, createAccountsHandler);
   if (pathname === '/.netlify/functions/leaderboard') return await withDb(env, request, createLeaderboardHandler);
   if (pathname === '/.netlify/functions/turn') {
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
