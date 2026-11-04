import {appIcon} from '../../apps/icons';
import {avatar} from '../../apps/avatar';
import {appSheet,confirmSheet,reportSheet,showSheet} from '../../apps/sheets';
import {ApiError} from '../../apps/api';
import type {Friend,MessageView,Retention} from '../shared';
import type {ChatContext} from './context';
import {isAuthError} from './context';

export const RETENTION_LABEL:Record<Retention,string>={viewed:'24 hours after viewing',week:'7 days after sending'};
const NO_MESSAGES=(name:string)=>`There are no messages from ${name} to report. You can still block them.`;
const preview=(message:MessageView)=>message.kind==='snap'?'Photo':(message.body??'');

export interface InfoOptions {
 friend:Friend;
 retention:()=>Retention;
 setRetention:(mode:Retention)=>Promise<void>;
 /** The friend's recent messages that are still loaded, newest first. */
 recent:()=>MessageView[];
 trigger?:Element|null;
}

/** Opens the report sheet in message mode (DESIGN 7.3, 6.8): a radio list of the friend's recent messages, then the categories. */
export function openMessageReport(ctx:ChatContext,friend:Friend,candidates:MessageView[],options:{trigger?:Element|null;preselect?:string}={}):void {
 let chosen:string|null=options.preselect??null;
 void reportSheet({
  title:'Report message',
  intro:'A copy of this message goes to QCC moderators, even after it disappears.',
  trigger:options.trigger,
  onUnauthorized:()=>ctx.signedOut(),
  prefix:(host,update)=>{
   if(!candidates.length){
    const p=document.createElement('p');p.className='muted apps-report-none';p.textContent=NO_MESSAGES(friend.displayName);host.append(p);
    return ()=>false;
   }
   const group=document.createElement('div');group.className='setting-list apps-radios chat-report-messages';group.setAttribute('role','radiogroup');group.setAttribute('aria-label','Which message?');
   for(const message of candidates){
    const label=document.createElement('label');label.className='apps-radio-row';
    const text=document.createElement('span');text.className='chat-report-text';text.textContent=preview(message);
    const input=document.createElement('input');input.type='radio';input.name='report-message';input.value=message.id;input.checked=message.id===chosen;
    label.append(text,input);group.append(label);
   }
   host.append(group);
   group.addEventListener('change',()=>{chosen=group.querySelector<HTMLInputElement>('input:checked')?.value??null;update();});
   return ()=>chosen!==null;
  },
  submit:async(category,note)=>{
   if(!chosen)throw new ApiError(400,'bad_request','Choose a message first.');
   await ctx.client.report(chosen,category,note||undefined);
  },
  block:{username:friend.username,run:async()=>{await ctx.client.block(friend.username);ctx.notify(`Blocked @${friend.username}.`,{icon:'info'});ctx.go('#/chat');}}
 });
}

