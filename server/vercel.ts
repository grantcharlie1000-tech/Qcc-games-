// Vercel Functions handlers (Node runtime). Bundled to dist-server/vercel.mjs and re-exported by api/[route].js.
import {createHash,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {createApp} from './app';
import {poolFromEnv} from './db';

/** Vercel adds the [route] capture to the query string, not application input.
 * Strip only its exact single matching value on the two Study route shapes.
 * All other/duplicate parameters remain for the pairing handler to reject.
 */
function withoutVercelStudyRouteMetadata(request:Request):Request{
 const url=new URL(request.url);
 if(!['/api/study-link','/api/study-link/','/.netlify/functions/study-link','/.netlify/functions/study-link/'].includes(url.pathname))return request;
 const route=url.searchParams.getAll('route');
 if(route.length!==1||route[0]!=='study-link')return request;
 url.searchParams.delete('route');
 return new Request(url,request);
}

const app=createApp({database:()=>poolFromEnv()});
const digest=(value:string)=>createHash('sha256').update(value).digest();
const handle=(incoming:Request)=>{
 const request=withoutVercelStudyRouteMetadata(incoming);
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
