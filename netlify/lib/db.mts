// Server-only: do not import this module anywhere in src/.
import {createPool} from '../../scripts/db-connection.mjs';
let pool:ReturnType<typeof createPool>|undefined;
export function getPool(){return pool??=createPool(process.env.DATABASE_URL);}
