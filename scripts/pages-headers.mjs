// Cloudflare Pages (and any host that reads dist/_headers): when the backend lives on another origin, add that
// origin to the CSP connect-src so the browser may call it. No-op when VITE_QCC_API_BASE is unset.
import {readFile,writeFile} from 'node:fs/promises';
const raw=(process.env.VITE_QCC_API_BASE??'').trim().replace(/\/+$/,'');
if(raw){
 if(!/^https?:\/\/[^/?#]+$/.test(raw))throw new Error('VITE_QCC_API_BASE must be an origin such as https://qcc-backend.vercel.app');
 const file='dist/_headers',text=await readFile(file,'utf8');
 if(!text.includes("connect-src 'self'"))throw new Error('dist/_headers has no connect-src to extend');
 await writeFile(file,text.replace("connect-src 'self'",`connect-src 'self' ${new URL(raw).origin}`));
 console.log(`_headers: connect-src now allows ${new URL(raw).origin}`);
}
