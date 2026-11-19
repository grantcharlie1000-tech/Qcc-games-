/** Adapter for an optional, separately compiled re3 WebAssembly browser runtime.
 * No reverse-engineered engine source, WASM binary, or GTA III game data lives here.
 */
import type {GameContext,GameInstance,GameModule} from '../../core/types';
import './style.css';

const RUNTIME_ROOT=import.meta.env.BASE_URL+'ports/re3/';
function mount(container:HTMLElement,context:GameContext):GameInstance {
  const root=document.createElement('div');
  root.className='re3-browser';
  root.innerHTML='<div class="re3-message" role="status" aria-live="polite"><h2>GTA III browser port</h2><p class="re3-description">Checking the WebAssembly engine…</p><p class="re3-note">Bring your own legally obtained PC game files. QCC Games does not supply them.</p><a href="https://github.com/Antriksh1984/GTA3-WASM/blob/main/manual.md" target="_blank" rel="noopener noreferrer">Upstream instructions</a></div>';
  container.append(root);
  const message=root.querySelector<HTMLElement>('.re3-message')!;
  const description=root.querySelector<HTMLElement>('.re3-description')!;
  const controller=new AbortController();
  let frame:HTMLIFrameElement|undefined;
  let paused=false;
  let disposed=false;
  context.setLevel('Browser port');
  context.setStatus('Waiting for independently built WebAssembly runtime.');
  async function start():Promise<void> {
    try{
      const response=await fetch(RUNTIME_ROOT+'runtime-ready.json',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('Runtime files not available');
      const marker:unknown=await response.json();
      if(!marker||typeof marker!=='object'||!('runtime' in marker)||(marker as {runtime:unknown}).runtime!=='re3-wasm')throw new Error('Runtime marker invalid');
      if(disposed)return;
      frame=document.createElement('iframe');
      frame.className='re3-iframe';
      frame.title='Unofficial GTA III WebAssembly browser runtime';
      frame.src=RUNTIME_ROOT+'index.html';
      frame.referrerPolicy='no-referrer';
      frame.setAttribute('allow','fullscreen; gamepad');
      frame.setAttribute('allowfullscreen','');
      // IndexedDB imports/saves require a regular origin. The third-party runtime
      // must be reviewed before being hosted on the same origin as QCC account data.
      frame.style.visibility=paused?'hidden':'visible';
      if(paused)frame.setAttribute('inert','');
      root.prepend(frame);
      message.hidden=!paused;
      description.textContent=paused?'Use the in-game pause menu first; QCC can hide but cannot reliably pause the separate engine.':'Choose your legally obtained GTA III PC game folder inside the embedded runtime.';
      context.setStatus('Browser runtime loaded. Import your legally obtained game files inside it.');
    }catch{
      if(disposed||controller.signal.aborted)return;
      description.textContent='This deployment does not contain the compiled WebAssembly runtime. Build and stage the upstream port using docs/RE3_BROWSER_PORT.md.';
      context.setStatus('Game unavailable: its compiled WebAssembly runtime is not deployed.');
    }
  }
  void start();
  return {
    pause(){
      paused=true;
      // This blocks input but is not an engine-level pause.
      if(frame){frame.style.visibility='hidden';frame.setAttribute('inert','');message.hidden=false;}
    },
    resume(){
      paused=false;
      if(frame){frame.style.visibility='visible';frame.removeAttribute('inert');message.hidden=true;}
    },
    restart(){
      if(!frame)return false;
      // Reboot the runtime; upstream IndexedDB assets and save files survive.
      frame.src=RUNTIME_ROOT+'index.html?reload='+Date.now();
    },
    serialize(){return {version:1};},
    restore(_data:unknown){/* Upstream runtime owns save slots in IndexedDB. */},
    dispose(){disposed=true;controller.abort();frame?.remove();root.remove();}
  };
}
const game:GameModule=Object.freeze({
  id:'re3',title:'GTA III (unofficial port)',cover:'game-art/re3/cover.svg',
  rules:'Unofficial re3 WebAssembly browser port. Choose your own legally obtained GTA III PC game folder in the game window. Use keyboard and mouse; Esc releases pointer lock. Save and load from the in-game menu. The QCC pause button hides the game but cannot guarantee a pause of its simulation; pause in-game before opening Study or another QCC screen. Imported game files and saves belong to this browser, not QCC cloud sync.',
  mount
});
export default game;
