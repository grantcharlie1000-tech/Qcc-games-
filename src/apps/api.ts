/** Browser JSON client shared by QCC Social, Chat and media. Imports nothing from node or server files. */
export class ApiError extends Error {
 constructor(readonly status:number,readonly code:string,message:string,readonly retryAfter:number|null=null){super(message);this.name='ApiError';}
}
export const NETWORK_MESSAGE="Couldn't reach QCC. Check your connection and try again.";
export const TIMEOUT_MESSAGE='That took too long. Check your connection and try again.';
export const MEDIA_UNAVAILABLE_MESSAGE='Photos are unavailable right now.';
export const STORAGE_FULL_MESSAGE_TEXT='Photo storage is full right now. Try again later.';
const minutes=(seconds:number|null)=>Math.max(1,Math.ceil((seconds??60)/60));
/** Rate-limit copy from DESIGN 7.2, keyed by the action that was refused. */
export function rateLimitMessage(action:string,retryAfter:number|null):string {
 switch(action){
  case 'post':return `You've posted a lot this hour. Try again in ${minutes(retryAfter)} min.`;
  case 'like':return `That's a lot of likes. Try again in ${minutes(retryAfter)} min.`;
  case 'follow':return "You've followed a lot of people today. Try again tomorrow.";
  case 'request':return "You've sent a lot of friend requests today. Try again tomorrow.";
  case 'report':return "You've sent a lot of reports today. Try again tomorrow.";
  case 'upload':return "You've added a lot of photos today. Try again tomorrow.";
  case 'send':return retryAfter!==null&&retryAfter>3600?"You've sent a lot of messages today. Try again tomorrow.":"You're sending messages quickly. Wait a moment, then try again.";
  default:return `You're doing that a lot. Try again in ${minutes(retryAfter)} min.`;
 }
}
export function defaultMessage(status:number,code:string):string {
 if(code==='media_not_configured')return MEDIA_UNAVAILABLE_MESSAGE;
 if(status===507)return STORAGE_FULL_MESSAGE_TEXT;
 if(status===401)return 'Please log in again.';
 if(status===404)return "This page doesn't exist.";
 if(status===410)return 'This is gone.';
 if(status>=500)return 'This is unavailable right now. Try again soon.';
 return 'Something went wrong. Try again.';
}
const codeLike=/^[a-z0-9_]{2,40}$/;
const STATUS_CODES:Record<number,string>={400:'bad_request',401:'unauthorized',403:'forbidden',404:'not_found',413:'too_large',429:'rate_limited',507:'storage_full'};
/** Builds an ApiError from a non-2xx response body (already read as text) and its Retry-After header. */
export function errorFromBody(status:number,text:string,retryHeader:string|null,action=''):ApiError {
 let body:Record<string,unknown>={};
 try{const parsed=JSON.parse(text);if(parsed&&typeof parsed==='object')body=parsed as Record<string,unknown>;}catch{/* not JSON */}
 const raw=typeof body.error==='string'?body.error:'';
 const code=codeLike.test(raw)?raw:STATUS_CODES[status]??`http_${status}`;
 const retry=retryHeader!==null&&/^\d+$/.test(retryHeader.trim())?Number(retryHeader.trim()):null;
 let message=typeof body.message==='string'&&body.message?body.message:(!codeLike.test(raw)&&raw?raw:defaultMessage(status,code));
 if(status===429)message=rateLimitMessage(action,retry);
 return new ApiError(status,code,message,retry);
}
/** Combines the caller's signal with a deadline; works without AbortSignal.any. cleanup() must be called when done. */
export function deadline(ms:number,signal?:AbortSignal):{signal:AbortSignal;cleanup:()=>void} {
 const any=(AbortSignal as unknown as {any?:(signals:AbortSignal[])=>AbortSignal}).any;
 if(typeof any==='function'&&typeof AbortSignal.timeout==='function'){
  return {signal:signal?any.call(AbortSignal,[AbortSignal.timeout(ms),signal]):AbortSignal.timeout(ms),cleanup:()=>{}};
 }
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(new DOMException('The operation timed out.','TimeoutError')),ms);
 const onAbort=()=>controller.abort(signal!.reason);
 if(signal){if(signal.aborted)onAbort();else signal.addEventListener('abort',onAbort,{once:true});}
 return {signal:controller.signal,cleanup:()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}};
}
const failure=(error:unknown,signal?:AbortSignal):unknown=>{
 if(signal?.aborted)return error;
 const name=(error as {name?:string})?.name;
 return name==='TimeoutError'||name==='AbortError'?new ApiError(0,'timeout',TIMEOUT_MESSAGE):new ApiError(0,'network',NETWORK_MESSAGE);
};
export class AppApi {
 constructor(readonly endpoint:string,private token:()=>string|null,private fetcher:typeof fetch=(...args)=>globalThis.fetch(...args),private timeoutMs=8000){}
 private async run<T>(action:string,url:string,init:RequestInit,signal:AbortSignal|undefined,ms:number,read:(response:Response)=>Promise<T>):Promise<T> {
  const headers:Record<string,string>={...(init.headers as Record<string,string>|undefined)};
  const token=this.token();if(token)headers.Authorization=`Bearer ${token}`;
  const limit=deadline(ms,signal);
  try{
   let response:Response;
   try{response=await this.fetcher(url,{...init,headers,cache:'no-store',signal:limit.signal});}
   catch(error){throw failure(error,signal);}
   if(!response.ok)throw errorFromBody(response.status,await response.text().catch(()=>''),response.headers.get('Retry-After'),action);
   try{return await read(response);}catch(error){
    if(error instanceof ApiError)throw error;
    if(signal?.aborted)throw error;
    throw failure(error,signal);
   }
  }finally{limit.cleanup();}
 }
 /** POST whose response is binary. The deadline covers reading the body too. */
 raw<T>(action:string,body:unknown,read:(response:Response)=>Promise<T>,signal?:AbortSignal,ms=this.timeoutMs):Promise<T> {
  return this.run(action,`${this.endpoint}?action=${encodeURIComponent(action)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},signal,ms,read);
 }
 get<T>(action:string,params:Record<string,string>={},signal?:AbortSignal):Promise<T> {
  const query=new URLSearchParams({action,...params});query.set('action',action);
  return this.run<T>(action,`${this.endpoint}?${query}`,{method:'GET'},signal,this.timeoutMs,readJson);
 }
 post<T>(action:string,body:unknown,signal?:AbortSignal):Promise<T> {
  return this.run<T>(action,`${this.endpoint}?action=${encodeURIComponent(action)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},signal,this.timeoutMs,readJson);
 }
}
async function readJson<T>(response:Response):Promise<T> {
 try{return await response.json() as T;}
 catch(error){
  const name=(error as {name?:string})?.name;
  if(name==='TimeoutError'||name==='AbortError'||error instanceof TypeError)throw error;
  throw new ApiError(response.status,'bad_response','Something went wrong. Try again.');
 }
}
