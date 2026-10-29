import type {Pool,PoolConfig} from 'pg';
export function connectionOptions(value:string|undefined):PoolConfig;
export function createPool(value?:string):Pool;
export function databaseHost(value:string):string;
