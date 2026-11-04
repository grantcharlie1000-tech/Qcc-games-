import type {Page,PostView} from '../shared';
import type {SocialContext} from '../context';
import {isAuthError} from '../context';
import {PostCard,type PostCardOptions} from './post-card';
import {skeletonPosts,loadFailed} from './states';

export interface PostListOptions {
 ctx:SocialContext;label:string;
 load:(cursor:string|null,signal:AbortSignal)=>Promise<Page<PostView>>;
 empty:()=>HTMLElement;
 card?:Partial<PostCardOptions>;
 /** Skeleton and status text. */
 loading?:string;
}
/** A feed of post cards with infinite scroll (IntersectionObserver on a sentinel), a "Show more posts" fallback and an end line. */
export class PostList {
 readonly el=document.createElement('div');
 readonly feed=document.createElement('div');
 private readonly cards=new Map<string,PostCard>();
 private readonly more=document.createElement('button');
 private readonly sentinel=document.createElement('div');
 private readonly end=document.createElement('p');
 private status=document.createElement('div');
 private cursor:string|null=null;
 private busy=false;
 private done=false;
 private observer:IntersectionObserver|undefined;
 private controller:AbortController|undefined;
 private disposed=false;
 private emptyEl:HTMLElement|null=null;
 constructor(private readonly options:PostListOptions) {
  this.el.className='social-list';
  this.feed.className='social-feed';this.feed.setAttribute('role','feed');this.feed.setAttribute('aria-label',options.label);this.feed.setAttribute('aria-busy','true');
  this.more.type='button';this.more.className='ui-btn secondary apps-pill social-more-posts';this.more.textContent='Show more posts';this.more.hidden=true;
  this.more.addEventListener('click',()=>void this.loadMore());
  this.sentinel.className='social-sentinel';this.sentinel.setAttribute('aria-hidden','true');
  this.end.className='apps-end';this.end.textContent="You're all caught up.";this.end.hidden=true;
  this.el.append(this.feed,this.status,this.more,this.sentinel,this.end);
  this.status.className='social-list-status';
 }
 get ids():Set<string>{return new Set(this.cards.keys());}
 get firstPost():PostView|undefined{const first=this.feed.querySelector<HTMLElement>('.social-post');return first?this.cards.get(first.dataset.id!)?.post:undefined;}
 get count():number{return this.cards.size;}
 card(id:string):PostCard|undefined{return this.cards.get(id);}
 async start():Promise<void> {
  this.controller?.abort();const controller=this.controller=new AbortController();
  this.feed.replaceChildren();this.disposeCards();this.status.replaceChildren(skeletonPosts(6,this.options.loading));this.more.hidden=true;this.end.hidden=true;this.done=false;this.cursor=null;
  this.feed.setAttribute('aria-busy','true');
  try{
   const page=await this.options.load(null,controller.signal);
   if(controller.signal.aborted||this.disposed)return;
   this.status.replaceChildren();this.cursor=page.cursor;this.append(page.items);this.afterLoad();this.observe();
  }catch(error){
   if(controller.signal.aborted||this.disposed)return;
   this.feed.setAttribute('aria-busy','false');
   this.status.replaceChildren(loadFailed(error,()=>void this.start()));
   if(isAuthError(error))this.options.ctx.signedOut();
  }
 }
 private afterLoad():void {
  this.feed.setAttribute('aria-busy','false');
  this.emptyEl?.remove();this.emptyEl=null;
  if(this.cards.size===0){this.emptyEl=this.options.empty();this.el.insertBefore(this.emptyEl,this.status);this.more.hidden=true;this.end.hidden=true;return;}
  this.more.hidden=this.cursor===null;this.end.hidden=this.cursor!==null;this.done=this.cursor===null;
 }
 private make(post:PostView):PostCard {
  const card=new PostCard(this.options.ctx,post,{...this.options.card,position:this.cards.size+1,onRemoved:(removed,reason)=>this.remove(removed.id,reason)});
  this.cards.set(post.id,card);return card;
 }
 private append(posts:PostView[]):void {
  for(const post of posts){if(this.cards.has(post.id))continue;this.feed.append(this.make(post).el);}
 }
 /** New posts above the first one. Returns the first new card. */
 prepend(posts:PostView[],animate=false):PostCard|undefined {
  const fresh=posts.filter(post=>!this.cards.has(post.id));
  const made=fresh.map(post=>this.make(post));
  const first=this.feed.firstChild;
  for(const card of made)this.feed.insertBefore(card.el,first);
  if(animate&&made[0])made[0].enter();
  this.afterLoad();
  return made[0];
 }
 remove(id:string,_reason?:string):void {
  const card=this.cards.get(id);if(!card)return;
  card.el.remove();card.dispose();this.cards.delete(id);this.afterLoad();
 }
 private observe():void {
  this.observer?.disconnect();
  if(typeof IntersectionObserver==='undefined')return;
  this.observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))void this.loadMore();},{root:this.options.ctx.scroller,rootMargin:'0px 0px 150% 0px'});
  this.observer.observe(this.sentinel);
 }
 async loadMore():Promise<void> {
  if(this.busy||this.done||!this.cursor||this.disposed)return;
  this.busy=true;this.more.disabled=true;
  const controller=this.controller??=new AbortController();
  try{
   const page=await this.options.load(this.cursor,controller.signal);
   if(controller.signal.aborted||this.disposed)return;
   this.cursor=page.cursor;this.append(page.items);this.afterLoad();
  }catch(error){
   if(controller.signal.aborted||this.disposed)return;
   this.options.ctx.fail(error,"Couldn't load more posts.",()=>void this.loadMore());
  }finally{this.busy=false;this.more.disabled=false;}
 }
 private disposeCards():void{for(const card of this.cards.values())card.dispose();this.cards.clear();}
 dispose():void {
  this.disposed=true;this.controller?.abort();this.observer?.disconnect();this.observer=undefined;this.disposeCards();this.el.remove();
 }
}
