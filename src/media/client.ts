import {ApiError,errorFromBody,NETWORK_MESSAGE,TIMEOUT_MESSAGE} from '../apps/api';
import {fitWithin} from '../apps/image';
import {screenOriginal,canSendAsIs,fitForPurpose,encodeAttempts} from './plan';
export {fitWithin};
import {POLICIES,MAX_UPLOAD_BYTES,validMediaId,type Purpose} from './policy';
export type UploadStage='compressing'|'uploading'|'processing'|'ready'|'failed';
export interface UploadResult {id:string;width:number;height:number;thumb:boolean}
export const MEDIA_ENDPOINT='/.netlify/functions/media';
export const UNREADABLE_PHOTO='This photo type can’t be read here. Try a JPEG or PNG.';
export const TOO_BIG_PHOTO='This photo is too large to upload. Try a smaller one.';
const MAX_PIXELS=16_000_000;
const aborted=()=>new DOMException('Aborted','AbortError');
const check=(signal?:AbortSignal)=>{if(signal?.aborted)throw aborted();};
export const mediaUrl=(id:string,variant:'full'|'thumb'):string=>`${MEDIA_ENDPOINT}?action=get&id=${encodeURIComponent(id)}&v=${variant}`;

/** Browser-only (createImageBitmap + canvas); covered by Playwright in Task 8. */
export async function prepareImage(file:Blob,purpose:Purpose,signal?:AbortSignal):Promise<Blob> {
 check(signal);
 // Whetū preparePhotoFile: refuse what can never work before decoding anything.
 const screened=screenOriginal({type:file.type,size:file.size,name:(file as File).name??''});
 if(screened==='too_big')throw new Error(TOO_BIG_PHOTO);
 if(screened)throw new Error(UNREADABLE_PHOTO);
 const fallback=()=>{if(file.size<=MAX_UPLOAD_BYTES)return file;throw new Error(UNREADABLE_PHOTO);};
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{check(signal);return fallback();}
 try{
  check(signal);
  const {maxEdge,square}=POLICIES[purpose];
  // Whetū shrinkForUpload: a small photo that already fits goes as it is; the server strips metadata and re-encodes.
  if(canSendAsIs({type:file.type,size:file.size,name:(file as File).name??''},bitmap.width,bitmap.height,maxEdge,square))return file;
  let size=fitForPurpose(bitmap.width,bitmap.height,maxEdge,square);
  if(size.width*size.height>MAX_PIXELS){
   const scale=Math.sqrt(MAX_PIXELS/(size.width*size.height));
   size={width:Math.max(1,Math.floor(size.width*scale)),height:Math.max(1,Math.floor(size.height*scale))};
  }
  const encode=async(type:string,quality:number|undefined,white:boolean):Promise<Blob|null>=>{
   if(typeof OffscreenCanvas!=='undefined'){
    const canvas=new OffscreenCanvas(size.width,size.height),context=canvas.getContext('2d');
    if(!context)return null;
    if(white){context.fillStyle='#fff';context.fillRect(0,0,size.width,size.height);}
    context.drawImage(bitmap,0,0,size.width,size.height);
    return canvas.convertToBlob({type,quality});
   }
   const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
   const context=canvas.getContext('2d');if(!context)return null;
   if(white){context.fillStyle='#fff';context.fillRect(0,0,size.width,size.height);}
   context.drawImage(bitmap,0,0,size.width,size.height);
   return new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,quality));
  };
  // Sources that may carry transparency stay PNG; every JPEG is drawn on white so transparency does not turn black.
  const attempts=encodeAttempts(file.type);
  for(const [type,quality,white] of attempts){
   const out=await encode(type,quality,white);check(signal);
   if(!out)return fallback();
   if(out.size<=MAX_UPLOAD_BYTES)return out;
  }
  throw new Error(TOO_BIG_PHOTO);
 }finally{bitmap.close();}
}

export function uploadImage(blob:Blob,purpose:Purpose,token:string|null,options:{onProgress?:(fraction:number)=>void;signal?:AbortSignal;xhr?:new()=>XMLHttpRequest}={}):Promise<UploadResult> {
 const {onProgress,signal}=options;
 const Xhr=options.xhr??globalThis.XMLHttpRequest;
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(aborted());return;}
  const xhr=new Xhr();
  const onAbort=()=>xhr.abort();
  const done=()=>signal?.removeEventListener('abort',onAbort);
  xhr.open('POST',`${MEDIA_ENDPOINT}?action=upload&purpose=${encodeURIComponent(purpose)}`);
  xhr.setRequestHeader('Content-Type',blob.type||'application/octet-stream');
  if(token)xhr.setRequestHeader('Authorization',`Bearer ${token}`);
  xhr.timeout=60000;
  if(onProgress)xhr.upload.onprogress=event=>{if(event.lengthComputable&&event.total>0)onProgress(Math.min(1,event.loaded/event.total));};
  xhr.onload=()=>{
   done();
   if(xhr.status>=200&&xhr.status<300){
    try{
     const body=JSON.parse(xhr.responseText) as UploadResult;
     if(!validMediaId(body.id))throw new Error('bad id');
     resolve({id:body.id,width:body.width,height:body.height,thumb:!!body.thumb});return;
    }catch{reject(new ApiError(xhr.status,'bad_response','Something went wrong. Try again.'));return;}
   }
   reject(errorFromBody(xhr.status,xhr.responseText??'',xhr.getResponseHeader('Retry-After'),'upload'));
  };
  xhr.onerror=()=>{done();reject(new ApiError(0,'network',NETWORK_MESSAGE));};
  xhr.ontimeout=()=>{done();reject(new ApiError(0,'timeout',TIMEOUT_MESSAGE));};
  xhr.onabort=()=>{done();reject(aborted());};
  signal?.addEventListener('abort',onAbort,{once:true});
  xhr.send(blob);
 });
}
