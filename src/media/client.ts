import {ApiError,errorFromBody,NETWORK_MESSAGE,TIMEOUT_MESSAGE} from '../apps/api';
import {fitWithin} from '../apps/image';
export {fitWithin};
import {POLICIES,MAX_UPLOAD_BYTES,validMediaId,type Purpose} from './policy';
export type UploadStage='compressing'|'uploading'|'processing'|'ready'|'failed';
export interface UploadResult {id:string;width:number;height:number;thumb:boolean}
export const MEDIA_ENDPOINT='/.netlify/functions/media';
export const UNREADABLE_PHOTO='This photo type can’t be read here. Try a JPEG or PNG.';
const MAX_PIXELS=16_000_000;
const aborted=()=>new DOMException('Aborted','AbortError');
const check=(signal?:AbortSignal)=>{if(signal?.aborted)throw aborted();};
export const mediaUrl=(id:string,variant:'full'|'thumb'):string=>`${MEDIA_ENDPOINT}?action=get&id=${encodeURIComponent(id)}&v=${variant}`;

/** Browser-only (createImageBitmap + canvas); covered by Playwright in Task 8. */
export async function prepareImage(file:Blob,purpose:Purpose,signal?:AbortSignal):Promise<Blob> {
 check(signal);
 const fallback=()=>{if(file.size<=MAX_UPLOAD_BYTES)return file;throw new Error(UNREADABLE_PHOTO);};
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{check(signal);return fallback();}
 try{
  check(signal);
  const maxEdge=POLICIES[purpose].maxEdge;
  let size=fitWithin(bitmap.width,bitmap.height,maxEdge);
  if(size.width*size.height>MAX_PIXELS){
   const scale=Math.sqrt(MAX_PIXELS/(size.width*size.height));
   size={width:Math.max(1,Math.floor(size.width*scale)),height:Math.max(1,Math.floor(size.height*scale))};
  }
  const png=file.type==='image/png',type=png?'image/png':'image/jpeg',quality=png?undefined:0.9;
  let out:Blob|null;
  if(typeof OffscreenCanvas!=='undefined'){
   const canvas=new OffscreenCanvas(size.width,size.height),context=canvas.getContext('2d');
   if(!context)return fallback();
   context.drawImage(bitmap,0,0,size.width,size.height);check(signal);
   out=await canvas.convertToBlob({type,quality});
  }else{
   const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
   const context=canvas.getContext('2d');if(!context)return fallback();
   context.drawImage(bitmap,0,0,size.width,size.height);check(signal);
   out=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,quality));
  }
  check(signal);
  if(!out)return fallback();
  return out;
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
