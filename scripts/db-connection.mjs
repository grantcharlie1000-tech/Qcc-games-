import pg from 'pg';
// Shared by server functions and operator scripts only; never import from browser code.
export function connectionOptions(value) {
 if(!value)throw new Error('DATABASE_URL is required');
 const url=new URL(value);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('A Postgres URL is required');
 const local=['localhost','127.0.0.1','[::1]','::1'].includes(url.hostname);
 // pg connection-string SSL options otherwise override the verified TLS configuration.
 for(const key of ['sslmode','ssl','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
 return {connectionString:url.toString(),ssl:local?false:{rejectUnauthorized:true},max:2,idleTimeoutMillis:1000,connectionTimeoutMillis:10000,keepAlive:false,allowExitOnIdle:true};
}
export function createPool(value=process.env.DATABASE_URL){
 const pool=new pg.Pool(connectionOptions(value));
 pool.on('error',()=>console.error('QCC idle database connection failed.'));
 return pool;
}
export function databaseHost(value){try{return new URL(value).hostname;}catch{return 'invalid host';}}
