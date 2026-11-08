// Server-only Postgres pool for the host-neutral backend. DATABASE_URL must be a pooled Neon URL in production.
import {createPool} from '../scripts/db-connection.mjs';
import type {Database} from '../src/leaderboard/server';
export function poolFromEnv(env:Record<string,string|undefined>=process.env):Database{return createPool(env.DATABASE_URL) as unknown as Database;}
