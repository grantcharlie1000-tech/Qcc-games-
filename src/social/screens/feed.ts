import {appIcon} from '../../apps/icons';
import {avatar} from '../../apps/avatar';
import {pollMs} from '../../apps/format';
import type {SocialContext,Screen} from '../context';
import type {FeedTab} from '../client';
import type {PostView} from '../shared';
import {PostList} from '../components/post-list';
import {Composer} from '../components/composer';
import {emptyState} from '../components/states';

const POLL=60000;
const wide=()=>typeof matchMedia==='function'&&matchMedia('(min-width:1100px)').matches;

/** Following / Discover (DESIGN 5.3): infinite scroll, a polled "new posts" pill, an inline composer from 1100px. */
export class FeedScreen implements Screen {
 private readonly list:PostList;
 private pill:HTMLButtonElement|undefined;
 private pending:PostView[]=[];
 private timer:number|undefined;
 private poller:AbortController|undefined;
 private paused=false;
 private disposed=false;
 private inline:Composer|undefined;
 private readonly onScroll=()=>{if(this.pending.length&&this.ctx.scroller.scrollTop<=64)this.merge(false);};
 private readonly onVisibility=()=>{if(document.visibilityState==='visible')this.startPolling(true);else this.stopPolling();};
 constructor(private readonly ctx:SocialContext,private readonly column:HTMLElement,readonly tab:FeedTab) {
  const following=tab==='following';
  this.list=new PostList({ctx,label:following?'Following':'Discover',loading:'Loading posts…',
   load:(cursor,signal)=>ctx.client.feed(tab,cursor,signal),
   empty:()=>following
    ?(ctx.me()?.profile.following??0)===0
      ?emptyState({icon:'social',title:'Your feed is empty',text:"Follow people to see their posts here. Discover shows everyone's posts.",action:{label:'Go to Discover',href:'#/social/discover'}})
      :emptyState({icon:'social',title:'Nothing new yet',text:'Posts from people you follow will show up here.'})
    :emptyState({icon:'social',title:'No posts yet',text:'Be the first to post something.',action:{label:'New post',run:()=>ctx.openCompose(),primary:true}})});
  if(following&&wide())this.buildInline();
  column.append(this.list.el);
  void this.list.start().then(()=>this.startPolling(false));
  ctx.scroller.addEventListener('scroll',this.onScroll,{passive:true});
  document.addEventListener('visibilitychange',this.onVisibility);
 }
 private buildInline():void {
  const me=this.ctx.me();if(!me)return;
  const row=document.createElement('div');row.className='social-inline';
  const prompt=document.createElement('button');prompt.type='button';prompt.className='social-inline-prompt';prompt.textContent='Write a post';
  row.append(avatar(me.profile,44),prompt);
  const expand=()=>{
   prompt.hidden=true;
   const composer=this.inline=new Composer({ctx:this.ctx,onPosted:post=>{composer.dispose();this.inline=undefined;prompt.hidden=false;this.posted(post);this.ctx.announce('Post published.');}});
   row.append(composer.el);composer.focus();
  };
  prompt.addEventListener('click',expand);
  this.column.append(row);
 }
 /** Opens the inline composer when there is one (shortcut n at 1100px and up). */
 openInline():boolean{const prompt=this.column.querySelector<HTMLButtonElement>('.social-inline-prompt');if(!prompt||prompt.hidden){this.column.querySelector<HTMLTextAreaElement>('.social-inline textarea')?.focus();return !!prompt;}prompt.click();return true;}
 posted(post:PostView):void {
  if(this.tab==='discover'&&post.replyTo)return;
  const card=this.list.prepend([post],true);
  this.ctx.scroller.scrollTo({top:0});
  card?.el.focus({preventScroll:true});
 }
 private startPolling(now:boolean):void {
  if(this.disposed||this.paused||document.visibilityState!=='visible')return;
  if(this.timer===undefined)this.timer=window.setInterval(()=>void this.poll(),pollMs(POLL));
  if(now)void this.poll();
 }
 private stopPolling():void{if(this.timer!==undefined){clearInterval(this.timer);this.timer=undefined;}this.poller?.abort();this.poller=undefined;}
 /** Fetches page one and shows anything newer than what is on screen. Never inserts above a reader who has scrolled. */
 private async poll():Promise<void> {
  if(this.paused||this.disposed||document.visibilityState!=='visible'||!this.ctx.token()||this.list.count===0&&!this.list.feed.isConnected)return;
  this.poller?.abort();const controller=this.poller=new AbortController();
  try{
   const page=await this.ctx.client.feed(this.tab,null,controller.signal);
   if(controller.signal.aborted||this.disposed||this.paused)return;
   const known=this.list.ids,newer:PostView[]=[];
   for(const post of page.items){if(known.has(post.id))break;newer.push(post);}
   if(!newer.length)return;
   this.pending=newer;
   if(this.ctx.scroller.scrollTop<=64)this.merge(false);else this.showPill();
  }catch{/* polling is best effort */}
 }
 private showPill():void {
  const count=this.pending.length,text=count===1?'1 new post':`${count} new posts`;
  if(!this.pill){
   const pill=this.pill=document.createElement('button');pill.type='button';pill.className='social-new-pill';
   pill.addEventListener('click',()=>this.merge(true));
   this.column.insertBefore(pill,this.column.firstChild);
   this.ctx.announce(`${text} above`);
  }
  this.pill.replaceChildren();this.pill.insertAdjacentHTML('afterbegin',appIcon('back'));this.pill.append(text);
 }
 private hidePill():void {
  const pill=this.pill;if(!pill)return;this.pill=undefined;
  pill.dataset.leaving='true';window.setTimeout(()=>pill.remove(),150);
 }
 private merge(fromPill:boolean):void {
  if(!this.pending.length)return;
  const fresh=this.pending;this.pending=[];this.hidePill();
  const card=this.list.prepend(fresh,false);
  if(fromPill){this.ctx.scroller.scrollTo({top:0,behavior:this.ctx.reduced()?'auto':'smooth'});card?.el.focus({preventScroll:true});}
 }
 /** Tapping the selected segment: top, and merge. */
 toTop():void{this.merge(true);this.ctx.scroller.scrollTo({top:0,behavior:this.ctx.reduced()?'auto':'smooth'});}
 pause():void{this.paused=true;this.stopPolling();}
 resume():void{this.paused=false;this.startPolling(true);}
 dispose():void {
  this.disposed=true;this.stopPolling();
  this.ctx.scroller.removeEventListener('scroll',this.onScroll);document.removeEventListener('visibilitychange',this.onVisibility);
  this.inline?.dispose();this.list.dispose();this.pill?.remove();
 }
}
