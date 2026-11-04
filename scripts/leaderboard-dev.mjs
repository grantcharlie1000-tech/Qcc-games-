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
   const route=/^\/\.netlify\/functions\/(accounts|leaderboard|social|chat|media)(?:[?#]|$)/.exec(req.url||'')?.[1];
   if(!route)return next();
   try{
    const {MAX_BODY_BYTES}=await vite.ssrLoadModule('/src/accounts/shared.ts');
    const mediaStore=route==='accounts'||route==='leaderboard'?null:(await vite.ssrLoadModule('/src/media/store.ts')).createFileStore('.netlify/local-media');
    let handle;
    if(route==='accounts')handle=(await vite.ssrLoadModule('/src/accounts/server.ts')).createAccountsHandler(pool);
    else if(route==='leaderboard')handle=(await vite.ssrLoadModule('/src/leaderboard/server.ts')).createLeaderboardHandler(pool);
    else if(route==='social')handle=(await vite.ssrLoadModule('/src/social/server.ts')).createSocialHandler(pool,mediaStore);
    else if(route==='chat')handle=(await vite.ssrLoadModule('/src/chat/server.ts')).createChatHandler(pool,mediaStore);
    else handle=(await vite.ssrLoadModule('/src/media/server.ts')).createMediaHandler(pool,mediaStore);
    const cap=route==='media'?4194304:route==='leaderboard'?2048:MAX_BODY_BYTES;
    const chunks=[];let length=0;
    for await(const chunk of req){length+=chunk.length;if(length>cap){res.writeHead(413,{'Cache-Control':'no-store'});res.end('Request too large');return;}chunks.push(chunk);}
    const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
    const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers,body:['POST','PUT'].includes(req.method)?Buffer.concat(chunks):undefined});
    const response=await handle(request);
    // Binary-safe: media responses are images.
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Local online services unavailable.'}));}
  });
 }
}]});
await server.listen();server.printUrls();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();await pool.end();await database.stop();process.exit();});
