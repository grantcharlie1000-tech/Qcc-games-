// Advancements and statistics service. A modern (Java 1.20/1.21) advancement tree unlocked from game.events and from
// polling the inventory (advancements-tracker.ts), shown as top-right toasts with the `toast` sound
// (advancements-toasts.ts), an Advancements screen body with the trees and statistics (advancements-screen.ts) and
// persistence. Logic is DOM-free; DOM is only created when a toast shows or ui mounts the screen.
import type {AdvancementsService,AdvancementView,Game} from '../engine/contracts';
import {AdvancementTracker} from './advancements-tracker';
import {ToastLayer,ToastQueue,TOAST_HEADINGS} from './advancements-toasts';
import {mountAdvancementsScreen,type MountedScreen,type ScreenTab} from './advancements-screen';
import type {Statistics} from './advancements-stats';
import './advancements.css';

export interface AdvancementsController extends AdvancementsService{
  /** [done, total] of a counted goal (A Balanced Diet, Monsters Hunted, Two by Two). */
  progress(id:string):[number,number]|undefined;
  /** Snapshot of the statistics. */
  statistics():Statistics;
  /** Toasts waiting and on screen. */
  readonly toasts:ToastQueue;
}
/** Seconds between statistics refreshes while the screen is open. */
const STATS_REFRESH=.5;
const canUseDom=(root:unknown)=>typeof document!=='undefined'&&!!root&&typeof (root as HTMLElement).append==='function';

export function createAdvancements(game:Game):AdvancementsController{
  let layer:ToastLayer|null=null,screen:MountedScreen|null=null,tab:ScreenTab='minecraft',sinceStats=0,disposed=false;
  let pumpId=0,pumpLast=0;
  const toasts=new ToastQueue(defs=>{
    game.sounds.play('toast',null,defs.some(d=>d.frame==='challenge')?{pitch:1.25}:undefined);
    game.context.announce(defs.map(d=>`${TOAST_HEADINGS[d.frame]} ${d.title}.`).join(' '));
  });
  const view=()=>layer??=canUseDom(game.root)?new ToastLayer(game.root):null;
  // In the browser toasts run on their own animation frames and wall-clock time, like vanilla: the engine stops drawing
  // frames in its menus (pause, death) and caps its frame dt. The loop only runs while toasts exist. Without
  // requestAnimationFrame (unit tests) the engine's frame() drives them instead.
  const hasRaf=typeof requestAnimationFrame==='function';
  const pump=(now:number)=>{
    pumpId=0;
    toasts.update(pumpLast?Math.min(now-pumpLast,250):0,view(),game.reducedMotion);pumpLast=now;
    if(!toasts.idle&&!disposed)pumpId=requestAnimationFrame(pump);else pumpLast=0;
  };
  const stopPump=()=>{if(pumpId)cancelAnimationFrame(pumpId);pumpId=0;pumpLast=0;};
  const tracker=new AdvancementTracker(game,{
    granted:def=>{toasts.push(def);if(hasRaf&&!pumpId&&!disposed)pumpId=requestAnimationFrame(pump);},
    changed:()=>screen?.refresh('tree')});
  return{
    toasts,
    init(){tracker.attach();},
    tick(){tracker.tick();},
    frame(dt){
      if(!hasRaf&&!toasts.idle)toasts.update(dt*1000,view(),game.reducedMotion);
      if(screen&&(sinceStats+=dt)>=STATS_REFRESH){sinceStats=0;screen.refresh('stats');}
    },
    list:():AdvancementView[]=>tracker.list(),
    has:id=>tracker.has(id),
    grant(id){tracker.grant(id);},
    progress:id=>tracker.progress(id),
    statistics:()=>tracker.statistics(),
    mountScreen(container){
      screen?.unmount();
      const mounted=mountAdvancementsScreen(container,{tracker,game,tab,onTab:t=>{tab=t;}});
      screen=mounted;sinceStats=0;
      return()=>{mounted.unmount();if(screen===mounted)screen=null;};
    },
    reset(){stopPump();toasts.clear(layer);tracker.reset();},
    serialize:()=>tracker.serialize(),
    restore(data){tracker.restore(data);},
    dispose(){disposed=true;stopPump();tracker.detach();toasts.clear(layer);layer?.dispose();layer=null;screen?.unmount();screen=null;}
  };
}
