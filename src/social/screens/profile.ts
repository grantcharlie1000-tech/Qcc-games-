import {appIcon} from '../../apps/icons';
import {mediaUrl} from '../../media/client';
import type {SocialContext,Screen} from '../context';
import {isAuthError} from '../context';
import type {PostsKind} from '../client';
import type {ProfileView} from '../shared';
import {ProfileHeader} from '../components/profile-header';
import {PostList} from '../components/post-list';
import {emptyState,loadFailed,skeletonPosts} from '../components/states';

export type ProfileTab='posts'|'replies'|'photos'|'likes';
const KIND:Record<ProfileTab,PostsKind>={posts:'posts',replies:'replies',photos:'media',likes:'likes'};
const LABEL:Record<ProfileTab,string>={posts:'Posts',replies:'Replies',photos:'Photos',likes:'Likes'};
export const tabFromHash=(part:string|undefined):ProfileTab=>part==='replies'?'replies':part==='photos'||part==='media'?'photos':part==='likes'?'likes':'posts';
export const profileHash=(username:string,tab:ProfileTab):string=>`#/social/u/${encodeURIComponent(username)}${tab==='posts'?'':'/'+tab}`;

/** `#/social/u/<username>[/replies|/photos|/likes]` (DESIGN 5.7). */
export class ProfileScreen implements Screen {
 private readonly controller=new AbortController();
 private list:PostList|undefined;
 private tabs:HTMLElement|undefined;
 private panel=document.createElement('div');
 private tab:ProfileTab;
 private profile:ProfileView|undefined;
 private disposed=false;
 private root=document.createElement('div');
 private target:HTMLElement|null=null;
 constructor(private readonly ctx:SocialContext,column:HTMLElement,private readonly username:string,tab:ProfileTab) {
  this.tab=tab;this.root.className='social-profile';column.append(this.root);
  this.root.append(skeletonPosts(3,'Loading profile…'));
  void this.load();
 }
 focusTarget():HTMLElement|null{return this.target;}
 get shown():ProfileView|undefined{return this.profile;}
 private async load():Promise<void> {
  try{
   const profile=await this.ctx.client.profile(this.username,this.controller.signal);
   if(this.disposed)return;
   this.profile=profile;this.render(profile);
  }catch(error){
   if(this.disposed||this.controller.signal.aborted)return;
   if(isAuthError(error)){this.ctx.signedOut();return;}
   if((error as {status?:number}).status===404){await this.unavailable();return;}
   this.root.replaceChildren(loadFailed(error,()=>{this.root.replaceChildren(skeletonPosts(3,'Loading profile…'));void this.load();}));
  }
 }
 /** The server answers 404 for blocks in either direction; the blocked list tells "I blocked them" apart without leaking the other case. */
 private async unavailable():Promise<void> {
  let mine=false;
  try{mine=(await this.ctx.client.blocks(this.controller.signal)).users.some(u=>u.username.toLowerCase()===this.username.toLowerCase());}catch{/* treat as unavailable */}
  if(this.disposed)return;
  const wrap=document.createElement('div');wrap.className='social-profile-blocked';
  if(mine){
   const box=emptyState({icon:'block',title:`You blocked @${this.username}`,text:"You won't see each other's posts. Unblocking doesn't restore follows.",action:{label:'Unblock',run:()=>void this.unblock(),primary:false}});
   wrap.append(box);
  }else wrap.append(emptyState({icon:'info',title:'This account is unavailable'}));
  this.root.replaceChildren(wrap);
  this.target=wrap.querySelector('h2');this.target?.setAttribute('tabindex','-1');
 }
 private async unblock():Promise<void> {
  try{await this.ctx.client.block(this.username,false);this.ctx.notify(`Unblocked @${this.username}. Follows aren't restored.`);this.ctx.refresh();}
  catch(error){this.ctx.fail(error,`Couldn't unblock @${this.username}. Try again.`,()=>void this.unblock());}
 }
 private render(profile:ProfileView):void {
  const header=new ProfileHeader(this.ctx,profile,()=>{});
  this.root.replaceChildren(header.el);
  this.target=header.el.querySelector('h1');
  const tabs:ProfileTab[]=profile.mine?['posts','replies','photos','likes']:['posts','replies','photos'];
  if(!tabs.includes(this.tab))this.tab='posts';
  const bar=this.tabs=document.createElement('div');bar.className='apps-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Profile sections');
  for(const t of tabs){
   const b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.id=`profile-tab-${t}`;b.dataset.tab=t;b.textContent=LABEL[t];b.setAttribute('aria-controls','profile-panel');
   b.addEventListener('click',()=>this.select(t,true));
   b.addEventListener('keydown',event=>{
    const at=tabs.indexOf(t);let to=-1;
    if(event.key==='ArrowRight')to=(at+1)%tabs.length;else if(event.key==='ArrowLeft')to=(at-1+tabs.length)%tabs.length;else if(event.key==='Home')to=0;else if(event.key==='End')to=tabs.length-1;
    if(to>=0){event.preventDefault();this.select(tabs[to]!,true);bar.querySelector<HTMLElement>(`[data-tab=${tabs[to]}]`)!.focus();}
   });
   bar.append(b);
  }
  const indicator=document.createElement('span');indicator.className='apps-tab-indicator';indicator.setAttribute('aria-hidden','true');bar.append(indicator);
  bar.style.setProperty('--tabs',String(tabs.length));
  this.panel.className='social-profile-panel';this.panel.id='profile-panel';this.panel.setAttribute('role','tabpanel');
  this.root.append(bar,this.panel);
  this.select(this.tab,false);
 }
 private select(tab:ProfileTab,user:boolean):void {
  this.tab=tab;const profile=this.profile!;
  for(const b of this.tabs!.querySelectorAll<HTMLElement>('[role=tab]')){
   const on=b.dataset.tab===tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;
   if(on){this.tabs!.style.setProperty('--tab-index',String([...this.tabs!.querySelectorAll('[role=tab]')].indexOf(b)));this.panel.setAttribute('aria-labelledby',b.id);}
  }
  if(user)history.replaceState(null,'',location.pathname+location.search+profileHash(profile.username,tab));
  this.list?.dispose();this.list=undefined;this.panel.replaceChildren();
  const label=LABEL[tab],empty=()=>emptyState({title:tab==='posts'?'No posts yet':tab==='replies'?'No replies yet':tab==='photos'?'No photos yet':'No likes yet'});
  const list=this.list=new PostList({ctx:this.ctx,label,loading:'Loading posts…',empty,
   card:tab==='photos'?undefined:undefined,
   load:(cursor,signal)=>this.ctx.client.posts(profile.username,KIND[tab],cursor,signal)});
  if(tab==='photos')this.panel.classList.add('is-photos');else this.panel.classList.remove('is-photos');
  if(tab==='photos'){this.photoGrid(profile);return;}
  this.list=list;this.panel.append(list.el);void list.start();
 }
 /** Photos tab: a 3-column grid of tiles that each link to their post. */
 private photoGrid(profile:ProfileView):void {
  this.list=undefined;
  const grid=document.createElement('div');grid.className='social-photo-grid';
  const status=document.createElement('div');this.panel.append(grid,status);
  let cursor:string|null=null,busy=false;
  const more=document.createElement('button');more.type='button';more.className='ui-btn secondary apps-pill social-more-posts';more.textContent='Show more posts';more.hidden=true;
  more.addEventListener('click',()=>void load());
  this.panel.append(more);
  const load=async()=>{
   if(busy)return;busy=true;
   try{
    const page=await this.ctx.client.posts(profile.username,'media',cursor,this.controller.signal);
    if(this.disposed)return;
    cursor=page.cursor;more.hidden=cursor===null;
    for(const post of page.items)for(const m of post.media){
     const a=document.createElement('a');a.className='social-photo-tile';a.href=`#/social/post/${post.id}`;a.setAttribute('aria-label',`Photo from post by ${post.author.displayName||post.author.username}`);
     const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';img.src=mediaUrl(m.id,m.thumb?'thumb':'full');
     img.addEventListener('error',()=>{a.replaceChildren();a.insertAdjacentHTML('afterbegin',appIcon('photo'));},{once:true});
     a.append(img);grid.append(a);
    }
    if(!grid.children.length)status.replaceChildren(emptyState({title:'No photos yet'}));else status.replaceChildren();
   }catch(error){if(!this.disposed&&!this.controller.signal.aborted)status.replaceChildren(loadFailed(error,()=>void load()));}
   finally{busy=false;}
  };
  void load();
 }
 dispose():void{this.disposed=true;this.controller.abort();this.list?.dispose();this.root.remove();}
}
