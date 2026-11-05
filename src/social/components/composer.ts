import {appIcon} from '../../apps/icons';
import {avatar} from '../../apps/avatar';
import {ApiError} from '../../apps/api';
import {UploadItem,type UploadFailure} from '../../apps/upload-chip';
import {codePoints,POST_MAX_CHARS,POST_MAX_MEDIA,type PostView} from '../shared';
import type {SocialContext} from '../context';

export const RING_LENGTH=62.83;
export type RingState='ok'|'warn'|'over';
export const ringState=(n:number):RingState=>n>POST_MAX_CHARS?'over':n>260?'warn':'ok';
export const ringOffset=(n:number):number=>RING_LENGTH*(1-Math.min(n/POST_MAX_CHARS,1));
let uid=0;

export interface ComposerOptions {
 ctx:SocialContext;replyTo?:PostView;
 onPosted:(post:PostView)=>void;
 /** Called when the user's text or photos change (the sheet uses it to guard closing). */
 onChange?:()=>void;
}
/** DESIGN 5.6: textarea with a code-point ring, photo chips, a helper line and one Publish button. Owns its uploads; dispose() aborts them. */
export class Composer {
 readonly el=document.createElement('div');
 private readonly textarea=document.createElement('textarea');
 private readonly uploads:UploadItem[]=[];
 private readonly list=document.createElement('div');
 private readonly live=document.createElement('div');
 private readonly helper=document.createElement('p');
 private readonly slot=document.createElement('div');
 private readonly ring:SVGCircleElement;
 private readonly count=document.createElement('span');
 private readonly submit=document.createElement('button');
 private readonly photoButton=document.createElement('button');
 private readonly file=document.createElement('input');
 private sending=false;
 private attempted=false;
 private mediaOff=false;
 private helperTimer:number|undefined;
 private helperAt=0;
 private disposed=false;
 private readonly id=++uid;
 constructor(private readonly options:ComposerOptions) {
  const {ctx,replyTo}=options,reply=!!replyTo;
  this.el.className='social-composer';
  if(replyTo){
   const context=document.createElement('div');context.className='social-reply-context';
   const text=document.createElement('p');text.className='social-reply-text';
   const who=document.createElement('strong');who.textContent=replyTo.author.displayName||replyTo.author.username;
   text.append(who,': ',document.createTextNode(replyTo.body||'Photo'));
   context.append(avatar(replyTo.author,32),text);this.el.append(context);
  }
  const ta=this.textarea;
  ta.className='social-textarea';ta.placeholder=reply?'Write a reply':'Write a post';ta.rows=4;ta.setAttribute('aria-label','Post text');ta.setAttribute('aria-describedby',`composer-helper-${this.id}`);
  ta.autocomplete='off';ta.spellcheck=true;
  ta.addEventListener('input',()=>{this.grow();this.update();options.onChange?.();});
  ta.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();void this.send();}});
  this.list.className='social-uploads';
  this.live.className='sr-only';this.live.setAttribute('aria-live','polite');
  this.slot.className='social-composer-notice';
  const foot=document.createElement('div');foot.className='social-composer-foot';
  const photo=this.photoButton;photo.type='button';photo.className='apps-icon-btn';photo.setAttribute('aria-label','Add photos');photo.innerHTML=appIcon('photo');
  this.file.type='file';this.file.accept='image/*';this.file.multiple=true;this.file.hidden=true;this.file.tabIndex=-1;
  photo.addEventListener('click',()=>this.file.click());
  this.file.addEventListener('change',()=>{const files=[...(this.file.files??[])];this.file.value='';this.addFiles(files);});
  const spacer=document.createElement('span');spacer.className='social-spacer';
  this.count.className='social-count';this.count.setAttribute('aria-hidden','true');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','social-ring');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('role','presentation');
  svg.innerHTML=`<circle class="social-ring-track" cx="12" cy="12" r="10" fill="none" stroke-width="2.5"/><circle class="social-ring-arc" cx="12" cy="12" r="10" fill="none" stroke-width="2.5" stroke-linecap="round" transform="rotate(-90 12 12)" stroke-dasharray="${RING_LENGTH}" stroke-dashoffset="${RING_LENGTH}"/>`;
  this.ring=svg.querySelector('.social-ring-arc')!;
  this.submit.type='button';this.submit.className='ui-btn primary apps-pill social-publish';
  this.submit.addEventListener('click',()=>void this.send());
  foot.append(photo,this.file,spacer,this.count,svg,this.submit);
  this.helper.className='social-helper';this.helper.id=`composer-helper-${this.id}`;this.helper.setAttribute('aria-live','polite');
  this.el.append(ta,this.list,this.slot,foot,this.helper,this.live);
  this.update(true);
 }
 get text():string{return this.textarea.value;}
 get hasContent():boolean{return this.textarea.value.trim().length>0||this.uploads.length>0;}
 get mediaIds():string[]{return this.uploads.filter(u=>u.ready).map(u=>u.mediaId!);}
 get canPublish():boolean{
  const n=codePoints(this.textarea.value);
  return !this.sending&&n<=POST_MAX_CHARS&&this.uploads.every(u=>u.ready)&&(this.textarea.value.trim().length>0||this.uploads.length>0);
 }
 focus():void{this.textarea.focus();}
 setText(text:string):void{this.textarea.value=text;this.grow();this.update(true);}
 private grow():void{const ta=this.textarea;ta.style.height='auto';ta.style.height=`${Math.min(ta.scrollHeight,Math.round(innerHeight*0.4))}px`;}
 private addFiles(files:File[]):void {
  const room=POST_MAX_MEDIA-this.uploads.length;
  for(const file of files.slice(0,Math.max(0,room))){
   const item:UploadItem=new UploadItem(file,{
    purpose:'post',token:()=>this.options.ctx.token(),announce:text=>{this.live.textContent=text;},
    position:():{index:number;total:number}=>({index:this.uploads.indexOf(item)+1,total:this.uploads.length}),
    onChange:()=>{if(!this.disposed)this.update();this.options.onChange?.();},
    onRemove:removed=>{const at=this.uploads.indexOf(removed);if(at>=0)this.uploads.splice(at,1);for(const u of this.uploads)u.refreshLabel();this.update();this.options.onChange?.();(this.photoButton.hidden?this.textarea:this.photoButton).focus();},
    onFailure:failure=>this.onFailure(failure)
   });
   this.uploads.push(item);this.list.append(item.el);void item.start();
  }
  if(files.length>room)this.notice(`You can add up to ${POST_MAX_MEDIA} photos.`);
  this.update();this.options.onChange?.();
 }
 private onFailure(failure:UploadFailure):void {
  if(failure.code==='media_not_configured')this.mediaOff=true;
  if(failure.code==='unauthorized')this.options.ctx.signedOut();
  this.notice(failure.long);this.update();
 }
 private notice(text:string,alert=true):void {
  const p=document.createElement('p');p.className='apps-notice';p.setAttribute('role',alert?'alert':'status');
  p.innerHTML=appIcon('alert');p.append(document.createTextNode(text));this.slot.replaceChildren(p);
 }
 private update(initial=false):void {
  const n=codePoints(this.textarea.value),state=ringState(n);
  this.ring.setAttribute('stroke-dashoffset',String(ringOffset(n)));
  const svg=this.ring.ownerSVGElement!;svg.dataset.state=state;svg.style.visibility=n===0?'hidden':'visible';
  const remaining=POST_MAX_CHARS-n;
  this.count.textContent=n>260?String(remaining):'';this.count.dataset.state=state;
  this.count.setAttribute('data-n',String(n));
  this.submit.textContent=this.sending?'Publishing…':this.options.replyTo?'Reply':'Publish';
  this.submit.disabled=!this.canPublish;
  const mediaOn=this.options.ctx.mediaEnabled()&&!this.mediaOff;
  this.photoButton.hidden=!mediaOn||this.uploads.length>=POST_MAX_MEDIA;
  this.textarea.setAttribute('data-ring',state);
  if(initial)this.helper.textContent='';
  this.scheduleHelper();
 }
 private helperText():{text:string;danger:boolean}{
  const n=codePoints(this.textarea.value),over=n-POST_MAX_CHARS;
  if(over>0)return {text:`Too long by ${over} ${over===1?'character':'characters'}`,danger:true};
  if(this.uploads.some(u=>u.stage!=='ready'&&u.stage!=='failed')||this.uploads.some(u=>u.stage==='failed'))return {text:'Wait for photos to finish uploading',danger:false};
  if(n>260)return {text:`${POST_MAX_CHARS-n} characters left`,danger:false};
  if(this.attempted&&!this.hasContent)return {text:'Write something or add a photo',danger:false};
  return {text:'',danger:false};
 }
 /** The helper line is polite and updates at most once a second. */
 private scheduleHelper():void {
  const apply=()=>{this.helperTimer=undefined;this.helperAt=Date.now();const {text,danger}=this.helperText();this.helper.textContent=text;this.helper.classList.toggle('is-danger',danger);};
  if(this.helperTimer!==undefined)return;
  const wait=Math.max(0,1000-(Date.now()-this.helperAt));
  if(wait===0)apply();else this.helperTimer=window.setTimeout(apply,wait);
 }
 async send():Promise<void> {
  this.attempted=true;
  if(!this.canPublish){this.update();return;}
  const text=this.textarea.value;
  this.sending=true;this.slot.replaceChildren();this.update();
  try{
   const post=await this.options.ctx.client.createPost(text,this.mediaIds,this.options.replyTo?.id);
   if(this.disposed)return;
   this.sending=false;this.options.onPosted(post);
  }catch(error){
   if(this.disposed)return;
   this.sending=false;
   if(error instanceof ApiError&&error.status===401){this.options.ctx.signedOut();return;}
   if(error instanceof ApiError&&error.code==='media_expired'){for(const item of this.uploads)if(item.ready)item.markFailed(error.message,error.code);this.notice(error.message);this.update();return;}
   this.notice(error instanceof ApiError&&error.status===429?error.message:"Couldn't publish. Your post is still here, so you can try again.");
   this.update();
  }
 }
 dispose():void {
  this.disposed=true;
  if(this.helperTimer!==undefined)clearTimeout(this.helperTimer);
  for(const u of this.uploads)u.dispose();this.uploads.length=0;this.el.remove();
 }
}
