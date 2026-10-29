import type {Pool} from 'pg';
export interface MigrationOptions {expectEnv:string;bootstrapMarker?:string;directory?:string;dryRun?:boolean;status?:boolean;baselineThrough?:string;log?:(message:string)=>void}
export function migrationFiles(directory?:string):Promise<{name:string;sql:string;checksum:string}[]>;
export function migrate(pool:Pool,options:MigrationOptions):Promise<{applied:string[];pending:string[];adopted:string[]}>;
