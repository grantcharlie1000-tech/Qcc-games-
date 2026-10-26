// Vite plus the real leaderboard/accounts handlers and a local Postgres-compatible database.
import {createServer} from 'vite';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
const database=new NetlifyDB({directory:'.netlify/local-leaderboard',logger:()=>{}});
const connectionString=await database.start();
await database.applyMigrations('netlify/database/migrations');
const pool=getDatabase({connectionString}).pool;
const server=await createServer({server:{port:Number(process.env.PORT||4173)},plugins:[{
 name:'local-leaderboard',configureServer(vite){
  vite.middlewares.use(async(req,res,next)=>{
   const accounts=req.url?.startsWith('/.netlify/functions/accounts');
   if(!accounts&&!req.url?.startsWith('/.netlify/functions/leaderboard'))return next();
   try{
    const module=await vite.ssrLoadModule(accounts?'/src/accounts/server.ts':'/src/leaderboard/server.ts');
    const handle=(accounts?module.createAccountsHandler:module.createLeaderboardHandler)(pool);
    const chunks=[];let length=0;
    for await(const chunk of req){length+=chunk.length;if(length>(accounts?2097152:2048)){res.writeHead(413,{'Cache-Control':'no-store'});res.end('Request too large');return;}chunks.push(chunk);}
    const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
    const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers,body:['POST','PUT'].includes(req.method)?Buffer.concat(chunks):undefined});
    const response=await handle(request);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
   }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Local online services unavailable.'}));}
  });
 }
}]});
await server.listen();server.printUrls();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();await pool.end();await database.stop();process.exit();});
