import {appSheet,showSheet,confirmSheet} from '../../apps/sheets';
import type {SocialContext} from '../context';
import type {PostView} from '../shared';
import {Composer} from './composer';

/** `#social-compose` (DESIGN 5.6). Closing with text or photos asks "Discard this post?". Resolves true when a post was published. */
export function openComposeSheet(ctx:SocialContext,options:{replyTo?:PostView;trigger?:Element|null;onPosted:(post:PostView)=>void}):()=>void {
 const reply=options.replyTo;
 const {dialog,body}=appSheet('social-compose',reply?`Reply to @${reply.author.username}`:'New post',{closeLabel:'Close'});
 let published=false,asking=false;
 const composer=new Composer({ctx,replyTo:reply,onPosted:post=>{published=true;dialog.close();options.onPosted(post);ctx.announce('Post published.');}});
 body.append(composer.el);
 const guard=async(event:Event)=>{
  if(published||!composer.hasContent)return;
  event.preventDefault();
  if(asking)return;
  asking=true;
  const discard=await confirmSheet({title:'Discard this post?',text:'Your text and photos will be removed.',confirm:'Discard',cancel:'Keep editing',danger:true});
  asking=false;
  if(discard){published=true;dialog.close();}
  else composer.focus();
 };
 dialog.addEventListener('cancel',event=>void guard(event));
 dialog.querySelector('.dialog-head .icon-button')!.addEventListener('click',event=>void guard(event));
 dialog.addEventListener('close',()=>composer.dispose(),{once:true});
 showSheet(dialog,options.trigger);
 composer.focus();
 return ()=>{if(dialog.open){published=true;dialog.close();}};
}
