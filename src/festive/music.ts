import {LoopMusic} from '../core/music';
import {christmas} from './festive';

/** Watch pages are quiet before the frame loads, so video never competes with the app tune. */
export const christmasMusicAllowed=(hash:string,studying:boolean)=>!studying&&!/^#\/study(?:[/?]|$)/.test(hash)&&!(hash.startsWith('#/movies/')&&/\/play(?:[?#]|$)/.test(hash));

export function mountChristmasMusic(options:{sound:()=>boolean;studying:()=>boolean}){
 const player=new LoopMusic(`${import.meta.env.BASE_URL}audio/christmas/snowfall-on-the-square.mp3`,.12);
 const abort=new AbortController(),{signal}=abort;
 let activated=false,away=false,focused=document.hasFocus(),disposed=false;
 function sync(){
  if(disposed)return;
  const allowed=activated&&!away&&focused&&!document.hidden&&christmas()&&christmasMusicAllowed(location.hash,options.studying());
  player.sync(allowed,options.sound());
 }
 function gesture(event:Event){if(!event.isTrusted)return;activated=true;focused=true;sync();player.unlock();}
 document.addEventListener('pointerdown',gesture,{capture:true,signal});
 document.addEventListener('keydown',gesture,{capture:true,signal});
 window.addEventListener('hashchange',sync,{signal});
 document.addEventListener('visibilitychange',sync,{signal});
 window.addEventListener('blur',()=>{focused=false;sync();},{signal});
 window.addEventListener('focus',()=>{focused=true;sync();},{signal});
 window.addEventListener('pagehide',()=>{away=true;sync();},{signal});
 window.addEventListener('pageshow',()=>{away=false;focused=document.hasFocus();sync();},{signal});
 sync();
 return {sync,dispose(){if(disposed)return;disposed=true;abort.abort();player.dispose();}};
}
