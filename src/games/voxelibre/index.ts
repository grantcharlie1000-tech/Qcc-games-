import type {GameContext,GameInstance,GameModule} from '../../core/types';
import {readVoxeLibreEvent} from './bridge';
import './style.css';

const module:GameModule={
  id:'voxelibre',title:'VoxeLibre',cover:'voxelibre',
  rules:'Explore, mine, craft and build in VoxeLibre. Create a world in the game menu and choose Survival or Creative. Move with WASD, look with the mouse, jump with Space, dig with the left mouse button and place blocks with the right. I opens inventory; number keys select the hotbar. Touch controls appear on supported touch devices. Escape opens your study chapter; return and use Continue in the game to resume. Back to library saves and quits. Restart returns to the launcher without deleting worlds. Use World backups before starting to export or import a world. Worlds belong to this browser and device; keep exported backups.',
  mount(container:HTMLElement,context:GameContext):GameInstance {
    const player=document.createElement('div');player.className='voxelibre-player';container.append(player);
    let frame:HTMLIFrameElement|undefined,disposed=false,running=false,ready=false,persistent:boolean|undefined;
    let exiting:Promise<void>|undefined,resolveExit:(()=>void)|undefined,rejectExit:((error:Error)=>void)|undefined;
    let requestId='',sequence=0,paused=false;
    const origin=location.origin;
    function command(command:'pause'|'resume'|'quit'|'settings',id?:string){
      frame?.contentWindow?.postMessage({type:'QCC_VOXELIBRE_COMMAND',command,requestId:id,settings:{sound:context.settings.sound,reducedMotion:context.settings.reducedMotion}},origin);
    }
    function report(message:string){context.setStatus(message);}
    function createFrame(){
      if(disposed)return;
      running=false;ready=false;persistent=undefined;exiting=undefined;resolveExit=undefined;rejectExit=undefined;
      player.replaceChildren();
      frame=document.createElement('iframe');frame.className='voxelibre-frame';frame.title='VoxeLibre game';
      frame.allow='fullscreen; gamepad';frame.allowFullscreen=true;
      frame.src=new URL('voxelibre/index.html?storage=auto',document.baseURI).href;
      frame.addEventListener('load',()=>{command('settings');if(paused)command('pause');});
      player.append(frame);report('Choose Play or World backups. The first game download is about 100 MB.');
    }
    function prepare(){
      if(window.crossOriginIsolated){createFrame();return;}
      const panel=document.createElement('section');panel.className='voxelibre-setup';
      const title=document.createElement('h2');title.textContent='Prepare your browser';
      const message=document.createElement('p');
      message.textContent='VoxeLibre needs a page reload after QCC’s offline support is ready. Your other games are ready to play.';
      const button=document.createElement('button');button.className='game-button';button.textContent='Preparing…';button.disabled=true;
      button.addEventListener('click',()=>location.reload());panel.append(title,message,button);player.replaceChildren(panel);
      if(!window.isSecureContext||!('serviceWorker' in navigator)){
        message.textContent='This browser cannot prepare VoxeLibre here. Open QCC over HTTPS in a current Chrome or Edge browser.';button.remove();return;
      }
      let timer:number|undefined;
      const unavailable=new Promise<never>((_,reject)=>{timer=window.setTimeout(()=>reject(new Error('Browser setup timed out.')),12000);});
      void Promise.race([navigator.serviceWorker.ready,unavailable]).then(()=>{
        if(disposed)return;button.textContent='Reload to enable VoxeLibre';button.disabled=false;
      }).catch(()=>{
        if(disposed)return;message.textContent='Browser setup is unavailable. Reload QCC while online, or try a browser that allows site storage.';button.textContent='Reload QCC';button.disabled=false;
      }).finally(()=>clearTimeout(timer));
    }
    function onMessage(message:MessageEvent){
      const event=readVoxeLibreEvent(message,frame?.contentWindow??null,origin);if(!event||disposed)return;
      if(event.persistent!==undefined)persistent=event.persistent;
      if(event.message)report(event.message);
      if(event.event==='ready'){ready=true;command('settings');if(paused)command('pause');}
      if(event.event==='running'){running=true;if(paused)command('pause');}
      if(event.event==='study')context.openStudy?.();
      if(event.event==='exited'){
        running=false;
        if(exiting&&event.requestId===requestId){resolveExit?.();resolveExit=undefined;rejectExit=undefined;}
        else if(!exiting&&!event.requestId)createFrame();
      }
      if(event.event==='error'&&exiting&&event.requestId===requestId){
        rejectExit?.(new Error(event.message||'VoxeLibre could not finish saving. The game remains open.'));
        exiting=undefined;resolveExit=undefined;rejectExit=undefined;
      }
    }
    window.addEventListener('message',onMessage);
    const instance:GameInstance={
      pause(){paused=true;command('pause');container.focus({preventScroll:true});},
      resume(){paused=false;command('settings');command('resume');},
      async restart(){await instance.beforeLeave!();if(!disposed)createFrame();},
      serialize(){return {version:1};},
      restore(){/* Worlds live in the native filesystem, never localStorage. */},
      beforeLeave(){
        if(disposed||!frame||!ready)return Promise.resolve();if(exiting)return exiting;
        report(running?'Saving your world and closing VoxeLibre…':'Closing VoxeLibre…');requestId=`quit-${++sequence}`;
        exiting=new Promise<void>((resolve,reject)=>{resolveExit=resolve;rejectExit=reject;});command('quit',requestId);return exiting;
      },
      studyStatus(){return persistent===false
        ?'Game paused and kept open. This browser is using temporary world storage; worlds will be lost when the game closes.'
        :'Game paused and kept open. Worlds save separately from arcade progress. Use Back to library to save and quit, and export backups for safekeeping.';},
      dispose(){disposed=true;window.removeEventListener('message',onMessage);frame?.remove();player.remove();}
    };
    prepare();return instance;
  }
};
export default module;
