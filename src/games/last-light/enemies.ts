import type {Rect} from './levels';
export interface Enemy {id:number;platform:number;kind:'crawler'|'moth';x:number;y:number;travel:number;period:number;offset:number}
/** Patrol, pause, turn. Both enemy silhouettes expose the same stomp/dash rule. */
export function enemyAt(e:Enemy,t:number):Rect&{facing:number;turning:boolean}{
 const phase=((t/e.period+e.offset)%1+1)%1,p=phase<.42?phase/.42:phase<.5?1:phase<.92?1-(phase-.5)/.42:0;
 const x=e.x+(p*2-1)*e.travel,w=e.kind==='crawler'?22:20,h=e.kind==='crawler'?16:18;
 return {x:x-w/2,y:e.y-h-(e.kind==='moth'?Math.sin(t*2.6+e.id)*10:0),w,h,facing:phase<.5?1:-1,turning:phase>=.42&&phase<.5||phase>=.92};
}
export function enemyBounds(e:Enemy):Rect{return {x:e.x-e.travel-16,y:e.y-(e.kind==='moth'?34:20),w:e.travel*2+32,h:e.kind==='moth'?48:24};}
