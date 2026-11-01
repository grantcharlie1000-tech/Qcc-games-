export type Action='left'|'right'|'cw'|'ccw'|'soft'|'hard'|'hold';
type RepeatAction='left'|'right'|'soft';
const DAS=133,ARR=33;

/** One pointer sequence owns one intent. Fast drops never also score soft cells. */
export class PieceGesture {
 private axis:'horizontal'|'vertical'|null=null;
 private anchorX:number;
 private softCells=0;
 private travel=0;
 private done=false;
 constructor(private startX:number,private startY:number,private started:number,private cell:number){this.anchorX=startX;}
 move(x:number,y:number,now:number):Action[]{
  if(this.done)return [];
  const dx=x-this.startX,dy=y-this.startY,elapsed=Math.max(1,now-this.started);
  this.travel=Math.max(this.travel,Math.hypot(dx,dy));
  if(!this.axis&&Math.max(Math.abs(dx),Math.abs(dy))>=10)this.axis=Math.abs(dx)>Math.abs(dy)?'horizontal':'vertical';
  if(this.axis==='horizontal'){
   const steps=Math.trunc((x-this.anchorX)/this.cell);
   this.anchorX+=steps*this.cell;
   return Array<Action>(Math.abs(steps)).fill(steps<0?'left':'right');
  }
  // Defer a fast downward stroke until release; a committed soft drag stays soft.
  if(this.axis==='vertical'&&dy>0&&(this.softCells>0||elapsed>=280||dy/elapsed<.7))return this.drop(dy);
  return [];
 }
 finish(x:number,y:number,now:number):Action[]{
  if(this.done)return [];
  const actions=this.move(x,y,now),dy=y-this.startY,elapsed=Math.max(1,now-this.started);
  this.done=true;
  if(this.axis==='vertical'){
   if(dy<=-Math.max(28,this.cell*.9))return ['hold'];
   if(!this.softCells&&dy>=Math.max(36,this.cell*1.25)&&elapsed<=280&&dy/elapsed>=.7)return ['hard'];
   return [...actions,...this.drop(dy)];
  }
  if(!this.axis&&this.travel<10&&elapsed<=280)return ['cw'];
  return actions;
 }
 cancel(){this.done=true;}
 private drop(dy:number):Action[]{
  const target=Math.max(0,Math.floor(dy/this.cell)),steps=Math.max(0,target-this.softCells);
  this.softCells=Math.max(this.softCells,target);
  return Array<Action>(steps).fill('soft');
 }
}

/** Browser repeat is ignored. rAF drives repeat on both desktop and mobile keyboards. */
export class RepeatInput {
 private held=new Map<string,{action:RepeatAction;next:number}>();
 press(key:string,action:RepeatAction,now:number):Action[]{
  if(this.held.has(key))return [];
  this.held.set(key,{action,next:now+(action==='soft'?ARR:DAS)});
  return [action];
 }
 release(key:string,now:number){
  const item=this.held.get(key);this.held.delete(key);
  if(item&&item.action!=='soft')for(const other of this.held.values())if(other.action!=='soft')other.next=now+DAS;
 }
 tick(now:number):Action[]{
  let horizontal:{action:RepeatAction;next:number}|undefined;
  for(const item of this.held.values())if(item.action!=='soft')horizontal=item;
  const actions:Action[]=[];
  for(const item of this.held.values()){
   if(item.action!=='soft'&&item!==horizontal)continue;
   let count=0;
   while(now>=item.next&&count++<8){actions.push(item.action);item.next+=ARR;}
   if(now>=item.next)item.next=now+ARR;
  }
  return actions;
 }
 clear(){this.held.clear();}
}
