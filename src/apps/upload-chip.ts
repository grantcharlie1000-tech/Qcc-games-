import {appIcon} from './icons';
import {ApiError} from './api';
import {prepareImage,uploadImage,UNREADABLE_PHOTO,TOO_BIG_PHOTO,type UploadStage} from '../media/client';
import type {Purpose} from '../media/policy';

export interface UploadFailure {short:string;long:string;code:string}
/** DESIGN 10 failure copy. */
export function describeUploadError(error:unknown):UploadFailure {
 if(error instanceof ApiError){
  if(error.code==='media_not_configured')return {short:'Unavailable',long:error.message,code:error.code};
  if(error.status===429)return {short:'Limit reached',long:error.message,code:'rate_limited'};
  if(error.status===507)return {short:'Storage full',long:'Photo storage is full right now. Try again later.',code:'storage_full'};
  if(error.code==='quota_exceeded')return {short:'Limit reached',long:"You've used all your photo space. Delete some posts to free it up.",code:'quota'};
  if(error.status===413||error.code==='too_large')return {short:'Too big',long:'This photo is too big. Try a smaller one.',code:'too_large'};
  if(error.status===415||error.code==='unsupported_type')return {short:'Not supported',long:"This file type isn't supported. Try a JPEG, PNG or WebP.",code:'unsupported'};
  if(error.status===422)return {short:"Can't read",long:"This photo format can't be read here. Try a JPEG or a screenshot.",code:'unreadable'};
  if(error.status===0||error.code==='network'||error.code==='timeout')return {short:'No connection',long:"Couldn't connect. Check your connection, then retry.",code:'network'};
  if(error.status===401)return {short:'Log in',long:error.message,code:'unauthorized'};
  return {short:'Failed',long:error.message,code:error.code};
 }
 const message=(error as Error|undefined)?.message;
 if(message===TOO_BIG_PHOTO)return {short:'Too big',long:'This photo is too big. Try a smaller one.',code:'too_large'};
 if(message===UNREADABLE_PHOTO)return {short:"Can't read",long:"This photo format can't be read here. Try a JPEG or a screenshot.",code:'unreadable'};
 return {short:'Failed',long:'Something went wrong. Try again.',code:'unknown'};
}
const LABEL:Record<Exclude<UploadStage,'failed'|'ready'>,string>={compressing:'Preparing…',uploading:'Uploading 0%',processing:'Checking…'};
export interface UploadItemOptions {
 purpose:Purpose;token:()=>string|null;
 onChange:(item:UploadItem)=>void;onRemove:(item:UploadItem)=>void;announce:(text:string)=>void;
 position:()=>{index:number;total:number};
 /** Called on failure so the host can show the long reason. */
 onFailure?:(failure:UploadFailure,item:UploadItem)=>void;
}
/** One photo going through prepareImage then uploadImage. Owns its AbortController, preview URL and timers; dispose() releases all three. */
export class UploadItem {
 readonly el=document.createElement('div');
 stage:UploadStage='compressing';
 progress=0;
 mediaId:string|null=null;
 failure:UploadFailure|null=null;
 private readonly thumb=document.createElement('div');
 private readonly label=document.createElement('span');
 private readonly bar=document.createElement('span');
 private readonly badge=document.createElement('span');
 private readonly previewUrl:string;
 private controller:AbortController|null=null;
 private badgeTimer:number|undefined;
 private lastPercent=-1;
 private disposed=false;
 constructor(private readonly file:Blob,private readonly options:UploadItemOptions) {
  this.el.className='apps-upload';this.el.setAttribute('role','group');
  this.thumb.className='apps-upload-thumb';
  this.previewUrl=URL.createObjectURL(file);
  const img=document.createElement('img');img.alt='';img.src=this.previewUrl;img.decoding='async';
  this.label.className='apps-upload-label';this.bar.className='apps-upload-bar';this.bar.setAttribute('aria-hidden','true');
  this.badge.className='apps-upload-badge';this.badge.hidden=true;this.badge.innerHTML=appIcon('check');
  const remove=document.createElement('button');remove.type='button';remove.className='apps-upload-remove';remove.innerHTML=appIcon('close');
  remove.addEventListener('click',()=>{this.dispose();this.options.onRemove(this);});
  this.thumb.append(img,this.label,this.bar,this.badge,remove);
  const actions=document.createElement('div');actions.className='apps-upload-actions';actions.hidden=true;
  actions.innerHTML=`<button type="button" class="ui-btn secondary small" data-action="retry">${appIcon('retry')}Retry</button><button type="button" class="ui-btn secondary small" data-action="remove">Remove</button>`;
  actions.querySelector('[data-action=retry]')!.addEventListener('click',()=>void this.start());
  actions.querySelector('[data-action=remove]')!.addEventListener('click',()=>{this.dispose();this.options.onRemove(this);});
  this.el.append(this.thumb,actions);
 }
 get ready():boolean{return this.stage==='ready'&&this.mediaId!==null;}
 async start():Promise<void> {
  this.controller?.abort();
  const controller=this.controller=new AbortController();
  this.failure=null;this.mediaId=null;this.progress=0;this.lastPercent=-1;this.setStage('compressing');
  try{
   const blob=await prepareImage(this.file,this.options.purpose,controller.signal);
   if(controller.signal.aborted||this.disposed)return;
   this.setStage('uploading');
   const result=await uploadImage(blob,this.options.purpose,this.options.token(),{signal:controller.signal,onProgress:fraction=>{
    if(controller.signal.aborted||this.disposed)return;
    this.progress=fraction;
    if(fraction>=1)this.setStage('processing');else{this.render();this.options.onChange(this);}
   }});
   if(controller.signal.aborted||this.disposed)return;
   this.mediaId=result.id;this.setStage('ready');
  }catch(error){
   if(controller.signal.aborted||this.disposed)return;
   this.failure=describeUploadError(error);this.setStage('failed');this.options.onFailure?.(this.failure,this);
  }
 }
 /** The server refused the post or snap because this photo waited too long: show its message and offer Remove (or Retry to upload again). */
 markFailed(message:string,code:string):void {
  if(this.disposed)return;
  this.failure={short:'Failed',long:message,code};this.setStage('failed');
 }
 dispose():void {
  this.disposed=true;this.controller?.abort();this.controller=null;
  if(this.badgeTimer!==undefined)clearTimeout(this.badgeTimer);
  URL.revokeObjectURL(this.previewUrl);this.el.remove();
 }
 private setStage(stage:UploadStage):void {
  this.stage=stage;
  if(stage==='ready'){
   this.badge.hidden=false;
   this.badgeTimer=window.setTimeout(()=>{this.badge.hidden=true;},1500);
  }else this.badge.hidden=true;
  this.render();this.options.onChange(this);
  const {index,total}=this.options.position();
  const words={uploading:'Uploading',processing:'Checking',ready:'Photo ready',failed:`Upload failed. ${this.failure?.short??''}`,compressing:''}[stage];
  if(words)this.options.announce(`Photo ${index} of ${total}: ${words}`);
 }
 private render():void {
  const {index,total}=this.options.position();
  this.el.dataset.stage=this.stage;
  const percent=Math.round(this.progress*100);
  const text=this.stage==='failed'?this.failure?.short??'Failed':this.stage==='ready'?'':this.stage==='uploading'?`Uploading ${percent}%`:LABEL[this.stage as keyof typeof LABEL];
  this.label.textContent=text;
  this.thumb.dataset.stage=this.stage;
  if(this.stage==='uploading'||this.stage==='processing')this.bar.style.transform=`scaleX(${this.stage==='processing'?1:this.progress})`;else this.bar.style.transform='scaleX(0)';
  this.el.querySelector<HTMLElement>('.apps-upload-actions')!.hidden=this.stage!=='failed';
  this.el.classList.toggle('is-failed',this.stage==='failed');
  const stageName=this.stage==='ready'?'Ready':this.stage==='failed'?`Failed, ${this.failure?.short??''}`:text.replace('…','');
  this.el.setAttribute('aria-label',`Photo ${index} of ${total}, ${stageName}`);
  const remove=this.thumb.querySelector('.apps-upload-remove')!;remove.setAttribute('aria-label',`Remove photo ${index}`);
  this.thumb.querySelector('.apps-upload-badge')!.setAttribute('aria-hidden','true');
 }
 /** Renumber after a sibling was removed. */
 refreshLabel():void{this.render();}
}
