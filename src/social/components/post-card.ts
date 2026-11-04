import {appIcon} from '../../apps/icons';
import {avatar} from '../../apps/avatar';
import {renderRichText,relativeTime} from '../../apps/text';
import {compactCount,fullTime} from '../../apps/format';
import {motion,EASE_OUT} from '../../apps/motion';
import {confirmSheet,reportSheet} from '../../apps/sheets';
import {ApiError} from '../../apps/api';
import type {SocialContext} from '../context';
import type {PostView} from '../shared';
import {mediaGrid} from './media-grid';
import {openMenu} from './menus';

export type PostVariant='feed'|'focused'|'ancestor'|'reply';
export interface PostCardOptions {
 variant?:PostVariant;position?:number;
 /** The post was deleted or its author was blocked; the screen decides how to react. */
 onRemoved?:(post:PostView,reason:'deleted'|'blocked')=>void;
 onReply?:(post:PostView)=>void;
}
const cards=new WeakMap<HTMLElement,PostCard>();
export const cardOf=(el:Element|null):PostCard|undefined=>{const article=el?.closest<HTMLElement>('article.social-post');return article?cards.get(article):undefined;};
let serial=0;
export const postLink=(id:string):string=>`${location.origin}${location.pathname}#/social/post/${id}`;

/** One post. Owns its optimistic like (with rollback), the count roll and the like pulse; everything it paints from user text goes through textContent or renderRichText. */
export class PostCard {
 readonly el=document.createElement('article');
 private likeButton!:HTMLButtonElement;
 private countBox!:HTMLElement;
 private likeIcon!:HTMLElement;
 private running:Animation[]=[];
 private likeSeq=0;
 private readonly live=()=>this.ctx.reduced();
 constructor(private readonly ctx:SocialContext,public post:PostView,private readonly options:PostCardOptions={}) {
  cards.set(this.el,this);
  this.build();
 }
 get variant():PostVariant{return this.options.variant??'feed';}
 private build():void {
  const {post,el}=this,variant=this.variant,id=++serial;
  el.className=`social-post is-${variant}`;el.dataset.id=post.id;el.tabIndex=-1;
  if(this.options.position)el.setAttribute('aria-posinset',String(this.options.position));
  if(variant==='feed'||variant==='reply')el.setAttribute('aria-setsize','-1');
  if(post.deleted){this.buildTombstone();return;}
  el.setAttribute('aria-labelledby',`sp-name-${id}`);el.setAttribute('aria-describedby',`sp-body-${id}`);
  const author=post.author,href=`#/social/u/${encodeURIComponent(author.username)}`;
  const side=document.createElement('a');side.className='social-avatar';side.href=href;side.tabIndex=-1;side.setAttribute('aria-hidden','true');side.append(avatar(author,44));
  const main=document.createElement('div');main.className='social-post-main';
  const head=document.createElement('div');head.className='social-head';
  const name=document.createElement('a');name.className='social-name';name.id=`sp-name-${id}`;name.href=href;name.textContent=author.displayName||author.username;
  const handle=document.createElement('a');handle.className='social-handle';handle.href=href;handle.textContent=`@${author.username}`;
  const time=document.createElement('time');time.className='social-time';time.dateTime=post.createdAt;time.title=fullTime(post.createdAt);time.textContent=relativeTime(post.createdAt);
  const dot=document.createElement('span');dot.className='social-dot';dot.textContent='·';dot.setAttribute('aria-hidden','true');
  const more=document.createElement('button');more.type='button';more.className='apps-icon-btn social-more';more.setAttribute('aria-label','More options for this post');more.setAttribute('aria-haspopup','menu');more.innerHTML=appIcon('more');
  more.addEventListener('click',event=>{event.stopPropagation();this.openMore(more);});
  if(variant==='focused'){head.classList.add('is-stacked');head.append(name,handle,more);}else head.append(name,handle,dot,time,more);
  main.append(head);
  if(variant==='feed'&&post.replyTo&&post.replyToUsername){
   const replying=document.createElement('p');replying.className='social-replying';replying.append('Replying to ');
   const link=document.createElement('a');link.href=`#/social/u/${encodeURIComponent(post.replyToUsername)}`;link.textContent=`@${post.replyToUsername}`;replying.append(link);main.append(replying);
  }
  if(post.hidden&&post.mine){
   const flag=document.createElement('div');flag.className='social-flag';flag.innerHTML=appIcon('alert');flag.append('Hidden while reviewed. Only you can see this post.');main.append(flag);
  }
  if(post.body){
   const body=document.createElement('p');body.className='social-body';body.id=`sp-body-${id}`;
   body.append(renderRichText(post.body.replace(/\n{3,}/g,'\n\n')));main.append(body);
  }else{const hidden=document.createElement('span');hidden.id=`sp-body-${id}`;hidden.className='sr-only';hidden.textContent=post.media.length?'Photo post':'';main.append(hidden);}
  if(post.media.length)main.append(mediaGrid(post.media,(index,tile)=>this.ctx.openPhotos(post.media,index,tile)));
  if(variant==='focused'){
   const stamp=document.createElement('time');stamp.className='social-stamp';stamp.dateTime=post.createdAt;stamp.textContent=fullTime(post.createdAt);main.append(stamp);
   const counts=document.createElement('div');counts.className='social-counts';counts.setAttribute('aria-live','off');
   counts.innerHTML=`<span><strong data-n="replies"></strong> <span data-w="replies"></span></span><span><strong data-n="likes"></strong> <span data-w="likes"></span></span>`;main.append(counts);
  }
  main.append(this.buildActions());
  if(variant==='focused'){head.prepend(side);el.append(main);}else el.append(side,main);
  this.syncText();
  if(variant==='feed'||variant==='reply')el.addEventListener('click',event=>this.onClick(event));
  el.addEventListener('keydown',event=>{
   if(event.target!==el||event.altKey||event.ctrlKey||event.metaKey)return;
   if(event.key==='Enter'&&variant!=='focused'){event.preventDefault();this.open();}
  });
 }
 private buildTombstone():void {
  const {el}=this;
  el.classList.add('is-deleted');
  el.innerHTML=`<span class="social-avatar is-ghost" aria-hidden="true"></span><div class="social-post-main"><p class="social-gone"></p></div>`;
  el.querySelector('.social-gone')!.textContent='This post was deleted';
 }
 private buildActions():HTMLElement {
  const row=document.createElement('div');row.className='social-actions';row.setAttribute('role','group');row.setAttribute('aria-label','Post actions');
  const reply=document.createElement('button');reply.type='button';reply.className='social-action is-reply';reply.dataset.action='reply';
  reply.innerHTML=`${appIcon('reply')}<span class="social-n" data-n="replies"></span>`;
  reply.addEventListener('click',event=>{event.stopPropagation();this.reply();});
  const like=this.likeButton=document.createElement('button');like.type='button';like.className='social-action is-like';like.dataset.action='like';
  like.innerHTML=`<span class="social-like-icon"><span class="social-ring-pulse" aria-hidden="true"></span><span class="social-like-glyph">${appIcon(this.post.liked?'like-filled':'like')}</span></span><span class="social-n social-roll" data-n="likes"><span class="cur"></span></span>`;
  this.likeIcon=like.querySelector<HTMLElement>('.social-like-icon')!;this.countBox=like.querySelector<HTMLElement>('.social-roll')!;
  like.addEventListener('click',event=>{event.stopPropagation();void this.toggleLike(false);});
  const share=document.createElement('button');share.type='button';share.className='social-action is-share';share.setAttribute('aria-label','Share post');share.innerHTML=appIcon('share');
  share.addEventListener('click',event=>{event.stopPropagation();void this.share();});
  row.append(reply,like,share);return row;
 }
 /** Counts, labels and pressed state from this.post. */
 private syncText():void {
  const {post}=this;
  if(post.deleted)return;
  const set=(key:string,text:string,title:string)=>{for(const node of this.el.querySelectorAll<HTMLElement>(`.social-n[data-n=${key}]:not(.social-roll)`)){node.textContent=text;node.title=title;}};
  set('replies',post.replies?compactCount(post.replies):'',String(post.replies));
  this.el.querySelector<HTMLElement>('.is-reply')!.setAttribute('aria-label',`Reply, ${post.replies} ${post.replies===1?'reply':'replies'}`);
  const cur=this.countBox.querySelector<HTMLElement>('.cur')!;
  if(!this.countBox.querySelector('.old'))cur.textContent=post.likes?compactCount(post.likes):'';
  this.countBox.title=String(post.likes);
  this.setLikeState();
  const strong=(key:string,n:number,one:string,many:string)=>{
   const num=this.el.querySelector<HTMLElement>(`strong[data-n=${key}]`),word=this.el.querySelector<HTMLElement>(`[data-w=${key}]`);
   if(num&&word){num.textContent=compactCount(n);word.textContent=n===1?one:many;}
  };
  strong('replies',post.replies,'reply','replies');strong('likes',post.likes,'like','likes');
 }
 private setLikeState():void {
  const {post}=this,button=this.likeButton;
  button.setAttribute('aria-pressed',String(post.liked));
  button.setAttribute('aria-label',`Like, ${post.likes} ${post.likes===1?'like':'likes'}`);
  button.classList.toggle('is-on',post.liked);
  const glyph=button.querySelector('.social-like-glyph')!;
  const want=post.liked?'like-filled':'like';
  if(glyph.getAttribute('data-icon')!==want){glyph.innerHTML=appIcon(want);glyph.setAttribute('data-icon',want);}
 }
 /** Sets the visible like state at once (optimistic), with the count roll and pulse when `animate`. */
 private apply(liked:boolean,likes:number,animate:boolean):void {
  const previous=this.post.likes;
  this.post={...this.post,liked,likes:Math.max(0,likes)};
  for(const a of this.running)a.cancel();this.running=[];
  this.countBox.querySelector('.old')?.remove();
  const cur=this.countBox.querySelector<HTMLElement>('.cur')!;
  const before=cur.textContent??'';
  this.syncText();
  const after=cur.textContent??'';
  if(!animate||before===after||Math.abs(this.post.likes-previous)!==1)return;
  const up=this.post.likes>previous;
  const old=document.createElement('span');old.className='old';old.textContent=before;old.setAttribute('aria-hidden','true');this.countBox.append(old);
  const roll=(el:HTMLElement,from:string,to:string,fade:[number,number])=>motion(el,[{transform:`translateY(${from})`,opacity:fade[0]},{transform:`translateY(${to})`,opacity:fade[1]}],{duration:160,easing:EASE_OUT},this.live);
  const a=roll(cur,up?'100%':'-100%','0',[0,1]),b=roll(old,'0',up?'-100%':'100%',[1,0]);
  if(!a||!b){old.remove();return;}
  this.running.push(a,b);
  b.finished.then(()=>old.remove(),()=>old.remove());
 }
 private pulse():void {
  const icon=this.likeIcon.querySelector<HTMLElement>('.social-like-glyph')!,ring=this.likeIcon.querySelector<HTMLElement>('.social-ring-pulse')!;
  const a=motion(icon,[{transform:'scale(.8)'},{transform:'scale(1)'}],{duration:180,easing:EASE_OUT},this.live);
  const b=motion(ring,[{transform:'scale(.6)',opacity:.5},{transform:'scale(1.25)',opacity:0}],{duration:280,easing:EASE_OUT},this.live);
  for(const x of [a,b])if(x)this.running.push(x);
 }
 /** Optimistic like. Sends the intended state, not a delta; rolls back on failure. Keyboard use gets no motion (DESIGN 12.1 row 3). */
 async toggleLike(keyboard:boolean):Promise<void> {
  const before=this.post,want=!before.liked,seq=++this.likeSeq;
  this.apply(want,before.likes+(want?1:-1),!keyboard);
  if(want&&!keyboard)this.pulse();
  try{
   const result=await this.ctx.client.like(before.id,want);
   if(seq!==this.likeSeq)return;
   if(result.likes!==this.post.likes||result.liked!==this.post.liked)this.apply(result.liked,result.likes,false);
  }catch(error){
   if(seq!==this.likeSeq)return;
   this.apply(before.liked,before.likes,false);
   if(error instanceof ApiError&&error.status===429)this.ctx.notify(error.message,{role:'alert'});
   else this.ctx.fail(error,"Couldn't like that. Try again.",()=>void this.toggleLike(false));
  }
 }
 reply():void{if(this.options.onReply)this.options.onReply(this.post);else this.ctx.openCompose({replyTo:this.post,trigger:this.el.querySelector('[data-action=reply]')});}
 open():void{if(this.post.deleted)return;this.ctx.go(`#/social/post/${this.post.id}`);}
 private onClick(event:MouseEvent):void {
  const target=event.target as Element;
  if(target.closest('a,button,.social-media'))return;
  const selection=getSelection();if(selection&&!selection.isCollapsed)return;
  this.open();
 }
 private async share():Promise<void> {
  const url=postLink(this.post.id);
  const nav=navigator as Navigator&{share?:(data:{url:string})=>Promise<void>};
  if(typeof nav.share==='function'){try{await nav.share({url});}catch{/* cancelled */}return;}
  try{await navigator.clipboard.writeText(url);this.ctx.notify('Link copied');}catch{this.ctx.notify(`Copy this link: ${url}`);}
 }
 private openMore(trigger:HTMLElement):void {
  const {post,ctx}=this,username=post.author.username;
  const items=[] as Parameters<typeof openMenu>[2];
  if(post.mine)items.push({label:'Delete post',icon:'trash',danger:true,run:()=>void this.deletePost(trigger)});
  else{
   items.push({label:'Report post',icon:'report',run:()=>void this.report(trigger)});
   items.push({label:`Block @${username}`,icon:'block',danger:true,run:()=>void this.blockAuthor(trigger)});
  }
  items.push({label:'Copy link',icon:'share',run:()=>void navigator.clipboard.writeText(postLink(post.id)).then(()=>ctx.notify('Link copied'),()=>ctx.notify(`Copy this link: ${postLink(post.id)}`))});
  openMenu(trigger,'Post options',items,ctx.scroller);
 }
 private async deletePost(trigger:Element):Promise<void> {
  const ok=await confirmSheet({title:'Delete this post?',text:'If it has replies, it shows as "This post was deleted" so the thread still makes sense.',confirm:'Delete',danger:true,trigger});
  if(!ok)return;
  try{await this.ctx.client.deletePost(this.post.id);this.ctx.notify('Post deleted.');this.ctx.announce('Post deleted.');this.options.onRemoved?.(this.post,'deleted');if(!this.options.onRemoved)this.el.remove();}
  catch(error){this.ctx.fail(error,"Couldn't delete that post. Try again.",()=>void this.deletePost(trigger));}
 }
 private async blockAuthor(trigger:Element):Promise<void> {
  const username=this.post.author.username;
  const ok=await confirmSheet({title:`Block @${username}?`,text:"You won't see each other's posts or profiles, follows between you are removed, and you'll stop being friends in Chat. They won't be told.",confirm:'Block',danger:true,trigger});
  if(!ok)return;
  try{await this.ctx.client.block(username,true);this.ctx.notify(`Blocked @${username}.`);this.options.onRemoved?.(this.post,'blocked');this.ctx.refresh();}
  catch(error){this.ctx.fail(error,`Couldn't block @${username}. Try again.`,()=>void this.blockAuthor(trigger));}
 }
 private async report(trigger:Element):Promise<void> {
  const {post,ctx}=this;
  await reportSheet({title:'Report post',intro:'Tell us what\'s wrong. QCC moderators will look at it.',trigger,onUnauthorized:()=>ctx.signedOut(),
   submit:async(category,note)=>{await ctx.client.report({kind:'post',id:post.id,category,...(note?{note}:{})});},
   block:{username:post.author.username,run:async()=>{await ctx.client.block(post.author.username,true);ctx.notify(`Blocked @${post.author.username}.`);ctx.refresh();}}});
 }
 /** A reply was added or removed under this post. */
 bumpReplies(by:number):void{this.post={...this.post,replies:Math.max(0,this.post.replies+by)};if(!this.post.deleted)this.syncText();}
 /** Entry motion for an own new post (DESIGN 12.1 row 10). */
 enter():void{motion(this.el,[{opacity:0,transform:'translateY(-6px)'},{opacity:1,transform:'none'}],{duration:200,easing:EASE_OUT},this.live);}
 dispose():void{for(const a of this.running)a.cancel();this.running=[];cards.delete(this.el);}
}
