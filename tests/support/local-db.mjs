// Development/test only. A single wire connection keeps PGlite transactions isolated.
import {mkdir} from 'node:fs/promises';
import {createServer} from 'node:net';
import {PGlite} from '@electric-sql/pglite';
import {fromNodeSocket} from 'pg-gateway/node';
import pg from 'pg';
import {migrate} from '../../scripts/db-migrate.mjs';

export function createLocalPool(connectionString) {
 return new pg.Pool({connectionString,max:1,idleTimeoutMillis:1000,connectionTimeoutMillis:10000});
}

export class LocalDB {
 constructor({directory}={}) {this.directory=directory;this.sockets=new Set();}
 async start() {
  if(this.db)throw new Error('Local database already started');
  if(this.directory)await mkdir(this.directory,{recursive:true});
  this.db=await PGlite.create(this.directory);
  const {rows:[{version}]}=await this.db.query("SELECT current_setting('server_version') AS version");
  this.server=createServer(socket=>{
   socket.setNoDelay(true);
   this.sockets.add(socket);
   socket.on('close',()=>this.sockets.delete(socket));
   fromNodeSocket(socket,{
    serverVersion:version,
    auth:{method:'trust'},
    onMessage:(data,{isAuthenticated})=>isAuthenticated?this.db.execProtocolRaw(data):undefined,
   }).catch(()=>{socket.destroy();});
  });
  await new Promise((resolve,reject)=>{
   this.server.once('error',reject);
   this.server.listen(0,'127.0.0.1',()=>{this.server.off('error',reject);resolve();});
  });
  this.connectionString=`postgres://postgres@127.0.0.1:${this.server.address().port}/postgres`;
  return this.connectionString;
 }
 async applyMigrations(directory='db/migrations') {
  if(!this.db)throw new Error('Start the local database before applying migrations');
  const pool=createLocalPool(this.connectionString);
  try {return await migrate(pool,{directory,expectEnv:'development',bootstrapMarker:'development',log:()=>{}});}
  finally {await pool.end();}
 }
 async query(sql,params) {
  if(!this.db)throw new Error('Local database is not started');
  return this.db.query(sql,params);
 }
 async exec(sql) {
  if(!this.db)throw new Error('Local database is not started');
  return this.db.exec(sql);
 }
 async stop() {
  for(const socket of this.sockets)socket.destroy();
  this.sockets.clear();
  if(this.server)await new Promise((resolve,reject)=>this.server.close(error=>error?reject(error):resolve()));
  this.server=undefined;
  await this.db?.close();
  this.db=undefined;
 }
}
