import type {Pool} from 'pg';
export const MOVIE_PROGRESS_MIGRATION:string;
export function migrateMovieProgress(pool:Pool,options?:{expectEnv?:string;log?:(message:string)=>void}):Promise<{applied:string[];pending:string[];adopted:string[]}>;
