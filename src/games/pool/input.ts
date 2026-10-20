import {FIELD} from './model';
export interface Point{x:number;y:number}
export interface Drag{kind:'aim'|'pull';start:Point;angle:number;power:number;deadzone:number}
/** Canvas is a clockwise rotation of the unchanged, persisted physics table. */
export function tablePoint(clientX:number,clientY:number,rect:{left:number;top:number;width:number;height:number}):Point{
 return {x:(clientY-rect.top)*440/rect.height,y:840-(clientX-rect.left)*840/rect.width};
}
export function onFelt(p:Point){return p.x>=FIELD.left&&p.x<=FIELD.right&&p.y>=FIELD.top&&p.y<=FIELD.bottom;}
export function beginDrag(p:Point,cue:Point,angle:number,hitRadius:number):Drag|null{
 if(!onFelt(p))return null;
 const kind=Math.hypot(p.x-cue.x,p.y-cue.y)<=hitRadius?'pull':'aim';
 return {kind,start:p,angle:kind==='aim'?Math.atan2(p.y-cue.y,p.x-cue.x):angle,power:0,deadzone:hitRadius*.45};
}
export function moveDrag(drag:Drag,p:Point,cue:Point){
 if(drag.kind==='aim'){if(Math.hypot(p.x-cue.x,p.y-cue.y)>3)drag.angle=Math.atan2(p.y-cue.y,p.x-cue.x);}
 else if(Math.hypot(p.x-cue.x,p.y-cue.y)<=drag.deadzone||Math.hypot(p.x-drag.start.x,p.y-drag.start.y)<=drag.deadzone)drag.power=0;
 else drag.power=Math.max(0,Math.min(1,(-(p.x-drag.start.x)*Math.cos(drag.angle)-(p.y-drag.start.y)*Math.sin(drag.angle))/120));
}
export function releaseDrag(drag:Drag){return drag.kind==='pull'&&drag.power>=.08?{angle:drag.angle,power:drag.power}:null;}
