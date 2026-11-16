import type {PopularityDatabase} from './movie-popularity';

// This handler is deployed ONLY on Cloudflare Pages. CF-Connecting-IP must be set by
// Cloudflare, not supplied by a caller or forwarded from an untrusted proxy.
export interface MovieFailureEnv {
 MOVIE_POPULARITY_DB?:PopularityDatabase;
 MOVIE_POPULARITY_SECRET?:string;
}
const MAX_BODY_BYTES=512;
const HOUR_MS=3600000;
export const FAILURE_POST_LIMIT=500;
const REASONS=new Set([
 'frame-load-timeout','frame-ready-timeout','frame-error','frame-csp-blocked',
 'no-playback-after-ready','local-media-error','archive-frame-error',
]);
const STAGES=new Set(['connecting','loaded','ready','playing']);
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(status:number,error?:string)=>error?Response.json({error},{status,headers}):new Response(null,{status,headers});

async function smallJson(request:Request):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)throw new Error('invalid_event');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){
  const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;
  if(size>MAX_BODY_BYTES){await reader.cancel();throw new Error('body_too_large');}
  chunks.push(value);
 }
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

async function rateBucket(secret:string,hour:number,ip:string):Promise<string>{
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`movie-failure-rate:${hour}:${ip}`));
 return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}

/** The only collected event data is timestamp + fixed enumerations.
 * No account, IP, title, host, URL, referrer or user agent is persisted.
 * Hourly HMAC bucket hashes are short-lived anti-abuse counters, not viewer IDs.
 */
export async function handleMovieFailureReport(request:Request,env:MovieFailureEnv,now=Date.now()):Promise<Response>{
 if(request.method!=='POST')return reply(405,'method_not_allowed');
 const origin=new URL(request.url).origin;
 if(request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return reply(403,'origin_required');
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))return reply(415,'json_required');
 const db=env.MOVIE_POPULARITY_DB,secret=env.MOVIE_POPULARITY_SECRET;
 if(!db||!secret||secret.length<32)return reply(503,'reporting_unavailable');
 const ip=request.headers.get('CF-Connecting-IP');
 if(!ip||ip.length>45||!/^[0-9a-fA-F:.]+$/.test(ip))return reply(503,'reporting_unavailable');
 if(Number(request.headers.get('Content-Length'))>MAX_BODY_BYTES)return reply(413,'body_too_large');
 let data:unknown;
 try{data=await smallJson(request);}
 catch(error){return reply(error instanceof Error&&error.message==='body_too_large'?413:400,'invalid_event');}
 if(!data||typeof data!=='object'||Array.isArray(data))return reply(400,'invalid_event');
 const event=data as Record<string,unknown>;
 if(Object.keys(event).length!==3||typeof event.reason!=='string'||!REASONS.has(event.reason)
  ||typeof event.stage!=='string'||!STAGES.has(event.stage)
  ||typeof event.online!=='boolean')return reply(400,'invalid_event');
 try{
  const hour=Math.floor(now/HOUR_MS);
  const hash=await rateBucket(secret,hour,ip);
  const {results}=await db.prepare(`INSERT INTO movie_playback_failure_rate
   (bucket_hash,attempts,expires_at) VALUES (?,1,?)
   ON CONFLICT(bucket_hash) DO UPDATE SET attempts=MIN(attempts+1,${FAILURE_POST_LIMIT+1})
   RETURNING attempts`).bind(hash,(hour+1)*HOUR_MS).all<{attempts:number}>();
  if(!results.length)return reply(503,'reporting_unavailable');
  if(results[0].attempts>FAILURE_POST_LIMIT)return reply(429,'rate_limited');
  await db.prepare(`INSERT INTO movie_playback_failures
   (received_at,reason,stage,online) VALUES (?,?,?,?) RETURNING id`)
   .bind(now,event.reason,event.stage,event.online?1:0).all();
  return reply(204);
 }catch{
  // Avoid logging any request, IP, body, secret, SQL error or storage details.
  return reply(503,'reporting_unavailable');
 }
}
