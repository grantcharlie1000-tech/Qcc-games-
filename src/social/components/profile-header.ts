import {appIcon} from '../../apps/icons';
import {avatar} from '../../apps/avatar';
import {memberSince,compactCount} from '../../apps/format';
import {mediaUrl} from '../../media/client';
import {confirmSheet,reportSheet} from '../../apps/sheets';
import {ApiError} from '../../apps/api';
import type {SocialContext} from '../context';
import type {ProfileView} from '../shared';
import {openMenu} from './menus';
import {postLink} from './post-card';
import {copySocialLink} from './copy-link';

export const profileLink=(username:string):string=>`${location.origin}${location.pathname}#/social/u/${encodeURIComponent(username)}`;

/** Banner, avatar, actions and counts (DESIGN 5.7). Follow is optimistic; "Following" unfollows at once. */
export class ProfileHeader {
 readonly el=document.createElement('header');
 private follow:HTMLButtonElement|null=null;
 private followers:HTMLElement|null=null;
 private seq=0;
 constructor(private readonly ctx:SocialContext,public profile:ProfileView,private readonly changed:()=>void) {
  const p=profile;
  this.el.className='social-profile-head';
  const banner=document.createElement('div');banner.className='social-banner';
  if(p.banner){const img=document.createElement('img');img.alt='';img.decoding='async';img.src=mediaUrl(p.banner,'thumb');img.addEventListener('error',()=>img.remove(),{once:true});banner.append(img);}
  const body=document.createElement('div');body.className='social-profile-body';
  const row=document.createElement('div');row.className='social-profile-row';
  const av=avatar(p,80);av.classList.add('is-profile');
  const actions=document.createElement('div');actions.className='social-profile-actions';
  if(p.mine){
   const edit=document.createElement('a');edit.className='ui-btn secondary apps-pill';edit.href='#/social/settings';edit.textContent='Edit profile';actions.append(edit);
  }else{
   this.follow=document.createElement('button');this.follow.type='button';this.follow.className='ui-btn apps-pill social-follow';
   this.follow.addEventListener('click',()=>void this.toggleFollow());
   const more=document.createElement('button');more.type='button';more.className='apps-icon-btn';more.setAttribute('aria-label',`More options for @${p.username}`);more.setAttribute('aria-haspopup','menu');more.innerHTML=appIcon('more');
   more.addEventListener('click',()=>this.openMore(more));
   actions.append(this.follow,more);
  }
  if(p.mine&&!p.avatar&&ctx.mediaEnabled()){
   const photo=document.createElement('a');photo.className='social-add-photo';photo.href='#/social/settings';photo.setAttribute('aria-label','Add profile photo');
   const label=document.createElement('span');label.textContent='Add photo';photo.append(av,label);row.append(photo,actions);
  }else row.append(av,actions);
  const name=document.createElement('h1');name.className='social-profile-name';name.tabIndex=-1;name.textContent=p.displayName||p.username;
  const handle=document.createElement('p');handle.className='social-profile-handle';handle.append(document.createTextNode(`@${p.username}`));
  body.append(row,name,handle);
  if(p.bio){const bio=document.createElement('p');bio.className='social-profile-bio';bio.textContent=p.bio;body.append(bio);}
  const since=document.createElement('p');since.className='social-profile-since';since.textContent=memberSince(p.joinedAt);
  if(p.followsYou){const chip=document.createElement('span');chip.className='social-chip';chip.textContent='Your follower';since.append(chip);}
  const counts=document.createElement('p');counts.className='social-profile-counts';
  counts.innerHTML='<span><strong data-k="following"></strong> following</span> <span><strong data-k="followers"></strong> <span data-k="followers-word">followers</span></span>';
  counts.querySelector('[data-k=following]')!.textContent=compactCount(p.following);
  this.followers=counts.querySelector('[data-k=followers]');
  body.append(since,counts);
  this.el.append(banner,body);
  this.sync();
 }
 private sync():void {
  const p=this.profile;
  if(this.follow){
   this.follow.textContent=p.followedByMe?'Following':'Follow';
   this.follow.classList.toggle('primary',!p.followedByMe);this.follow.classList.toggle('secondary',p.followedByMe);
   this.follow.setAttribute('aria-pressed',String(p.followedByMe));
   this.follow.setAttribute('aria-label',p.followedByMe?`Following @${p.username}`:`Follow @${p.username}`);
  }
  if(this.followers){this.followers.textContent=compactCount(p.followers);const w=this.el.querySelector('[data-k=followers-word]');if(w)w.textContent=p.followers===1?'follower':'followers';}
 }
 private async toggleFollow():Promise<void> {
  const before=this.profile,on=!before.followedByMe,seq=++this.seq;
  this.profile={...before,followedByMe:on,followers:Math.max(0,before.followers+(on?1:-1))};this.sync();
  try{
   const result=await this.ctx.client.follow(before.username,on);
   if(seq!==this.seq)return;
   this.profile={...this.profile,followedByMe:result.followedByMe,followers:result.followers};this.sync();this.changed();
  }catch(error){
   if(seq!==this.seq)return;
   this.profile=before;this.sync();
   if(error instanceof ApiError&&error.status===429)this.ctx.notify(error.message,{role:'alert'});
   else this.ctx.fail(error,`Couldn't follow @${before.username}. Try again.`,()=>void this.toggleFollow());
  }
 }
 private openMore(trigger:HTMLElement):void {
  const p=this.profile;
  openMenu(trigger,`@${p.username}`,[
   {label:'Copy profile link',icon:'copy',run:()=>void copySocialLink(this.ctx,profileLink(p.username))},
   {label:'Report @'+p.username,icon:'report',run:()=>void reportSheet({title:'Report account',intro:"Tell us what's wrong. QCC moderators will look at it.",trigger,onUnauthorized:()=>this.ctx.signedOut(),submit:async(category,note)=>{await this.ctx.client.report({kind:'account',username:p.username,category,...(note?{note}:{})});}})},
   {label:`Block @${p.username}`,icon:'block',danger:true,run:()=>void this.block(trigger)}
  ],this.ctx.scroller);
 }
 private async block(trigger:Element):Promise<void> {
  const username=this.profile.username;
  const ok=await confirmSheet({title:`Block @${username}?`,text:"You won't see each other's posts or profiles, follows between you are removed, and you'll stop being friends in Chat. They won't be told.",confirm:'Block',danger:true,trigger});
  if(!ok)return;
  try{await this.ctx.client.block(username,true);this.ctx.notify(`Blocked @${username}.`);this.ctx.refresh();}
  catch(error){this.ctx.fail(error,`Couldn't block @${username}. Try again.`,()=>void this.block(trigger));}
 }
}
void postLink;
