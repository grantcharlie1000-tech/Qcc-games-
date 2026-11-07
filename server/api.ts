import type {Database} from '../src/leaderboard/server';
import {isStorageFullError,storageFullResponse} from './storage-full';

export class HttpError extends Error {
 constructor(readonly status:number,readonly code:string,message:string,readonly headers?:Record<string,string>){super(message);this.name='HttpError';}
}
/** `extra` may override default headers (e.g. Cache-Control for media serving); do not use that elsewhere. */
export function respond(body:unknown,status=200,extra:Record<string,string>={}):Response {
 return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
}
export async function readJson(request:Request,limit:number):Promise<unknown> {
 const tooLarge=()=>new HttpError(413,'too_large','Request too large.');
 if(Number(request.headers.get('content-length'))>limit)throw tooLarge();
 const reader=request.body?.getReader(),decoder=new TextDecoder();let size=0,text='';
 if(reader)try{
  for(;;){
   const chunk=await reader.read();if(chunk.done)break;
   size+=chunk.value.length;if(size>limit){await reader.cancel();throw tooLarge();}
   text+=decoder.decode(chunk.value,{stream:true});
  }
  text+=decoder.decode();
 }finally{reader.releaseLock();}
 try{return JSON.parse(text);}catch{throw new HttpError(400,'invalid_json','Invalid JSON.');}
}
export function sameOrigin(request:Request):boolean {
 const origin=request.headers.get('origin');
 return !origin||origin===new URL(request.url).origin;
}
/** Counts one event in a fixed window. Authentication also needs the count before deciding its response. */
export async function consumeAttempt(query:Database['query'],subject:string,seconds=900):Promise<{attempts:number;retry:number}> {
 const result=await query(`INSERT INTO account_attempts(subject,attempts) VALUES ($1,1)
  ON CONFLICT(subject) DO UPDATE SET attempts=CASE WHEN account_attempts.started_at<=now()-($2*interval '1 second') THEN 1 ELSE account_attempts.attempts+1 END,
  started_at=CASE WHEN account_attempts.started_at<=now()-($2*interval '1 second') THEN now() ELSE account_attempts.started_at END
  RETURNING attempts,greatest(1,ceil(extract(epoch FROM started_at+($2*interval '1 second')-now())))::int AS retry`,[subject,seconds]);
 const row=result.rows[0];
 return {attempts:Number(row.attempts),retry:Number(row.retry)};
}
/** Counts one event for `subject` in a fixed window and throws 429 once `limit` is exceeded. */
export async function rateLimit(query:Database['query'],subject:string,limit:number,seconds:number):Promise<void> {
 const {attempts,retry}=await consumeAttempt(query,subject,seconds);
 if(attempts>limit)throw new HttpError(429,'rate_limited','Too many requests. Try again later.',{'Retry-After':String(retry)});
}
export function errorResponse(error:unknown,fallback:string):Response {
 if(error instanceof HttpError)return respond({error:error.code,message:error.message},error.status,error.headers);
 if(isStorageFullError(error))return storageFullResponse();
 return respond({error:fallback},503);
}
/** `createdAt` must be passed as text with microsecond precision (pg's Date truncates to ms and breaks keyset paging):
 * select `to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` and pass that string. */
export function cursorEncode(createdAt:string,id:string):string {
 return Buffer.from(`${createdAt}|${id}`,'utf8').toString('base64url');
}
export function cursorDecode(value:string):{createdAt:string;id:string}|null {
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(value))return null;
 const parts=Buffer.from(value,'base64url').toString('utf8').split('|');
 if(parts.length!==2)return null;
 const [createdAt,id]=parts as [string,string];
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(createdAt)||Number.isNaN(Date.parse(createdAt)))return null;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return null;
 return {createdAt,id};
}