/** `#chat-info` (DESIGN 6.8). */
export function openChatInfo(ctx:ChatContext,options:InfoOptions):void {
 const {friend}=options;
 const {dialog,body}=appSheet('chat-info',friend.displayName,{closeLabel:'Close chat info'});
 body.innerHTML=`<div class="chat-info-head"><span class="chat-info-avatar"></span><p class="chat-info-handle"></p></div><h3 class="search-label" id="chat-retention-h">Messages disappear</h3><div class="setting-list chat-retention" role="radiogroup" aria-labelledby="chat-retention-h"></div><div class="apps-notice-slot" aria-live="polite"></div><p class="muted chat-info-note">Either of you can change this. A note appears in the chat. Unopened messages and photos are deleted after 30 days. Saved messages stay up to 90 days.</p><p class="menu-note chat-lock-note"></p><div class="chat-info-actions"><button type="button" class="game-button secondary" data-action="report">Report a message</button><button type="button" class="game-button secondary apps-danger" data-action="block"></button><button type="button" class="game-button secondary apps-danger" data-action="remove">Remove friend</button><button type="button" class="game-button secondary apps-danger" data-action="delete">Delete conversation</button></div>`;
 body.querySelector('.chat-info-avatar')!.append(avatar(friend,56));
 body.querySelector('.chat-info-handle')!.textContent=`@${friend.username}`;
 body.querySelector('.chat-lock-note')!.innerHTML=`${appIcon('lock')}<span>Not end-to-end encrypted. QCC moderators can read messages that are reported.</span>`;
 const blockButton=body.querySelector<HTMLButtonElement>('[data-action=block]')!;blockButton.textContent=`Block ${friend.displayName}`;
 const group=body.querySelector<HTMLElement>('.chat-retention')!,slot=body.querySelector<HTMLElement>('.apps-notice-slot')!;
 for(const mode of ['viewed','week'] as const){
  const label=document.createElement('label');
  const text=document.createElement('span');text.textContent=RETENTION_LABEL[mode];
  const input=document.createElement('input');input.type='radio';input.name='chat-retention';input.value=mode;input.checked=options.retention()===mode;
  const check=document.createElement('span');check.className='chat-check';check.setAttribute('aria-hidden','true');check.innerHTML=appIcon('check');
  label.append(text,input,check);group.append(label);
 }
 let saving=false;
 group.addEventListener('change',async event=>{
  const input=event.target as HTMLInputElement;
  const mode=input.value as Retention;
  if(saving||mode===options.retention())return;
  saving=true;slot.replaceChildren();
  try{await options.setRetention(mode);}
  catch(error){
   group.querySelector<HTMLInputElement>(`input[value=${options.retention()}]`)!.checked=true;
   if(isAuthError(error)){ctx.signedOut();return;}
   const p=document.createElement('p');p.className='apps-notice';p.setAttribute('role','alert');p.innerHTML=appIcon('alert');
   const span=document.createElement('span');span.className='apps-notice-text';
   span.textContent=error instanceof ApiError&&(error.status===0||error.status===429||error.status===503)?error.message:"Couldn't change that. Try again.";
   p.append(span);slot.replaceChildren(p);
  }finally{saving=false;}
 });
 const trigger=options.trigger??null;
 const after=(run:()=>void)=>{dialog.addEventListener('close',()=>setTimeout(run,0),{once:true});dialog.close();};
 body.querySelector('[data-action=report]')!.addEventListener('click',()=>after(()=>openMessageReport(ctx,friend,options.recent().slice(0,10),{trigger})));
 blockButton.addEventListener('click',()=>after(async()=>{
  const ok=await confirmSheet({title:`Block @${friend.username}?`,text:"You won't see each other's posts or profiles, follows between you are removed, and you'll stop being friends in Chat. They won't be told.",confirm:'Block',danger:true,trigger});
  if(!ok)return;
  try{await ctx.client.block(friend.username);ctx.notify(`Blocked @${friend.username}.`,{icon:'info'});ctx.go('#/chat');}
  catch(error){ctx.fail(error,"Couldn't block. Try again.");}
 }));
 body.querySelector('[data-action=remove]')!.addEventListener('click',()=>after(async()=>{
  const ok=await confirmSheet({title:`Remove ${friend.displayName}?`,text:"You won't be able to message each other until one of you sends a new request. Your chat stays until it expires.",confirm:'Remove',danger:true,trigger});
  if(!ok)return;
  try{await ctx.client.removeFriend(friend.username);ctx.notify(`Removed ${friend.displayName}.`,{icon:'info'});ctx.go('#/chat');}
  catch(error){ctx.fail(error,"Couldn't remove them. Try again.");}
 }));
 body.querySelector('[data-action=delete]')!.addEventListener('click',()=>after(async()=>{
  const ok=await confirmSheet({title:'Delete this conversation?',text:`This removes every message and unopened photo for you and ${friend.displayName}. It can't be undone.`,confirm:'Delete',danger:true,trigger});
  if(!ok)return;
  try{await ctx.client.deleteConversation(friend.username);ctx.notify('Conversation deleted.',{icon:'info'});ctx.go('#/chat');}
  catch(error){ctx.fail(error,"Couldn't delete the conversation. Try again.");}
 }));
 showSheet(dialog,trigger);
}
