// Server-only identity boundaries. No credential is created or stored here.
import {createHash} from 'node:crypto';
import type {Database} from '../src/leaderboard/server';
import type {QccIdentity,WhetuIdentity} from './study-pairing-core';
export function createQccIdentityVerifier(db:Pick<Database,'query'>){
 async function fromSessionHash(hash:string):Promise<QccIdentity|null>{
  if(!/^[a-f0-9]{64}$/.test(hash))return null;
  const row=(await db.query(`SELECT a.id,a.username,s.created_at FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash])).rows[0];
  if(!row)return null;
  const authenticatedAt=new Date(row.created_at).getTime();
  if(!Number.isSafeInteger(authenticatedAt))return null;
  return {accountId:row.id,username:row.username,sessionHash:hash,authenticatedAt};
 }
 return {fromSessionHash,fromBearer:async(request:Request)=>{
  const token=request.headers.get('authorization')?.match(/^Bearer (acct_[a-f0-9]{64})$/)?.[1];
  return token?fromSessionHash(createHash('sha256').update(token).digest('hex')):null;
 }};
}
/** Only the configured Supabase auth-cookie family may reach its issuing runtime. */
export function supabaseCookieHeader(request:Request,name:string|undefined):string|null{
 if(!name||!/^sb-[a-z0-9-]+-auth-token$/.test(name))return null;
 const source=request.headers.get('cookie')??'';if(source.length>32_768)return null;
 const parts=source.split(';').map(value=>value.trim()).filter(Boolean),found:string[]=[],seen=new Set<string>();
 for(const part of parts){
  const at=part.indexOf('=');if(at<1)continue;const key=part.slice(0,at);
  if(key!==name&&!new RegExp('^'+name+'\\.[0-9]{1,2}$').test(key))continue;
  if(seen.has(key))return null;seen.add(key);found.push(part);
 }
 if(!found.length||found.length>9||seen.has(name)&&found.length!==1)return null;
 return found.join('; ');
}
export function createWhetuIdentityVerifier(env:Record<string,string|undefined>,fetcher:typeof fetch=fetch){
 return async(request:Request):Promise<WhetuIdentity|null>=>{
  const serviceSecret=env.QCC_WHETU_SERVICE_SECRET,configured=env.WHETU_NCEASTUDY_RUNTIME_ORIGIN;
  if(!serviceSecret||Buffer.byteLength(serviceSecret)<32||!configured)return null;
  let origin:URL;try{origin=new URL(configured);}catch{return null;}
  if(origin.protocol!=='https:'||origin.origin!==configured)return null;
  const cookies=supabaseCookieHeader(request,env.WHETU_SUPABASE_AUTH_COOKIE);if(!cookies)return null;
  try{
   const response=await fetcher(origin.origin+'/api/integrations/nceastudy/identity',{method:'POST',headers:{'Content-Type':'application/json','Cookie':cookies,'X-QCC-Whetu-Service-Secret':serviceSecret},body:JSON.stringify({scope:'qcc:whetu:link:v1'}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!response.ok||Number(response.headers.get('content-length'))>4096)return null;
   const reader=response.body?.getReader();let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
   if(reader)try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096){await reader.cancel();return null;}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
   const value:unknown=JSON.parse(text);
   if(!value||typeof value!=='object'||Array.isArray(value))return null;
   const data=value as Record<string,unknown>;
   if(Object.keys(data).sort().join(',')!=='authenticatedAt,label,ownershipVerified,sessionId,subject'||typeof data.sessionId!=='string'||!data.sessionId.length||data.sessionId.length>128||typeof data.subject!=='string'||!data.subject.length||data.subject.length>512||typeof data.label!=='string'||data.label.length>200||!Number.isSafeInteger(data.authenticatedAt)||data.ownershipVerified!==true)return null;
   return data as unknown as WhetuIdentity;
  }catch{return null;}
 };
}
