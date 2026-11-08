// Vercel Functions handlers (Node runtime). Bundled to dist-server/vercel.mjs and re-exported by api/[route].js.
import {createHash,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {createApp} from './app';
import {poolFromEnv} from './db';

const app=createApp({database:()=>poolFromEnv()});
const digest=(value:string)=>createHash('sha256').update(value).digest();
const handle=(request:Request)=>{
 const headers=new Headers(request.headers),expected=process.env.QCC_PROXY_SECRET;
 const supplied=headers.get('x-qcc-proxy-secret')??'',claimedIp=headers.get('x-qcc-client-ip')??'';
 // Fixed-size digests allow a timing-safe comparison even for different secret lengths.
 const authenticated=!!expected&&timingSafeEqual(digest(expected),digest(supplied));
 const proxyIp=authenticated&&!claimedIp.includes('%')&&isIP(claimedIp)?claimedIp:'';
 headers.delete('x-nf-client-connection-ip');
 headers.delete('x-qcc-client-ip');headers.delete('x-qcc-proxy-secret');
 if(proxyIp)headers.set('x-nf-client-connection-ip',proxyIp);
 const fallback=headers.get('x-real-ip')??headers.get('x-forwarded-for')?.split(',')[0].trim()??'';
 return app(new Request(request,{headers}),proxyIp||fallback);
};
export {handle as GET,handle as POST,handle as PUT,handle as DELETE,handle as OPTIONS};
