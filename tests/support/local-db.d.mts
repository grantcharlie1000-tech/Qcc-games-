import type {Pool} from 'pg';
export function createLocalPool(connectionString:string):Pool;
export class LocalDB {
 constructor(options?:{directory?:string});
 start():Promise<string>;
 applyMigrations(directory?:string):Promise<{applied:string[];pending:string[];adopted:string[]}>;
 query(sql:string,params?:unknown[]):Promise<{rows:any[]}>;
 exec(sql:string):Promise<unknown>;
 stop():Promise<void>;
}
