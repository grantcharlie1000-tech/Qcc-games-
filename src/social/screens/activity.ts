import {appIcon} from '../../apps/icons';
import {avatar} from '../../apps/avatar';
import {relativeTime} from '../../apps/text';
import type {SocialContext,Screen} from '../context';
import {isAuthError} from '../context';
import type {ActivityItem} from '../shared';
import {emptyState,loadFailed,skeletonRows} from '../components/states';

/** `#/social/activity` (DESIGN 5.9): the last 50 likes, replies and follows. */
export class ActivityScreen implements Screen {
 private readonly controller=new AbortController();
 private root=document.createElement('div');
 private disposed=false;
 private h1=document.createElement('h1');
 constructor(private readonly ctx:SocialContext,column:HTMLElement) {
  this.root.className='social-activity-page';
  this.h1.className='apps-title';this.h1.tabIndex=-1;this.h1.textContent='Activity';
  this.root.append(this.h1,skeletonRows(8,'Loading activity…'));column.append(this.root);
  void this.load();
 }
 focusTarget():HTMLElement|null{return this.h1;}
 private async load():Promise<void> {
  try{
   const {items}=await this.ctx.client.activity(this.controller.signal);
   if(this.disposed)return;
   this.root.replaceChildren(this.h1);
   if(!items.length){this.root.append(emptyState({icon:'activity',title:'Nothing here yet',text:'Likes, replies and new followers will show up here.'}));return;}
   const list=document.createElement('ul');list.className='social-activity';
   for(const item of items)list.append(this.row(item));
   this.root.append(list);
  }catch(error){
   if(this.disposed||this.controller.signal.aborted)return;
   if(isAuthError(error)){this.ctx.signedOut();return;}
   this.root.replaceChildren(this.h1,loadFailed(error,()=>{this.root.replaceChildren(this.h1,skeletonRows(8,'Loading activity…'));void this.load();}));
  }
 }
 private row(item:ActivityItem):HTMLElement {
  const li=document.createElement('li');
  const a=document.createElement('a');a.className='social-activity-row';
  a.href=item.kind==='follow'?`#/social/u/${encodeURIComponent(item.actor.username)}`:`#/social/post/${item.postId}`;
  const kind=document.createElement('span');kind.className=`social-activity-kind is-${item.kind}`;
  kind.innerHTML=appIcon(item.kind==='like'?'like-filled':item.kind==='reply'?'reply':'plus');
  const text=document.createElement('span');text.className='social-activity-text';
  const line=document.createElement('span');line.className='social-activity-line';
  const who=document.createElement('strong');who.textContent=item.actor.displayName||item.actor.username;
  line.append(who,item.kind==='like'?' liked your post':item.kind==='reply'?' replied':' followed you');
  text.append(line);
  if(item.snippet){const s=document.createElement('span');s.className='social-activity-snippet';s.textContent=item.kind==='like'?`“${item.snippet}”`:item.snippet;text.append(s);}
  const time=document.createElement('time');time.dateTime=item.at;time.textContent=relativeTime(item.at);
  a.append(kind,avatar(item.actor,32),text,time);li.append(a);return li;
 }
 dispose():void{this.disposed=true;this.controller.abort();this.root.remove();}
}
