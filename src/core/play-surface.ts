import {fitScale} from './viewport-fit';

export {fitScale};

/** Library and study reading: the visitor can still pinch-zoom. */
export const READING_VIEWPORT='width=device-width, initial-scale=1, viewport-fit=cover';
/** While a game is open: no pinch-zoom or double-tap zoom. Restored when play ends. */
export const PLAYING_VIEWPORT='width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

export interface PlayBox {width:number;height:number;top:number;left:number}
export interface VisualBox {width:number;height:number;offsetTop:number;offsetLeft:number}

/** The rectangle the game should cover: the visual viewport, so rotation and browser chrome resize the playfield. */
export function playBox(visual:VisualBox|null, inner:{width:number;height:number}):PlayBox {
  if(!visual)return {width:inner.width,height:inner.height,top:0,left:0};
  return {width:visual.width,height:visual.height,top:visual.offsetTop,left:visual.offsetLeft};
}

/**
 * Block a touchmove while playing.
 * Two or more fingers are a pinch and are always blocked.
 * One finger is blocked unless it is on a control or a region that scrolls on purpose.
 * A move with no touches is not a gesture.
 */
export function shouldBlockTouchMove(touches:number, allowsScroll:boolean):boolean {
  if(touches>1)return true;
  if(touches===1)return !allowsScroll;
  return false;
}

export type ScreenMode='window'|'fullscreen'|'immersive';
export interface ScreenHost {
  supported:boolean;
  active:boolean;
  request():Promise<void>;
  exit():Promise<void>;
}

/** Enter the Fullscreen API, or an immersive fallback when the browser rejects it (iOS Safari). Either mode toggles off. */
export async function nextScreenMode(current:ScreenMode, host:ScreenHost):Promise<ScreenMode> {
  if(current==='fullscreen'||host.active){
    try{await host.exit();}catch{/* the browser may already have left fullscreen */}
    return 'window';
  }
  if(current==='immersive')return 'window';
  if(!host.supported)return 'immersive';
  try{
    await host.request();
    return host.active?'fullscreen':'immersive';
  }catch{
    return 'immersive';
  }
}

export interface ScreenPresentation {expanded:boolean;fallback:boolean}

type FullscreenDocument=Document&{webkitFullscreenEnabled?:boolean;webkitFullscreenElement?:Element|null;webkitExitFullscreen?:()=>void};
type FullscreenElement=HTMLElement&{webkitRequestFullscreen?:()=>void};

let playing=false;
let guards=false;
let renderExpanded:((state:ScreenPresentation)=>void)|undefined;

function fullscreenDocument():FullscreenDocument {return document as FullscreenDocument;}

function fullscreenActive():boolean {
  const doc=fullscreenDocument();
  return !!(document.fullscreenElement||doc.webkitFullscreenElement);
}

function fullscreenSupported():boolean {
  const doc=fullscreenDocument();
  const root=document.documentElement as FullscreenElement;
  return !!(doc.fullscreenEnabled||doc.webkitFullscreenEnabled||typeof root.requestFullscreen==='function'||typeof root.webkitRequestFullscreen==='function');
}

function requestFullscreen(target:HTMLElement):Promise<void> {
  const vendor=target as FullscreenElement;
  if(typeof target.requestFullscreen==='function'){
    const pending=target.requestFullscreen({navigationUI:'hide'});
    return pending??Promise.resolve();
  }
  if(typeof vendor.webkitRequestFullscreen==='function'){
    vendor.webkitRequestFullscreen();
    return Promise.resolve();
  }
  return Promise.reject(new Error('fullscreen-unsupported'));
}

function exitFullscreen():Promise<void> {
  const doc=fullscreenDocument();
  if(document.fullscreenElement&&typeof document.exitFullscreen==='function'){
    const pending=document.exitFullscreen();
    return pending??Promise.resolve();
  }
  if(doc.webkitFullscreenElement&&typeof doc.webkitExitFullscreen==='function'){
    doc.webkitExitFullscreen();
    return Promise.resolve();
  }
  return Promise.resolve();
}

function presentation():ScreenPresentation {
  const fallback=document.documentElement.classList.contains('play-immersive');
  return {expanded:fullscreenActive()||fallback,fallback};
}

function publish(){renderExpanded?.(presentation());}

