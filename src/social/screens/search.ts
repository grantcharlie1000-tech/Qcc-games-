import {appIcon} from '../../apps/icons';
import {avatar} from '../../apps/avatar';
import {ApiError} from '../../apps/api';
import type {SocialContext,Screen} from '../context';
import {isAuthError} from '../context';
import type {Author,PostView,ProfileView} from '../shared';
import {PostCard} from '../components/post-card';
import {Segmented} from '../components/segmented';
import {emptyState,skeletonRows} from '../components/states';

export type SearchIn='people'|'posts';
/** `#/social/search?q=&in=people|posts` (DESIGN 5.8). */
export class SearchScreen implements Screen {
 private readonly field=document.createElement('input');
 private readonly clear=document.createElement('button');
 private readonly results=document.createElement('div');
 private readonly status=document.createElement('div');
 private readonly cards:PostCard[]=[];
 private segmented:Segmented;
 private timer:number|undefined;
 private controller:AbortController|undefined;
 private profileLoads:AbortController|undefined;
 private mode:SearchIn;
 private q:string;
 private root=document.createElement('div');
 private disposed=false;
 private last:{q:string;users:Author[];posts:PostView[]}|null=null;
 constructor(private readonly ctx:SocialContext,column:HTMLElement,query:string,mode:SearchIn) {
  this.q=query;this.mode=mode;
  this.root.className='social-search';column.append(this.root);
  const h1=this.heading=document.createElement('h1');h1.className='sr-only';h1.tabIndex=-1;h1.textContent='Search';
  const row=document.createElement('div');row.className='social-search-row';
  const field=this.field;field.type='search';field.className='social-search-field';field.placeholder='Search people and posts';field.autocomplete='off';field.spellcheck=false;
  field.setAttribute('aria-label','Search people and posts');field.setAttribute('aria-controls','social-results');field.value=query;field.maxLength=50;
  const icon=document.createElement('span');icon.className='social-search-icon';icon.innerHTML=appIcon('search');
  this.clear.type='button';this.clear.className='apps-icon-btn social-search-clear';this.clear.setAttribute('aria-label','Clear search');this.clear.innerHTML=appIcon('close');
  this.clear.addEventListener('click',()=>{field.value='';this.onInput(true);field.focus();});
  row.append(icon,field,this.clear);
  this.segmented=new Segmented({items:[{id:'people',label:'People'},{id:'posts',label:'Posts'}],selected:mode,label:'Search in',controls:'social-results',onSelect:id=>{this.mode=id as SearchIn;this.sync();this.paint();}});
  this.segmented.el.classList.add('is-plain');
  this.results.id='social-results';this.results.className='social-results';
  this.status.className='sr-only';this.status.setAttribute('role','status');
  this.root.append(h1,row,this.segmented.el,this.results,this.status);
  field.addEventListener('input',()=>this.onInput(false));
  field.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();this.onInput(true);}});
  this.clear.hidden=!query;
  this.paint();
  if(query)void this.run();
 }
 private heading!:HTMLElement;
 focusTarget():HTMLElement|null{return this.heading;}
 focusField():void{this.field.focus();}
 private sync():void{
  const url=this.q?`#/social/search?q=${encodeURIComponent(this.q)}&in=${this.mode}`:`#/social/search${this.mode==='posts'?'?in=posts':''}`;
  history.replaceState(null,'',location.pathname+location.search+url);
 }
 private onInput(now:boolean):void {
  this.q=this.field.value.trim();this.clear.hidden=!this.field.value;this.sync();
  if(this.timer!==undefined)clearTimeout(this.timer);
  if(now){void this.run();return;}
  this.timer=window.setTimeout(()=>{this.timer=undefined;void this.run();},300);
 }
 private minimum():number{return this.mode==='people'?1:2;}
 private async run():Promise<void> {
  this.controller?.abort();
  if(!this.q){this.last=null;this.paint();return;}
  if(this.q.length<this.minimum()){this.last=null;this.paint();return;}
  const controller=this.controller=new AbortController();
  this.results.replaceChildren(skeletonRows(5,'Searching…'));
  try{
   const found=await this.ctx.client.search(this.q,controller.signal);
   if(controller.signal.aborted||this.disposed)return;
   this.last={q:this.q,users:found.users,posts:found.posts};this.paint();
  }catch(error){
   if(controller.signal.aborted||this.disposed)return;
   if(isAuthError(error)){this.ctx.signedOut();return;}
   this.results.replaceChildren(emptyState({icon:'alert',title:error instanceof ApiError&&error.status===429?error.message:"Couldn't load this.",text:'Check your connection and try again.',action:{label:'Try again',run:()=>void this.run()}}));
  }
 }
 private paint():void {
  for(const card of this.cards)card.dispose();this.cards.length=0;this.profileLoads?.abort();
  const q=this.q;
  if(!q){this.results.replaceChildren(emptyState({icon:'search',title:'Search QCC Social',text:'Find people by username, or posts by the words in them.'}));this.status.textContent='';return;}
  if(q.length<this.minimum()){this.results.replaceChildren();this.status.textContent='';return;}
  if(!this.last||this.last.q!==q){void this.run();return;}
  if(q.length<this.minimum()){this.results.replaceChildren();return;}
  const {users,posts}=this.last;
  if(this.mode==='people'){
   if(!users.length){this.results.replaceChildren(this.none(`No people match “${q}”.`));this.status.textContent=`No people match “${q}”`;return;}
   const list=document.createElement('ul');list.className='social-people';
   for(const user of users)list.append(this.personRow(user));
   this.results.replaceChildren(list);this.status.textContent=`${users.length} ${users.length===1?'person':'people'} found`;
   this.loadProfiles(users);
  }else{
   if(!posts.length){this.results.replaceChildren(this.none(`No posts match “${q}”.`));this.status.textContent=`No posts match “${q}”`;return;}
   const feed=document.createElement('div');feed.className='social-feed';
   posts.forEach((post,i)=>{const card=new PostCard(this.ctx,post,{position:i+1,onRemoved:removed=>{card.el.remove();}});this.cards.push(card);feed.append(card.el);});
   this.results.replaceChildren(feed);this.status.textContent=`${posts.length} ${posts.length===1?'post':'posts'} found`;
  }
 }
 private none(text:string):HTMLElement{return emptyState({title:'Nothing found',text,action:{label:'Clear search',run:()=>{this.field.value='';this.onInput(true);this.field.focus();}}});}
 private personRow(user:Author):HTMLElement {
  const li=document.createElement('li');li.className='social-person';li.dataset.username=user.username;
  const link=document.createElement('a');link.className='social-person-link';link.href=`#/social/u/${encodeURIComponent(user.username)}`;
  const text=document.createElement('span');text.className='social-person-text';
  const name=document.createElement('span');name.className='social-person-name';name.textContent=user.displayName||user.username;
  const handle=document.createElement('span');handle.className='social-person-handle';handle.textContent=`@${user.username}`;
  text.append(name,handle);link.append(avatar(user,40),text);
  li.append(link);return li;
 }
 /** Follow state is not part of the search result, so each row asks for its profile (4 at a time) and adds the chip and button. */
 private loadProfiles(users:Author[]):void {
  const controller=this.profileLoads=new AbortController();
  const queue=users.slice();
  const worker=async()=>{
   for(let user=queue.shift();user;user=queue.shift()){
    if(controller.signal.aborted||this.disposed)return;
    try{
     const profile=await this.ctx.client.profile(user.username,controller.signal);
     if(controller.signal.aborted||this.disposed)return;
     this.decorate(profile);
    }catch{if(controller.signal.aborted)return;}
   }
  };
  for(let i=0;i<4;i++)void worker();
 }
 private decorate(profile:ProfileView):void {
  const li=[...this.results.querySelectorAll<HTMLElement>('.social-person')].find(el=>el.dataset.username===profile.username);
  if(!li||li.querySelector('.social-follow'))return;
  if(profile.followsYou){const chip=document.createElement('span');chip.className='social-chip';chip.textContent='Follows you';li.querySelector('.social-person-text')!.append(chip);}
  if(profile.mine)return;
  const button=document.createElement('button');button.type='button';button.className='ui-btn small apps-pill social-follow';
  let on=profile.followedByMe,busy=false;
  const paint=()=>{button.textContent=on?'Following':'Follow';button.classList.toggle('primary',!on);button.classList.toggle('secondary',on);button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',on?`Following @${profile.username}`:`Follow @${profile.username}`);};
  paint();
  button.addEventListener('click',async()=>{
   if(busy)return;busy=true;const before=on;on=!on;paint();
   try{await this.ctx.client.follow(profile.username,on);}catch(error){on=before;paint();if(error instanceof ApiError&&error.status===429)this.ctx.notify(error.message,{role:'alert'});else this.ctx.fail(error,`Couldn't follow @${profile.username}. Try again.`);}
   finally{busy=false;}
  });
  li.append(button);
 }
 dispose():void {
  this.disposed=true;if(this.timer!==undefined)clearTimeout(this.timer);this.controller?.abort();this.profileLoads?.abort();
  for(const card of this.cards)card.dispose();this.root.remove();
 }
}
