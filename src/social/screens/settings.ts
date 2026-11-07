import * as store from '../../core/storage';
import {avatar} from '../../apps/avatar';
import {ApiError,MEDIA_UNAVAILABLE_MESSAGE} from '../../apps/api';
import {mediaUrl} from '../../media/client';
import {UploadItem} from '../../apps/upload-chip';
import {confirmSheet} from '../../apps/sheets';
import {codePoints,DISPLAY_NAME_MAX,BIO_MAX,type Author,type ProfileView} from '../shared';
import type {SocialContext,Screen} from '../context';
import {isAuthError} from '../context';
import {openShortcuts} from '../components/shortcuts';
import {loadFailed,skeletonRows} from '../components/states';

export const SHORTCUTS_KEY='social:shortcuts';
export const shortcutsOn=():boolean=>store.read<boolean>(SHORTCUTS_KEY,true)!==false;
const DATA_COPY="Delete everything you've posted or sent in QCC Social and QCC Chat.";

/** `#/social/settings` (DESIGN 5.10): profile, keyboard, blocked accounts, your data. */
export class SettingsScreen implements Screen {
 private readonly controller=new AbortController();
 private root=document.createElement('div');
 private disposed=false;
 private h1=document.createElement('h1');
 private uploads:UploadItem[]=[];
 constructor(private readonly ctx:SocialContext,column:HTMLElement) {
  this.root.className='social-settings';
  this.h1.className='apps-title';this.h1.tabIndex=-1;this.h1.textContent='Settings';
  column.append(this.root);this.root.append(this.h1,skeletonRows(4,'Loading settings…'));
  void this.load();
 }
 focusTarget():HTMLElement|null{return this.h1;}
 private async load():Promise<void> {
  try{
   const [blocks]=await Promise.all([this.ctx.client.blocks(this.controller.signal)]);
   if(this.disposed)return;
   const me=this.ctx.me();if(!me){this.ctx.signedOut();return;}
   this.render(me.profile,blocks.users);
  }catch(error){
   if(this.disposed||this.controller.signal.aborted)return;
   if(isAuthError(error)){this.ctx.signedOut();return;}
   this.root.replaceChildren(this.h1,loadFailed(error,()=>{this.root.replaceChildren(this.h1,skeletonRows(4));void this.load();}));
  }
 }
 private section(title:string,id:string):{h:HTMLElement;panel:HTMLElement} {
  const h=document.createElement('h2');h.className='social-settings-h';h.id=id;h.textContent=title;
  const panel=document.createElement('section');panel.className='apps-panel social-settings-panel';panel.setAttribute('aria-labelledby',id);
  this.root.append(h,panel);return {h,panel};
 }
 private render(profile:ProfileView,blocked:Author[]):void {
  this.root.replaceChildren(this.h1);
  const ctx=this.ctx,media=ctx.mediaEnabled();
  // Profile
  const {panel:profilePanel}=this.section('Profile','set-profile');
  const state={avatar:undefined as string|null|undefined,banner:undefined as string|null|undefined};
  const form=document.createElement('form');form.className='social-form';form.noValidate=true;
  const field=(label:string,control:HTMLElement,id:string)=>{
   const wrap=document.createElement('div');wrap.className='social-field';
   const l=document.createElement('label');l.htmlFor=id;l.textContent=label;control.id=id;
   const counter=document.createElement('span');counter.className='apps-counter';counter.setAttribute('aria-hidden','true');
   const head=document.createElement('div');head.className='social-field-head';head.append(l,counter);
   wrap.append(head,control);return {wrap,counter};
  };
  const name=document.createElement('input');name.type='text';name.className='apps-field';name.value=profile.displayName===profile.username?'':profile.displayName;name.autocomplete='off';
  const bio=document.createElement('textarea');bio.className='apps-field';bio.rows=3;bio.value=profile.bio;
  const nameField=field('Display name',name,'set-name'),bioField=field('Bio',bio,'set-bio');
  const save=document.createElement('button');save.type='submit';save.className='ui-btn primary apps-pill';save.textContent='Save';
  const notice=document.createElement('div');notice.className='social-composer-notice';
  const media_=this.mediaBlock(profile,media,state,()=>update());
  const update=()=>{
   const n=codePoints(name.value),b=codePoints(bio.value);
   nameField.counter.textContent=`${n}/${DISPLAY_NAME_MAX}`;nameField.counter.classList.toggle('is-over',n>DISPLAY_NAME_MAX);
   bioField.counter.textContent=`${b}/${BIO_MAX}`;bioField.counter.classList.toggle('is-over',b>BIO_MAX);
   const changed=name.value.trim()!==(profile.displayName===profile.username?'':profile.displayName)||bio.value.trim()!==profile.bio||state.avatar!==undefined||state.banner!==undefined;
   const ready=this.uploads.every(u=>u.ready);
   save.disabled=!changed||n>DISPLAY_NAME_MAX||b>BIO_MAX||!ready;
  };
  name.addEventListener('input',update);bio.addEventListener('input',update);
  form.append(media_,nameField.wrap,bioField.wrap,notice,save);profilePanel.append(form);update();
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(save.disabled)return;save.disabled=true;notice.replaceChildren();
   try{
    const input:{displayName?:string;bio?:string;avatarId?:string|null;bannerId?:string|null}={displayName:name.value.trim(),bio:bio.value.trim()};
    if(state.avatar!==undefined)input.avatarId=state.avatar;if(state.banner!==undefined)input.bannerId=state.banner;
    await ctx.client.updateProfile(input);await ctx.reloadMe();
    ctx.notify('Saved');this.ctx.refresh();
   }catch(error){
    if(isAuthError(error)){ctx.signedOut();return;}
    const p=document.createElement('p');p.className='apps-notice';p.setAttribute('role','alert');p.textContent=error instanceof ApiError?error.message:"Couldn't save. Try again.";notice.replaceChildren(p);update();
   }
  });
  // Keyboard
  const {panel:keys}=this.section('Keyboard','set-keys');
  keys.innerHTML='<div class="setting-list"><label><span>Single-key shortcuts</span><input type="checkbox" class="apps-switch"></label></div><button type="button" class="ui-btn secondary apps-pill" data-action="shortcuts">Show shortcuts</button>';
  const toggle=keys.querySelector<HTMLInputElement>('input')!;toggle.checked=shortcutsOn();
  toggle.addEventListener('change',()=>{store.write(SHORTCUTS_KEY,toggle.checked);});
  keys.querySelector('[data-action=shortcuts]')!.addEventListener('click',event=>openShortcuts(event.currentTarget as Element));
  // Blocked
  const {panel:blockedPanel}=this.section('Blocked accounts','set-blocked');
  const renderBlocked=(users:Author[])=>{
   if(!users.length){blockedPanel.replaceChildren(Object.assign(document.createElement('p'),{className:'social-muted',textContent:"You haven't blocked anyone."}));return;}
   const list=document.createElement('ul');list.className='social-blocked';
   for(const user of users){
    const li=document.createElement('li');
    const who=document.createElement('span');who.className='social-blocked-who';who.append(avatar(user,32),Object.assign(document.createElement('span'),{textContent:`@${user.username}`}));
    const button=document.createElement('button');button.type='button';button.className='ui-btn secondary small apps-pill';button.textContent='Unblock';button.setAttribute('aria-label',`Unblock @${user.username}`);
    button.addEventListener('click',async()=>{
     button.disabled=true;
     try{await ctx.client.block(user.username,false);blocked=blocked.filter(u=>u.username!==user.username);renderBlocked(blocked);ctx.notify(`Unblocked @${user.username}. Follows aren't restored.`);}
     catch(error){button.disabled=false;ctx.fail(error,`Couldn't unblock @${user.username}. Try again.`);}
    });
    li.append(who,button);list.append(li);
   }
   blockedPanel.replaceChildren(list);
  };
  renderBlocked(blocked);
  // Data
  const {panel:data}=this.section('Your data','set-data');
  data.innerHTML=`<p class="social-muted"></p><button type="button" class="ui-btn secondary apps-pill apps-danger" data-action="delete">Delete all my Social and Chat data</button>`;
  data.querySelector('p')!.textContent=DATA_COPY;
  data.querySelector('[data-action=delete]')!.addEventListener('click',async event=>{
   const ok=await confirmSheet({title:'Delete all your Social and Chat data?',text:`This removes your profile, posts, likes, follows, blocks, friends, chats and photos. Posts with replies show as "This post was deleted". Reports you've made stay with moderators, without your name. Your QCC account and game progress stay.`,confirm:'Delete everything',danger:true,typed:{label:'Type your username to confirm',match:profile.username},trigger:event.currentTarget as Element});
   if(!ok)return;
   try{await ctx.client.deleteAll();await ctx.reloadMe();ctx.notify('Your Social and Chat data has been deleted.');ctx.go(`#/social/u/${encodeURIComponent(profile.username)}`);}
   catch(error){ctx.fail(error,"Couldn't delete your data. Try again.");}
  });
  const foot=document.createElement('p');foot.className='social-foot';foot.textContent='Reported posts and messages are reviewed by QCC moderators. Messages in Chat are not end-to-end encrypted.';this.root.append(foot);
 }
 /** Avatar and banner: current image, "Change", "Remove", and the upload chip while a new one is going up. */
 private mediaBlock(profile:ProfileView,enabled:boolean,state:{avatar:string|null|undefined;banner:string|null|undefined},changed:()=>void):HTMLElement {
  const box=document.createElement('div');box.className='social-media-settings';
  // Upload availability must not prevent someone from removing an existing image.
  if(!enabled){const p=document.createElement('p');p.className='social-muted';p.textContent=MEDIA_UNAVAILABLE_MESSAGE;box.append(p);}
  const block=(kind:'avatar'|'banner',title:string)=>{
   const row=document.createElement('div');row.className=`social-media-row is-${kind}`;
   const preview=document.createElement('div');preview.className='social-media-preview';
   const draw=()=>{
    preview.replaceChildren();
    const value=state[kind]===undefined?profile[kind]:state[kind];
    if(kind==='avatar')preview.append(avatar({username:profile.username,displayName:profile.displayName,avatar:value??null},80));
    else{const b=document.createElement('div');b.className='social-banner is-preview';if(value){const img=document.createElement('img');img.alt='';img.src=mediaUrl(value,'thumb');b.append(img);}preview.append(b);}
   };
   const actions=document.createElement('div');actions.className='social-media-actions';
   const file=document.createElement('input');file.type='file';file.accept='image/*';file.hidden=true;
   const change=document.createElement('button');change.type='button';change.className='ui-btn secondary small apps-pill';change.textContent=kind==='avatar'?'Change photo':'Change banner';
   change.disabled=!enabled;file.disabled=!enabled;
   const remove=document.createElement('button');remove.type='button';remove.className='ui-btn secondary small apps-pill';remove.textContent='Remove';
   const chips=document.createElement('div');chips.className='social-uploads';
   const live=document.createElement('div');live.className='sr-only';live.setAttribute('aria-live','polite');
   const clearUploads=()=>{
    for(const old of this.uploads.filter(u=>u.el.parentElement===chips)){old.dispose();this.uploads.splice(this.uploads.indexOf(old),1);}
   };
   const syncRemove=()=>{remove.hidden=(state[kind]===undefined?profile[kind]:state[kind])===null;};
   change.addEventListener('click',()=>file.click());
   remove.addEventListener('click',()=>{clearUploads();state[kind]=null;draw();syncRemove();changed();});
   file.addEventListener('change',()=>{
    const picked=file.files?.[0];file.value='';if(!picked)return;
    const beforeUpload=state[kind];clearUploads();
    const item=new UploadItem(picked,{purpose:kind,token:()=>this.ctx.token(),announce:t=>{live.textContent=t;},position:()=>({index:1,total:1}),
     onChange:()=>{if(item.ready){state[kind]=item.mediaId;draw();syncRemove();}changed();},
     onRemove:removed=>{this.uploads.splice(this.uploads.indexOf(removed),1);state[kind]=beforeUpload;draw();syncRemove();changed();},
     onFailure:failure=>this.ctx.notify(failure.long,{role:'alert'})});
    this.uploads.push(item);chips.append(item.el);void item.start();changed();
   });
   actions.append(change,remove,file);
   const label=document.createElement('p');label.className='social-media-title';label.textContent=title;
   row.append(label,preview,actions,chips,live);draw();syncRemove();return row;
  };
  box.append(block('avatar','Photo'),block('banner','Banner'));return box;
 }
 dispose():void{this.disposed=true;this.controller.abort();for(const u of this.uploads)u.dispose();this.uploads.length=0;this.root.remove();}
}
