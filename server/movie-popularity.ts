/** Minimal structural D1 types keep the shared handler independent of Cloudflare packages. */
export interface PopularityStatement {
 bind(...values:(string|number)[]):PopularityStatement;
 all<T=Record<string,unknown>>():Promise<{results:T[]}>;
 /** D1 schema statements. The request handler uses all(), not run(). */
 run?():Promise<unknown>;
}
export interface PopularityDatabase {
 prepare(query:string):PopularityStatement;
 /** D1 batch executes sequentially in one atomic transaction. */
 batch(statements:PopularityStatement[]):Promise<unknown[]>;
}
export interface PopularityEnv {
 MOVIE_POPULARITY_DB?:PopularityDatabase;
 MOVIE_POPULARITY_ENABLED?:string;
 MOVIE_POPULARITY_SECRET?:string;
}
const DAY=86400000,HOUR=3600000,MAX_BODY=1024;
/** Valid-schema POSTs allowed for one trusted platform address during one UTC hour.
 * A school often shares one public address. This ceiling leaves room for a few
 * hundred people to report several titles in that hour. It is not split by device,
 * account, or any identifier that would outlive the hour. One client on that
 * address can still consume the whole ceiling. */
export const POPULARITY_POST_LIMIT=2000;
/** Deletes expired dedup tokens, hourly rate buckets and daily rows outside the 7-day window.
 * Safe to run with no traffic and while collection is disabled. It does not read the enable flag or the secret. */
export function cleanupMoviePopularity(db:PopularityDatabase,now=Date.now()){
 const day=Math.floor(now/DAY);
 return db.batch([
  db.prepare('DELETE FROM movie_popularity_tokens WHERE expires_at <= ?').bind(now),
  db.prepare('DELETE FROM movie_popularity_rate WHERE expires_at <= ?').bind(now),
  db.prepare('DELETE FROM movie_popularity_daily WHERE day < ?').bind(day-6),
 ]);
}
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
function reply(status:number,error?:string){return error?Response.json({error},{status,headers}):new Response(null,{status,headers});}

/** Use from Cloudflare Pages ONLY: CF-Connecting-IP must be overwritten by the platform. */
export async function handleMoviePopularity(request:Request,env:PopularityEnv,now=Date.now()):Promise<Response>{
 const db=env.MOVIE_POPULARITY_DB,secret=env.MOVIE_POPULARITY_SECRET;
 if(env.MOVIE_POPULARITY_ENABLED!=='true'||!db||!secret||secret.length<32)return reply(503,'popularity_unavailable');
 if(request.method!=='GET'&&request.method!=='POST')return reply(405,'method_not_allowed');
 const day=Math.floor(now/DAY),hour=Math.floor(now/HOUR);
 try{
  let event:{titleId:string;token:string}|undefined;
  let ip:string|undefined;
  if(request.method==='POST'){
   if(request.headers.get('origin')!==new URL(request.url).origin)return reply(403,'origin_required');
   if(request.headers.get('sec-fetch-site')==='cross-site')return reply(403,'origin_required');
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply(415,'json_required');
   ip=request.headers.get('cf-connecting-ip')??undefined;
   // Never trust X-Forwarded-For or a caller-supplied body identifier as a platform IP.
   if(!ip||ip.length>45||!/^[0-9a-fA-F:.]+$/.test(ip))return reply(503,'popularity_unavailable');
   if(Number(request.headers.get('content-length'))>MAX_BODY)return reply(413,'body_too_large');
   const reader=request.body?.getReader();if(!reader)return reply(400,'invalid_event');
   const chunks:Uint8Array[]=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();return reply(413,'body_too_large');}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return reply(400,'invalid_event');}
   if(!data||typeof data!=='object'||Array.isArray(data))return reply(400,'invalid_event');
   const value=data as Record<string,unknown>;
   if(Object.keys(value).length!==2||typeof value.titleId!=='string'||!/^movie-[1-9][0-9]{0,9}$/.test(value.titleId)||typeof value.token!=='string'||!/^[a-f0-9]{32}$/.test(value.token))return reply(400,'invalid_event');
   event={titleId:value.titleId,token:value.token};
  }
  await cleanupMoviePopularity(db,now);
  if(!event){
   // Suppress EACH day before summing. Daily token rotation cannot establish distinct weekly people.
   const {results}=await db.prepare(`SELECT title_id FROM movie_popularity_daily
    WHERE day >= ? AND day <= ? AND views >= 5
    GROUP BY title_id ORDER BY SUM(views) DESC, title_id ASC LIMIT 20`).bind(day-6,day).all<{title_id:string}>();
   return Response.json({titleIds:results.map(row=>row.title_id),windowDays:7},{headers});
  }
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  async function hash(value:string){const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');}
  // Separate hourly namespace: no title, token, or raw IP in this table; no cross-hour identifier.
  const ipHash=await hash(`rate:${hour}:${ip}`);
  const {results}=await db.prepare(`INSERT INTO movie_popularity_rate (bucket_hash, attempts, expires_at) VALUES (?, 1, ?)
   ON CONFLICT(bucket_hash) DO UPDATE SET attempts = MIN(attempts + 1, ${POPULARITY_POST_LIMIT+1}) RETURNING attempts`).bind(ipHash,(hour+1)*HOUR).all<{attempts:number}>();
  if(!results.length)return reply(503,'popularity_unavailable');
  if(results[0].attempts>POPULARITY_POST_LIMIT)return reply(429,'rate_limited');
  const tokenHash=await hash(`view:${day}:${event.titleId}:${event.token}`);
  // The schema trigger increments only after a successful insert, in the same SQLite transaction.
  await db.batch([db.prepare(`INSERT OR IGNORE INTO movie_popularity_tokens (title_id, day, token_hash, expires_at)
   VALUES (?, ?, ?, ?)`).bind(event.titleId,day,tokenHash,(day+1)*DAY)]);
  return reply(204);
 }catch{
  // Do not log request bodies, tokens, IPs, database errors, or secrets.
  return reply(503,'popularity_unavailable');
 }
}
