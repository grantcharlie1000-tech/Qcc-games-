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
export class AppApi {
 constructor(readonly endpoint:string,private token:()=>string|null,private fetcher:typeof fetch=(...args)=>globalThis.fetch(...args),private timeoutMs=8000){}
 private signal(signal?:AbortSignal):AbortSignal {
  const timeout=AbortSignal.timeout(this.timeoutMs);
  if(!signal)return timeout;
  const any=(AbortSignal as unknown as {any?:(signals:AbortSignal[])=>AbortSignal}).any;
  return any?any.call(AbortSignal,[timeout,signal]):timeout;
 }
 private async send<T>(action:string,url:string,init:RequestInit,signal?:AbortSignal):Promise<T> {
  const headers:Record<string,string>={...(init.headers as Record<string,string>|undefined)};
  const token=this.token();if(token)headers.Authorization=`Bearer ${token}`;
  let response:Response;
  try{response=await this.fetcher(url,{...init,headers,cache:'no-store',signal:this.signal(signal)});}
  catch(error){
   if(signal?.aborted)throw error;
   const name=(error as {name?:string})?.name;
   if(name==='TimeoutError')throw new ApiError(0,'timeout',TIMEOUT_MESSAGE);
   if(name==='AbortError')throw new ApiError(0,'timeout',TIMEOUT_MESSAGE);
   throw new ApiError(0,'network',NETWORK_MESSAGE);
  }
  if(!response.ok)throw errorFromBody(response.status,await response.text().catch(()=>''),response.headers.get('Retry-After'),action);
  try{return await response.json() as T;}catch{throw new ApiError(response.status,'bad_response','Something went wrong. Try again.');}
 }
 /** Like send, but resolves with the raw response (used for binary bodies). */
 async raw(action:string,body:unknown,signal?:AbortSignal):Promise<Response> {
  const headers:Record<string,string>={'Content-Type':'application/json'};
  const token=this.token();if(token)headers.Authorization=`Bearer ${token}`;
  let response:Response;
  try{response=await this.fetcher(`${this.endpoint}?action=${encodeURIComponent(action)}`,{method:'POST',headers,body:JSON.stringify(body),cache:'no-store',signal:this.signal(signal)});}
  catch(error){
   if(signal?.aborted)throw error;
   const name=(error as {name?:string})?.name;
   throw name==='TimeoutError'||name==='AbortError'?new ApiError(0,'timeout',TIMEOUT_MESSAGE):new ApiError(0,'network',NETWORK_MESSAGE);
  }
  if(!response.ok)throw errorFromBody(response.status,await response.text().catch(()=>''),response.headers.get('Retry-After'),action);
  return response;
 }
 get<T>(action:string,params:Record<string,string>={},signal?:AbortSignal):Promise<T> {
  const query=new URLSearchParams({action,...params});
  return this.send<T>(action,`${this.endpoint}?${query}`,{method:'GET'},signal);
 }
 post<T>(action:string,body:unknown,signal?:AbortSignal):Promise<T> {
  return this.send<T>(action,`${this.endpoint}?action=${encodeURIComponent(action)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},signal);
 }
}