function applyBox(){
  const vv=window.visualViewport;
  const box=playBox(vv?{width:vv.width,height:vv.height,offsetTop:vv.offsetTop,offsetLeft:vv.offsetLeft}:null,{width:window.innerWidth,height:window.innerHeight});
  const root=document.documentElement;
  root.style.setProperty('--play-width',`${box.width}px`);
  root.style.setProperty('--play-height',`${box.height}px`);
  root.style.setProperty('--play-top',`${box.top}px`);
  root.style.setProperty('--play-left',`${box.left}px`);
}

function scheduleBox(){
  // Synchronous: a resize listener that reads layout in the same turn (and a paused test clock) must see the new box.
  if(playing)applyBox();
}

function clearBox(){
  const root=document.documentElement;
  root.style.removeProperty('--play-width');
  root.style.removeProperty('--play-height');
  root.style.removeProperty('--play-top');
  root.style.removeProperty('--play-left');
}

/** A finger may pan this target: a control, a dialog, or an element that actually overflows. */
export function elementAllowsTouchScroll(target:EventTarget|null):boolean {
  if(!(target instanceof Element))return false;
  if(target.closest('input, textarea, select, dialog, button, a, summary, label, [contenteditable="true"]'))return true;
  let node:Element|null=target;
  while(node&&node!==document.documentElement){
    const style=getComputedStyle(node);
    const scrolls=(mode:string,span:number,view:number)=> (mode==='auto'||mode==='scroll'||mode==='overlay')&&span>view+1;
    if(scrolls(style.overflowY,node.scrollHeight,node.clientHeight)||scrolls(style.overflowX,node.scrollWidth,node.clientWidth))return true;
    node=node.parentElement;
  }
  return false;
}

function onTouchMove(event:TouchEvent){
  if(!playing)return;
  if(!shouldBlockTouchMove(event.touches.length,elementAllowsTouchScroll(event.target)))return;
  if(event.cancelable)event.preventDefault();
}

function onGesture(event:Event){
  if(playing&&event.cancelable)event.preventDefault();
}

function installGuards(){
  if(guards)return;
  guards=true;
  document.addEventListener('touchmove',onTouchMove,{capture:true,passive:false});
  document.addEventListener('gesturestart',onGesture,{capture:true,passive:false} as AddEventListenerOptions);
  document.addEventListener('gesturechange',onGesture,{capture:true,passive:false} as AddEventListenerOptions);
  window.addEventListener('resize',scheduleBox);
  window.addEventListener('orientationchange',scheduleBox);
  window.visualViewport?.addEventListener('resize',scheduleBox);
  window.visualViewport?.addEventListener('scroll',scheduleBox);
}

/** Lock or release the play viewport. Leaving play also drops fullscreen and the iOS-style immersive fallback. */
export function syncPlaySurface(next:boolean):void {
  playing=next;
  const root=document.documentElement;
  root.classList.toggle('play-locked',next);
  document.querySelector('meta[name="viewport"]')?.setAttribute('content',next?PLAYING_VIEWPORT:READING_VIEWPORT);
  installGuards();
  if(next)scheduleBox();
  else {
    clearBox();
    root.classList.remove('play-immersive');
    void exitFullscreen().then(publish,publish);
    publish();
  }
}

/** The toolbar control. Escape stays with the arcade shell; this control never handles it. */
export function attachFullscreen(button:HTMLButtonElement, render:(state:ScreenPresentation)=>void):()=>void {
  renderExpanded=render;
  const onClick=()=>{void toggle();};
  const onChange=()=>publish();
  button.addEventListener('click',onClick);
  document.addEventListener('fullscreenchange',onChange);
  document.addEventListener('webkitfullscreenchange',onChange);
  publish();
  return ()=>{
    button.removeEventListener('click',onClick);
    document.removeEventListener('fullscreenchange',onChange);
    document.removeEventListener('webkitfullscreenchange',onChange);
    if(renderExpanded===render)renderExpanded=undefined;
  };
}

async function toggle(){
  const root=document.documentElement;
  const current:ScreenMode=fullscreenActive()?'fullscreen':root.classList.contains('play-immersive')?'immersive':'window';
  const host:ScreenHost={
    get supported(){return fullscreenSupported();},
    get active(){return fullscreenActive();},
    request:()=>requestFullscreen(root),
    exit:()=>exitFullscreen(),
  };
  const next=await nextScreenMode(current,host);
  root.classList.toggle('play-immersive',next==='immersive');
  publish();
}
