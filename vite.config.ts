import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
// Globle's globe.gl dependencies import large modules for features it never uses; see the stub file.
const unused=fileURLToPath(new URL('./src/games/globle/unused-stubs.ts',import.meta.url));
const contentSecurityPolicy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://image.tmdb.org; connect-src 'self' https://0.peerjs.com wss://0.peerjs.com; worker-src 'self'; media-src 'self'; frame-src https://framextv.xyz https://framextv.cc https://archive.org; form-action 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const securityHeaders={'Content-Security-Policy':contentSecurityPolicy};
// The election results proxy (functions/api/election.ts on Pages) also answers in `vite` dev and preview.
const electionFeed={name:'election-feed',configureServer(vite:any){
  let handle:((request:Request)=>Promise<Response>)|undefined;
  vite.middlewares.use(async(req:any,res:any,next:()=>void)=>{
    if(!/^\/api\/election(?:[?#]|$)/.test(req.url||''))return next();
    try{
      handle??=(await vite.ssrLoadModule('/server/election-feed.ts')).createElectionHandler();
      const response=await handle!(new Request(`http://localhost${req.url}`,{method:req.method}));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Election feed unavailable.'}));}
  });
}};
export default defineConfig({cacheDir:'.vite-cache',base:'./',plugins:[electionFeed],resolve:{alias:[{find:/^(three\/webgpu|three\/tsl|h3-js)$/,replacement:unused}]},build:{target:'es2022',sourcemap:true,manifest:true},server:{host:'0.0.0.0',headers:securityHeaders},preview:{headers:securityHeaders},test:{include:['tests/**/*.test.ts'],environment:'node'}} as any);
