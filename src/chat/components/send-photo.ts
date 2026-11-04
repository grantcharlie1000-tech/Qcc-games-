import {ApiError} from '../../apps/api';
import {appIcon} from '../../apps/icons';
import {appSheet,showSheet} from '../../apps/sheets';
import {UploadItem,describeUploadError} from '../../apps/upload-chip';
import type {Friend,MessageView} from '../shared';
import type {ChatContext} from './context';
import {isAuthError} from './context';

export const SNAP_SENT_NOTE=(name:string)=>`${name} can open it once. It's deleted after they close it, or after 30 days if it's never opened. Screenshots can't be blocked on the web.`;

/** `#chat-send-photo` (DESIGN 6.6). The picked file is shrunk and uploaded as a snap before anything is sent; Cancel removes it. */
export function openSendPhoto(ctx:ChatContext,options:{file:File;friend:Friend;trigger?:Element|null;onSent:(message:MessageView)=>void}):void {
 const {friend,file}=options;
 const {dialog,body}=appSheet('chat-send-photo',`Send a photo to ${friend.displayName}`,{closeLabel:'Close, cancel photo'});
 const previewUrl=URL.createObjectURL(file);
 body.innerHTML=`<div class="chat-photo-preview"><img alt="Preview of the photo you are sending"></div><div class="chat-photo-stage"><div class="chat-photo-chip"></div><p class="chat-photo-status" aria-hidden="true"></p></div><p class="chat-photo-note"></p><div class="apps-notice-slot"></div><div class="apps-confirm-actions"><button type="button" class="game-button secondary" data-action="cancel">Cancel</button><button type="button" class="game-button" data-action="send" disabled>Send photo</button></div><span class="sr-only chat-photo-live" role="status"></span>`;
 body.querySelector<HTMLImageElement>('img')!.src=previewUrl;
 body.querySelector('.chat-photo-note')!.textContent=SNAP_SENT_NOTE(friend.displayName);
 const q=<T extends Element>(s:string)=>body.querySelector<T>(s)!;
 const send=q<HTMLButtonElement>('[data-action=send]'),cancel=q<HTMLButtonElement>('[data-action=cancel]'),slot=q('.apps-notice-slot'),status=q('.chat-photo-status'),live=q('.chat-photo-live');
 let sending=false,sent=false;
 const notice=(text:string)=>{
  const p=document.createElement('p');p.className='apps-notice';p.setAttribute('role','alert');p.innerHTML=appIcon('alert');
  const span=document.createElement('span');span.className='apps-notice-text';span.textContent=text;p.append(span);slot.replaceChildren(p);
 };
 const item=new UploadItem(file,{
  purpose:'snap',token:ctx.token,position:()=>({index:1,total:1}),announce:text=>{live.textContent=text.replace(/^Photo 1 of 1: /,'');},
  onChange:upload=>{
   send.disabled=!upload.ready||sending;
   status.textContent=upload.stage==='ready'?'Ready to send':upload.stage==='failed'?upload.failure?.short??'Failed':upload.stage==='uploading'?`Uploading ${Math.round(upload.progress*100)}%`:upload.stage==='processing'?'Checking…':'Preparing…';
  },
  onRemove:()=>dialog.close(),
  onFailure:failure=>{notice(failure.long);if(failure.code==='unauthorized')ctx.signedOut();}
 });
 q('.chat-photo-chip').append(item.el);
 cancel.addEventListener('click',()=>dialog.close());
 send.addEventListener('click',async()=>{
  if(!item.ready||sending)return;
  sending=true;send.disabled=true;cancel.disabled=true;slot.replaceChildren();
  try{
   const message=await ctx.client.send(friend.username,{kind:'snap',mediaId:item.mediaId!});
   sent=true;options.onSent(message);dialog.close();
  }catch(error){
   sending=false;cancel.disabled=false;send.disabled=!item.ready;
   if(isAuthError(error)){ctx.signedOut();return;}
   if(error instanceof ApiError&&error.code==='media_expired')item.markFailed(error.message,error.code);
   notice(error instanceof ApiError&&(error.status===429||error.status===507||error.status===0||error.code==='media_not_configured'||error.status===400)?error.message:describeUploadError(error).short==='Failed'?"Couldn't send the photo. Try again.":describeUploadError(error).long);
  }
 });
 dialog.addEventListener('close',()=>{item.dispose();URL.revokeObjectURL(previewUrl);if(sent)ctx.announce('Photo sent.');},{once:true});
 showSheet(dialog,options.trigger);
 void item.start();
 cancel.focus();
}
