// Vite plus the real leaderboard/accounts handlers and a local Postgres-compatible database.
import {createServer} from 'vite';
import {LocalDB,createLocalPool} from '../tests/support/local-db.mjs';
const database=new LocalDB({directory:'.netlify/local-leaderboard'});
const connectionString=await database.start();
await database.applyMigrations('db/migrations');
const pool=createLocalPool(connectionString);
const handles=new Map();
const server=await createServer({server:{port:Number(process.env.PORT||4173)},plugins:[{
 name:'local-leaderboard',configureServer(vite){
  vite.middlewares.use(async(req,res,next)=>{
   const accounts=req.url?.startsWith('/.netlify/functions/accounts');
   if(!accounts&&!req.url?.startsWith('/.netlify/functions/leaderboard'))return next();
   try{
    const name=accounts?'accounts':'leaderboard';
    if(!handles.has(name)){
     const module=await vite.ssrLoadModule(accounts?'/src/accounts/server.ts':'/src/leaderboard/server.ts');
     const {createGuardedHandler}=await vite.ssrLoadModule('/netlify/lib/runtime.mts');
     handles.set(name,createGuardedHandler(pool,accounts?module.createAccountsHandler:module.createLeaderboardHandler,{allowMissingMarker:false}));
    }
    const handle=handles.get(name);
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
