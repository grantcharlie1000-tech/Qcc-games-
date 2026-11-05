import {appIcon} from '../../apps/icons';
import {avatar} from '../../apps/avatar';
import {ApiError} from '../../apps/api';
import {motion,EASE_OUT} from '../../apps/motion';
import {relativeTime} from '../../apps/text';
import type {Friend} from '../shared';
import type {ChatContext} from './context';

/** DESIGN 6.7: a UI constant, not a server rule. */
export const SNAP_VIEW_SECONDS=10;
/** One dot per second. They fade from the right end, so the lit run shrinks leftwards. */
const DOT_STEP=8,DOT_R=2.5;
const DOTS=Array.from({length:SNAP_VIEW_SECONDS},(_,i)=>`<circle class="chat-snap-dot" cx="${DOT_R+DOT_STEP*i}" cy="${DOT_R}" r="${DOT_R}"/>`).join('');
const GRACE_MS=350;
export const SNAP_FAILED="This photo can't be opened. It may have expired.";

export interface SnapViewerOptions {
 ctx:ChatContext;messageId:string;friend:Friend;sentAt:string;
 /** The server has consumed the photo (or says it is already gone): the row must read "They've seen it" and never offer it again. */
 onOpened:()=>void;
 /** The viewer is closed and everything is released. */
 onClosed:()=>void;
}
export interface SnapViewer {close():void;readonly dialog:HTMLDialogElement}

/**
 * The view-once photo (DESIGN 6.7). Opening calls open_snap exactly once; the photo lives only as an object URL on one img and is revoked and dropped on close.
 * Closes on tap, the close button, Escape, pause or after SNAP_VIEW_SECONDS.
 */
