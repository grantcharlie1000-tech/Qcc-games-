import {avatar} from '../../apps/avatar';
import type {SocialContext,Screen} from '../context';
import {isAuthError} from '../context';
import type {Page,PostView} from '../shared';
import type {ThreadView} from '../client';
import {PostCard} from '../components/post-card';
import {Composer} from '../components/composer';
import {skeletonPosts,loadFailed} from '../components/states';

const roomy=()=>typeof matchMedia==='function'&&matchMedia('(min-width:640px)').matches;

/** `#/social/post/<id>` (DESIGN 5.5): ancestors, the focused post, a reply prompt and paged replies. */
export class ThreadScreen implements Screen {
 private readonly controller=new AbortController();
 private readonly cards:PostCard[]=[];
 private focused:PostCard|undefined;
 private replies=document.createElement('div');
 private moreButton:HTMLButtonElement|undefined;
 private cursor:string|null=null;
 private composer:Composer|undefined;
 private disposed=false;
 private root=document.createElement('div');
 private target:HTMLElement|null=null;
 constructor(private readonly ctx:SocialContext,private readonly column:HTMLElement,private readonly id:string) {
  this.root.className='social-thread';column.append(this.root);
  this.root.append(skeletonPosts(3,'Loading post…'));
  void this.load();
 }
 focusTarget():HTMLElement|null{return this.target;}
 private async load():Promise<void> {
  try{
   const thread=await this.ctx.client.thread(this.id,this.controller.signal);
   if(this.disposed)return;
   this.render(thread);
  }catch(error){
   if(this.disposed||this.controller.signal.aborted)return;
   if(isAuthError(error)){this.ctx.signedOut();return;}
   const status=(error as {status?:number}).status;
   if(status===404){
    const gone=document.createElement('div');gone.className='apps-empty';
    gone.innerHTML='<div class="social-gone-card"><span class="social-avatar is-ghost" aria-hidden="true"></span><p class="social-gone"></p></div>';
    gone.querySelector('.social-gone')!.textContent='This post is unavailable';
    const back=document.createElement('a');back.className='ui-btn secondary apps-pill';back.href='#/social';back.textContent='Back to feed';gone.append(back);
    this.root.replaceChildren(gone);return;
   }
   this.root.replaceChildren(loadFailed(error,()=>{this.root.replaceChildren(skeletonPosts(3,'Loading post…'));void this.load();}));
  }
 }
 private render(thread:ThreadView):void {
  const h1=document.createElement('h1');h1.className='apps-title-sm';h1.textContent='Post';h1.tabIndex=-1;
  this.root.replaceChildren(h1);
  for(const post of thread.ancestors){const card=new PostCard(this.ctx,post,{variant:'ancestor',onRemoved:()=>this.ctx.refresh()});this.cards.push(card);this.root.append(card.el);}
  const focused=this.focused=new PostCard(this.ctx,thread.post,{variant:'focused',onReply:()=>this.reply(),onRemoved:(post,reason)=>{if(reason==='deleted')this.ctx.go(thread.post.replyTo?`#/social/post/${thread.post.replyTo}`:'#/social');}});
  this.cards.push(focused);this.root.append(focused.el);this.target=focused.el;
  this.root.append(this.promptRow(),this.replies);
  this.replies.className='social-replies';this.replies.setAttribute('role','feed');this.replies.setAttribute('aria-label','Replies');
  this.appendReplies(thread.replies);
  requestAnimationFrame(()=>{if(!this.disposed)focused.el.scrollIntoView({block:'start'});});
 }
 private promptRow():HTMLElement {
  const row=document.createElement('div');row.className='social-reply-row';
  const me=this.ctx.me();
  if(me)row.append(avatar(me.profile,32));
  const prompt=document.createElement('button');prompt.type='button';prompt.className='social-reply-prompt';prompt.textContent='Write a reply';
  prompt.addEventListener('click',()=>this.reply(row,prompt));
  row.append(prompt);return row;
 }
 private reply(row?:HTMLElement,prompt?:HTMLElement):void {
  const post=this.focused!.post;
  if(!roomy()){this.ctx.openCompose({replyTo:post,trigger:prompt??null});return;}
  row??=this.root.querySelector<HTMLElement>('.social-reply-row')!;
  if(this.composer){this.composer.focus();return;}
  const composer=this.composer=new Composer({ctx:this.ctx,replyTo:post,onPosted:reply=>{composer.dispose();this.composer=undefined;row!.querySelector<HTMLElement>('.social-reply-prompt')!.hidden=false;this.posted(reply);this.ctx.announce('Post published.');}});
  row.querySelector<HTMLElement>('.social-reply-prompt')!.hidden=true;row.append(composer.el);composer.focus();
 }
 private appendReplies(page:Page<PostView>):void {
  this.cursor=page.cursor;
  const known=new Set(this.cards.map(c=>c.post.id));
  for(const post of page.items){
   if(known.has(post.id))continue;
   const card=new PostCard(this.ctx,post,{variant:'reply',position:this.cards.length,onRemoved:(removed)=>{card.el.remove();card.dispose();this.focused?.bumpReplies(-1);}});
   this.cards.push(card);this.replies.append(card.el);
  }
  this.moreButton?.remove();this.moreButton=undefined;
  if(this.cursor){
   const more=this.moreButton=document.createElement('button');more.type='button';more.className='ui-btn secondary apps-pill social-more-posts';more.textContent='Show more replies';
   more.addEventListener('click',()=>void this.more());this.replies.after(more);
  }else if(!this.replies.children.length){
   const none=document.createElement('p');none.className='social-no-replies';none.textContent='No replies yet.';this.replies.append(none);
  }
 }
 private async more():Promise<void> {
  if(!this.cursor||!this.moreButton)return;
  this.moreButton.disabled=true;
  try{const page=await this.ctx.client.api.get<ThreadView>('thread',{id:this.id,cursor:this.cursor},this.controller.signal);if(!this.disposed)this.appendReplies(page.replies);}
  catch(error){if(this.disposed||this.controller.signal.aborted)return;if(this.moreButton)this.moreButton.disabled=false;this.ctx.fail(error,"Couldn't load more replies.",()=>void this.more());}
 }
 posted(reply:PostView):void {
  if(reply.replyTo!==this.id)return;
  this.replies.querySelector('.social-no-replies')?.remove();
  const card=new PostCard(this.ctx,reply,{variant:'reply',position:this.cards.length,onRemoved:()=>{card.el.remove();card.dispose();this.focused?.bumpReplies(-1);}});
  this.cards.push(card);this.replies.prepend(card.el);card.enter();card.el.focus({preventScroll:true});
  this.focused?.bumpReplies(1);
 }
 dispose():void {
  this.disposed=true;this.controller.abort();this.composer?.dispose();for(const card of this.cards)card.dispose();this.cards.length=0;this.root.remove();
 }
}
