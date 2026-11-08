import type {Pool} from 'pg';
export const LAST_LIGHT_MIGRATION:string;
export function migrateLastLight(pool:Pool,options?:{expectEnv?:string;log?:(message:string)=>void}):Promise<{applied:string[];pending:string[];adopted:string[]}>;
