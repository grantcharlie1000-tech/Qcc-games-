import {enqueue,type Direction,type SnakeState} from './model';
import {advancePresentation,type SnakePresentation} from './presentation';

type Turn={time:number;direction:Direction;order:number};
type Snapshot={time:number;state:SnakeState;view:SnakePresentation;order:number};

/** In-memory active-run history; never included in a save. */
export class SnakeTimeline {
 private snapshots:Snapshot[]=[];
 private turns:Turn[]=[];
 private order=0;
 constructor(public state:SnakeState,public view:SnakePresentation,public last:number){this.capture();}
 get snapshotCount():number{return this.snapshots.length;}
 private capture(){
  const previous=this.snapshots.at(-1);
  if(previous&&(previous.state.score!==this.state.score||previous.state.phase!==this.state.phase))this.snapshots=[];
  this.snapshots.push({time:this.last,state:structuredClone(this.state),view:structuredClone(this.view),order:this.order});
  // Keep one boundary before the window, so an input near its edge has a starting point.
  while(this.snapshots.length>1&&this.snapshots[1].time<this.last-250)this.snapshots.shift();
  const oldest=this.snapshots[0].order;this.turns=this.turns.filter(turn=>turn.order>oldest);
 }
 advance(time:number){
  time=Math.max(this.last,time);
  advancePresentation(this.state,this.view,time-this.last);this.last=time;
  const previous=this.snapshots.at(-1)!;
  if(this.state.ticks!==previous.state.ticks||this.state.score!==previous.state.score||this.state.phase!==previous.state.phase)this.capture();
 }
 turn(direction:Direction,time:number){
  const target=this.last;
  if(time>=target){this.advance(time);enqueue(this.state,direction);this.turns.push({time,direction,order:++this.order});this.capture();return;}
  const snapshot=[...this.snapshots].reverse().find(item=>item.time<=time);
  if(!snapshot){enqueue(this.state,direction);this.turns.push({time:target,direction,order:++this.order});this.capture();return;}
  const later=this.turns.filter(turn=>turn.order>snapshot.order);
  later.push({time,direction,order:++this.order});
  later.sort((a,b)=>a.time-b.time||a.order-b.order);
  this.state=structuredClone(snapshot.state);this.view=structuredClone(snapshot.view);this.last=snapshot.time;
  this.snapshots=this.snapshots.filter(item=>item.order<=snapshot.order&&item.time<=snapshot.time);
  this.turns=this.turns.filter(turn=>turn.order<=snapshot.order);this.order=snapshot.order;
  for(const turn of later){this.advance(turn.time);if(this.state.phase!=='running')break;enqueue(this.state,turn.direction);this.turns.push({time:turn.time,direction:turn.direction,order:++this.order});this.capture();}
  this.advance(target);
 }
}
