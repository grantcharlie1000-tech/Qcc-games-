import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('dist'),port=Number(process.env.PORT||4175),base=process.env.ARCADE_BASE||'/';
const policy=(await readFile(resolve(root,'_headers'),'utf8')).match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1];
if(!policy)throw new Error('The production content security policy is missing');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png'};
http.createServer(async(req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!pathname.startsWith(base)){res.writeHead(404);res.end();return;}const relative=pathname.slice(base.length),file=resolve(root,relative||'index.html');if(!file.startsWith(root+'/')&&file!==root){res.writeHead(403);res.end();return;}try{const data=await readFile(file),headers={'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'};if(extname(file)==='.html')headers['Content-Security-Policy']=policy;res.writeHead(200,headers);res.end(data);}catch{res.writeHead(404);res.end('File not found');}}).listen(port,'0.0.0.0',()=>console.log(`Built arcade at http://127.0.0.1:${port}${base}`));
