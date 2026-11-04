import {randomBytes} from 'node:crypto';
import type {Database} from '../leaderboard/server';
import {resolveAccount} from '../accounts/server';
import {writeFrozen,readOnlyResponse} from '../accounts/write-freeze';
import {HttpError,respond,sameOrigin,rateLimit,errorResponse} from '../../server/api';
import {storageFullResponse} from '../../server/storage-full';
import {POLICIES,MAX_UPLOAD_BYTES,MEDIA_ACCOUNT_MAX_BYTES,MEDIA_GLOBAL_DEFAULT_MAX_BYTES,mediaKey,validMediaId,type Purpose} from './policy';
import {processImage,MediaError,MEDIA_MESSAGES,type MediaErrorCode} from './process';
import {purgePendingMedia,type MediaStore} from './store';

const STATUS:Record<MediaErrorCode,number>={unsupported_type:415,too_large:413,too_many_pixels:422,corrupt:422,cannot_compress:422};
const IMMUTABLE='public, max-age=31536000, immutable';
/** Reads at most `limit` bytes; the declared length is only a fast path, the stream is what is enforced. */
async function readBody(request:Request,limit:number):Promise<Uint8Array> {
 const tooLarge=()=>new HttpError(413,'too_large',MEDIA_MESSAGES.too_large);
 if(Number(request.headers.get('content-length'))>limit)throw tooLarge();
 const reader=request.body?.getReader();if(!reader)return new Uint8Array(0);
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){
   const chunk=await reader.read();if(chunk.done)break;
   size+=chunk.value.length;if(size>limit){await reader.cancel();throw tooLarge();}
   chunks.push(chunk.value);
  }
 }finally{reader.releaseLock();}
 const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
 return body;
}
const notFound=()=>respond({error:'not_found'},404);
export function createMediaHandler(db:Database,store:MediaStore|null,env:{maxTotalBytes?:number}={}):(request:Request)=>Promise<Response> {
 const maxTotal=env.maxTotalBytes??MEDIA_GLOBAL_DEFAULT_MAX_BYTES;
 async function upload(request:Request,purposeParam:string|null,store:MediaStore):Promise<Response> {
  const account=await resolveAccount(db,request);if(!account)throw new HttpError(401,'unauthorized','Please log in again.');
  if(!sameOrigin(request))throw new HttpError(403,'forbidden','Cross-origin requests are not allowed.');
  if(await writeFrozen(db))return readOnlyResponse();
  const type=(request.headers.get('content-type')??'').split(';')[0]!.trim().toLowerCase();
  if(!(type.startsWith('image/')||type==='application/octet-stream'))throw new HttpError(415,'unsupported_type',MEDIA_MESSAGES.unsupported_type);
  if(!purposeParam||!Object.hasOwn(POLICIES,purposeParam))throw new HttpError(400,'invalid_purpose','Invalid purpose.');
  const purpose=purposeParam as Purpose;
  await rateLimit(db.query,'media:upload:'+account.id,60,86400);
  const body=await readBody(request,MAX_UPLOAD_BYTES);
  const mine=await db.query('SELECT COALESCE(sum(bytes+thumb_bytes),0)::bigint AS total FROM media_objects WHERE owner_id=$1',[account.id]);
  if(Number(mine.rows[0].total)>=MEDIA_ACCOUNT_MAX_BYTES)throw new HttpError(413,'quota_exceeded',"You've reached your photo storage limit. Delete some posts to make room.");
  const all=await db.query('SELECT COALESCE(sum(bytes+thumb_bytes),0)::bigint AS total FROM media_objects');
  if(Number(all.rows[0].total)>maxTotal)return storageFullResponse();
  let processed;
  try{processed=await processImage(body,purpose);}
  catch(error){if(error instanceof MediaError)throw new HttpError(STATUS[error.code],error.code,error.message);throw error;}
  const id='m_'+randomBytes(16).toString('hex');
  const keys=[mediaKey(id,'full'),...(processed.thumb?[mediaKey(id,'thumb')]:[])];
  try{
   await store.put(keys[0]!,processed.full);
   if(processed.thumb)await store.put(keys[1]!,processed.thumb);
   await db.query(`INSERT INTO media_objects(id,owner_id,purpose,state,bytes,thumb_bytes,width,height) VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)`,
    [id,account.id,purpose,processed.full.byteLength,processed.thumb?.byteLength??0,processed.width,processed.height]);
  }catch(error){
   for(const key of keys)await store.delete(key).catch(()=>{});
   throw error;
  }
  await purgePendingMedia(db.query,store).catch(()=>{});
  return respond({id,width:processed.width,height:processed.height,bytes:processed.full.byteLength,thumb:!!processed.thumb},201);
 }
 async function serve(request:Request,params:URLSearchParams,store:MediaStore):Promise<Response> {
  const id=params.get('id'),variant=params.get('v')??'full';
  if(variant!=='full'&&variant!=='thumb')throw new HttpError(400,'invalid_variant','Invalid variant.');
  if(!validMediaId(id))return notFound();
  const account=request.headers.get('authorization')?await resolveAccount(db,request):null;
  const result=await db.query(`SELECT m.owner_id,m.purpose,m.state,m.thumb_bytes,
    EXISTS(SELECT 1 FROM social_post_media pm JOIN social_posts p ON p.id=pm.post_id WHERE pm.media_id=m.id AND NOT p.deleted AND NOT p.hidden) AS post_public,
    EXISTS(SELECT 1 FROM social_post_media pm JOIN social_posts p ON p.id=pm.post_id WHERE pm.media_id=m.id AND NOT p.deleted AND p.author_id=$2) AS post_own,
    EXISTS(SELECT 1 FROM social_profiles sp WHERE sp.avatar_id=m.id OR sp.banner_id=m.id) AS on_profile
   FROM media_objects m WHERE m.id=$1`,[id,account?.id??null]);
  const row=result.rows[0];if(!row||row.purpose==='snap')return notFound();
  if(variant==='thumb'&&Number(row.thumb_bytes)===0)return notFound();
  const owner=!!account&&account.id===row.owner_id;
  let publicly=false;
  if(row.state==='pending'){if(!owner)return notFound();}
  else if(row.purpose==='post'){
   if(row.post_public)publicly=true;else if(!(account&&row.post_own))return notFound();
  }else if(row.on_profile)publicly=true;
  else return notFound();
  const bytes=await store.get(mediaKey(id,variant));if(!bytes)return notFound();
  return new Response(bytes as unknown as BodyInit,{status:200,headers:{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Content-Length':String(bytes.byteLength),'Cache-Control':publicly?IMMUTABLE:'private, no-store'}});
 }
 return async request=>{
  try{
   if(!store)return respond({error:'media_not_configured'},503);
   const params=new URL(request.url).searchParams,action=params.get('action');
   if(request.method==='POST'&&action==='upload')return await upload(request,params.get('purpose'),store);
   if(request.method==='GET'&&action==='get')return await serve(request,params,store);
   return respond({error:'not_found'},action?405:404);
  }catch(error){return errorResponse(error,'media_unavailable');}
 };
}