export function openSnapViewer(options:SnapViewerOptions):SnapViewer {
 const {ctx,friend}=options;
 document.getElementById('chat-snap')?.remove();
 const dialog=document.createElement('dialog');
 dialog.id='chat-snap';dialog.className='apps-sheet chat-snap-dialog';dialog.setAttribute('aria-label',`Photo from ${friend.displayName}`);
 const when=relativeTime(options.sentAt);
 dialog.innerHTML=`<div class="chat-snap-top"><div class="chat-snap-who"><span class="chat-snap-avatar"></span><span class="chat-snap-name"></span></div><div class="chat-snap-timer"><svg class="chat-snap-dots" viewBox="0 0 ${DOT_STEP*SNAP_VIEW_SECONDS-(DOT_STEP-2*DOT_R)} ${2*DOT_R}" width="77" height="5" aria-hidden="true" focusable="false">${DOTS}</svg><span class="chat-snap-secs" aria-hidden="true"></span><button type="button" class="chat-snap-close" aria-label="Close photo" autofocus>${appIcon('close')}</button></div></div><div class="chat-snap-stage"><p class="chat-snap-loading" role="status">Opening photo…</p></div><p class="chat-snap-note">This photo is deleted when you close it. Screenshots can't be blocked on the web.</p><span class="sr-only chat-snap-count" role="status"></span>`;
 dialog.querySelector('.chat-snap-avatar')!.append(avatar(friend,28));
 dialog.querySelector('.chat-snap-name')!.textContent=when?`${friend.displayName} · ${when}`:friend.displayName;
 const q=<T extends Element>(selector:string)=>dialog.querySelector<T>(selector)!;
 const stage=q<HTMLElement>('.chat-snap-stage'),secs=q<HTMLElement>('.chat-snap-secs'),dotEls=[...dialog.querySelectorAll<SVGCircleElement>('.chat-snap-dot')],count=q<HTMLElement>('.chat-snap-count'),closeButton=q<HTMLButtonElement>('.chat-snap-close');
 const controller=new AbortController();
 let state:'loading'|'showing'|'failed'|'closing'|'closed'='loading';
 let url:string|null=null,image:HTMLImageElement|null=null,tick:number|undefined,shownAt=0,deadline=0,consumed=false;
 /** The open fade and the image's scale-in (rows 11): closing during them cancels them (row 11, interruption). */
 const opening:Animation[]=[];

 const markOpened=()=>{if(consumed)return;consumed=true;options.onOpened();};
 function close():void {
  if(state==='closing'||state==='closed')return;
  const was=state;state='closing';
  if(tick!==undefined){clearInterval(tick);tick=undefined;}
  const finish=()=>{if(dialog.open)dialog.close();else release();};
  // Start the exit from wherever the open fade had got to, so an early close never flashes to full opacity.
  const from=Number(getComputedStyle(dialog).opacity);
  const look=image?getComputedStyle(image):null,scale=!look||look.transform==='none'?1:new DOMMatrixReadOnly(look.transform).a,seen=look?Number(look.opacity):1;
  for(const a of opening.splice(0))a.cancel();
  const fade=motion(dialog,[{opacity:from},{opacity:0}],{duration:160,easing:EASE_OUT},ctx.deps.reducedMotion);
  if(image&&was==='showing')motion(image,[{transform:`scale(${scale})`,opacity:seen},{transform:'scale(.98)',opacity:seen}],{duration:160,easing:EASE_OUT},ctx.deps.reducedMotion);
  if(fade){fade.finished.then(finish,finish);}else finish();
 }
 /** The one place everything is let go, whatever closed the dialog (button, Escape, timer, pause, route change). */
 function release():void {
  if(state==='closed')return;
  state='closed';
  if(tick!==undefined){clearInterval(tick);tick=undefined;}
  controller.abort();
  if(image){image.removeAttribute('src');image.remove();image=null;}
  if(url){URL.revokeObjectURL(url);url=null;}
  stage.replaceChildren();
  dialog.remove();
  options.onClosed();
 }
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',release);
 closeButton.addEventListener('click',close);
 stage.addEventListener('click',()=>{if(state==='showing'&&performance.now()-shownAt>GRACE_MS)close();});
 stage.addEventListener('contextmenu',event=>event.preventDefault());

 /** Dims the last `spent` dots. Reduced motion steps it once a second (the shell zeroes the transition). */
 const paintDots=(spent:number):void=>dotEls.forEach((d,i)=>d.classList.toggle('is-spent',i>=dotEls.length-spent));
 function startCountdown():void {
  shownAt=performance.now();deadline=shownAt+SNAP_VIEW_SECONDS*1000;
  secs.textContent=`${SNAP_VIEW_SECONDS}s`;count.textContent=`${SNAP_VIEW_SECONDS} seconds`;
  const smooth=!ctx.reduced();
  if(smooth){
   paintDots(1); // the first second's dot starts its 1 s fade now
  }
  let last=SNAP_VIEW_SECONDS;
  tick=window.setInterval(()=>{
   const left=Math.max(0,Math.ceil((deadline-performance.now())/1000));
   if(left!==last){
    last=left;secs.textContent=`${left}s`;
    paintDots(smooth?Math.min(SNAP_VIEW_SECONDS,SNAP_VIEW_SECONDS-left+1):SNAP_VIEW_SECONDS-left);
    if(left===3)count.textContent='3 seconds left';
   }
   if(left<=0)close();
  },200);
 }
 function fail(consumedByServer:boolean):void {
  if(state!=='loading')return;
  state='failed';
  if(consumedByServer)markOpened();
  stage.replaceChildren();
  const box=document.createElement('div');box.className='chat-snap-failed';
  const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=SNAP_FAILED;
  const button=document.createElement('button');button.type='button';button.className='ui-btn secondary apps-pill';button.textContent='Close';button.addEventListener('click',close);
  box.append(p,button);stage.append(box);
  secs.textContent='';paintDots(0);
 }
 async function load():Promise<void> {
  let blob:Blob;
  try{blob=await ctx.client.openSnap(options.messageId,controller.signal);}
  catch(error){
   if(controller.signal.aborted||state!=='loading')return;
   if(error instanceof ApiError&&error.status===401){ctx.signedOut();close();return;}
   fail(error instanceof ApiError&&error.status===410);return;
  }
  // The server has deleted its copy by now. Whatever happens next, the row reads as seen.
  markOpened();
  if(state!=='loading')return;
  url=URL.createObjectURL(blob);
  const img=new Image();
  img.alt=`Photo from ${friend.displayName}`;img.draggable=false;img.decoding='async';img.className='chat-snap-img';
  img.src=url;
  try{await img.decode();}catch{if(state==='loading')fail(false);return;}
  if(state!=='loading'||!url)return;
  image=img;state='showing';
  stage.replaceChildren(img);
  const grow=motion(img,[{transform:'scale(.96)',opacity:0},{transform:'scale(1)',opacity:1}],{duration:220,easing:EASE_OUT},ctx.deps.reducedMotion,[{opacity:0},{opacity:1}]);
  if(grow)opening.push(grow);
  startCountdown();
 }
 document.body.append(dialog);
 dialog.showModal();
 closeButton.focus({preventScroll:true});
 const shown=motion(dialog,[{opacity:0},{opacity:1}],{duration:160,easing:EASE_OUT},ctx.deps.reducedMotion,[{opacity:0},{opacity:1}]);
 if(shown)opening.push(shown);
 void load();
 return {close,dialog};
}
