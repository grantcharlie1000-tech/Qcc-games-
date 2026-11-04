import {appIcon} from '../../apps/icons';
import {mediaUrl} from '../../media/client';
import type {MediaRef} from '../shared';

/** `#social-photo`: full-screen viewer (DESIGN 5.4). Arrow keys and swipe move between photos; Escape closes and focus returns to the tile. */
export function openPhotoViewer(media:MediaRef[],start:number,trigger?:Element|null):void {
 document.getElementById('social-photo')?.remove();
 const dialog=document.createElement('dialog');
 dialog.id='social-photo';dialog.className='social-photo apps-sheet';dialog.setAttribute('aria-label','Photo viewer');
 dialog.innerHTML=`<div class="social-photo-count" aria-live="polite"></div><button type="button" class="social-photo-close" aria-label="Close photo">${appIcon('close')}</button><button type="button" class="social-photo-nav is-prev" aria-label="Previous photo">${appIcon('back')}</button><img alt="Photo"><button type="button" class="social-photo-nav is-next" aria-label="Next photo">${appIcon('back')}</button>`;
 document.body.append(dialog);
 let index=Math.min(Math.max(start,0),media.length-1),startX=0;
 const img=dialog.querySelector('img')!,count=dialog.querySelector('.social-photo-count')!;
 const prev=dialog.querySelector<HTMLButtonElement>('.is-prev')!,next=dialog.querySelector<HTMLButtonElement>('.is-next')!;
 const show=()=>{
  const m=media[index]!;img.src=mediaUrl(m.id,'full');count.textContent=media.length>1?`${index+1} of ${media.length}`:'';
  prev.hidden=next.hidden=media.length<2;prev.disabled=index===0;next.disabled=index===media.length-1;
 };
 const step=(by:number)=>{const to=index+by;if(to<0||to>=media.length)return;index=to;show();};
 prev.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));
 dialog.querySelector('.social-photo-close')!.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')step(-1);else if(event.key==='ArrowRight')step(1);});
 dialog.addEventListener('pointerdown',event=>{startX=event.clientX;});
 dialog.addEventListener('pointerup',event=>{const dx=event.clientX-startX;if(Math.abs(dx)>50&&event.pointerType==='touch')step(dx<0?1:-1);});
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 dialog.addEventListener('close',()=>{dialog.remove();if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus({preventScroll:true});},{once:true});
 show();dialog.showModal();
 dialog.querySelector<HTMLElement>('.social-photo-close')!.focus();
}
