import{BUTTON,capsuleHit,type Entity,type InputFrame,type Point,type Simulation}from'./sim';
import{PANEL_FLAG,type WallPanel}from'./walls';
import{ImpactPool}from'./impact-pool';
import{CUSTOMS_HOUSE}from'./maps/customs-house';
type Kind='reinforce'|'barricade'|'reclaim'|'charge';
const kinds:Kind[]=['reinforce','barricade','reclaim','charge'];
interface Stock{charges:number;barricades:number;impacts:number;last:number;melee:number;reinforced:number;releaseUse:boolean;botPanel?:number}
interface Hold{kind:Kind;panel:number;col:number;row:number;elapsed:number;duration:number;origin:Point;point:Point}
export interface PlacedCharge{owner:number;panel:number;col:number;cell:number;point:Point;at:number}
export interface ToolHint{title:string;detail:string;progress:number;active:boolean}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const eye=(e:Entity)=>({x:e.x,y:e.y+(e.crouch?1.08:1.62),z:e.z});
function aim(state:Simulation,e:Entity,range=1.5,slots=false,anyWood=false,yaw=e.yaw,pitch=e.pitch){
 const o=eye(e),c=Math.cos(pitch),d={x:-Math.sin(yaw)*c,y:Math.sin(pitch),z:-Math.cos(yaw)*c};let best: {panel:WallPanel;col:number;row:number;point:Point;distance:number}|undefined;
 for(const p of state.walls.panels){const normal=p.axis==='x'?'z':'x',v=d[normal];if(Math.abs(v)<1e-5)continue;const t=(p[normal]-o[normal])/v;if(t<0||t>range||(best&&t>=best.distance))continue;const point={x:o.x+d.x*t,y:o.y+d.y*t,z:o.z+d.z*t},col=Math.floor(((p.axis==='x'?point.x:point.z)-(p.axis==='x'?p.x:p.z))/.5),row=Math.floor((point.y-p.y)/.5);if(col<0||col>=p.cols||row<0||row>=p.rows)continue;const cell=state.walls.cellIndex(p.id,col,row);if(state.walls.states[cell]===3&&!(slots&&p.material==='wood'&&(!(p.flags&PANEL_FLAG.BARRICADE)||anyWood)))continue;
  if(state.world.blocked(o,{x:point.x-d.x*.04,y:point.y-d.y*.04,z:point.z-d.z*.04}))continue;best={panel:p,col,row,point,distance:t};
 }return best;
}
function objectiveContext(state:Simulation,e:Entity){
 if(!['action','planted'].includes(state.phase))return null;const o=state.objective;
 if(o.state==='planted'&&!e.attacking&&distance(e,o.position)<=1.5)return{title:'HOLD F · DISABLE CRACKER',detail:'6 SECOND HOLD',progress:o.interactionSeat===e.seat?o.progress/6:0,active:true};
 if(o.state==='carried'&&o.carrier===e.seat&&e.attacking){const box=state.site?.box;if(box&&e.x>=box[0]&&e.x<=box[3]&&e.y>=box[1]&&e.y<=box[4]&&e.z>=box[2]&&e.z<=box[5])return{title:'HOLD F · PLANT CRACKER',detail:'5 SECOND HOLD',progress:o.interactionSeat===e.seat?o.progress/5:0,active:true};}return null;
}
/** Bounded presentation data rides the authoritative snapshot; it never grants inventory. */
export function toolHint(state:Simulation,e:Entity|undefined):ToolHint|undefined{
 if(!e||e.hp<=0||!['prep','action','planted'].includes(state.phase))return;const objective=objectiveContext(state,e);if(objective)return objective;
 const data=Array.isArray(state.tools)&&state.tools[0]===1&&state.tools[1]===state.round?state.tools:null;
 const stock=data?.[4]?.find?.((n:any[])=>n[0]===e.seat),active=data?.[5]?.find?.((n:any[])=>n[0]===e.seat);
 if(stock?.[4])return{title:'RELEASE F',detail:'TO INTERACT AGAIN',progress:0,active:true};
 if(active){const labels=['REINFORCING','BARRICADING','REMOVING BARRICADE','PLACING CHARGE'];return{title:labels[active[1]]??'INTERACTING',detail:'KEEP HOLDING',progress:active[2]/active[3],active:true};}
 if(e.attacking&&data?.[6]?.some?.((n:any[])=>n[0]===e.seat))return{title:'CHARGE READY',detail:'PRESS 3 TO DETONATE',progress:0,active:false};
 const hit=aim(state,e,e.attacking?1.5:1.2,!e.attacking);if(!hit)return;
 if(e.attacking&&(hit.panel.flags&PANEL_FLAG.REINFORCED))return{title:'REINFORCED WALL',detail:'SOFT CHARGES CANNOT BREACH',progress:0,active:false};
 if(e.attacking)return (stock?.[1]??2)>0?{title:'HOLD 3 · BREACH CHARGE',detail:`${stock?.[1]??2} CHARGES`,progress:0,active:false}:undefined;
 const p=hit.panel;if(p.material==='wood'){
  if(!(p.flags&PANEL_FLAG.BARRICADE))return(stock?.[2]??2)>0?{title:'HOLD F · BARRICADE',detail:`${stock?.[2]??2} BARRICADES`,progress:0,active:true}:undefined;
  const ownership=data?.[7]?.find?.((n:number[])=>n[0]===p.id),owner=ownership?.[1]??p.owner,pristine=ownership?ownership[2]===1:Array.from(state.walls.hp.subarray(p.firstCell,p.firstCell+p.cellCount)).every(hp=>hp===40);
  return owner===e.seat&&pristine?{title:'HOLD F · REMOVE BARRICADE',detail:'REFUNDS ONE BARRICADE',progress:0,active:true}:{title:'WOOD BARRICADE',detail:'V · BASH TO OPEN',progress:0,active:false};
 }
 const pool=data?.[e.team===0?2:3]??state.entities.filter(n=>n.team===e.team).length*2;
 if(state.walls.canReinforce(p.id)&&pool>0)return{title:'HOLD F · REINFORCE',detail:`${pool} TEAM REINFORCEMENTS`,progress:0,active:true};
}
/** Runs only from the host's Simulation.toolStep; all range/phase/count checks live here. */
export class WallTools{
 readonly charges=new Map<number,PlacedCharge>();private stock=new Map<number,Stock>();private holds=new Map<number,Hold>();private pool:[number,number]=[0,0];private round=-1;private side=-1;private published='';private reliable='';private impacts:ImpactPool;private impactTick=-1;
 constructor(readonly state:Simulation){this.impacts=new ImpactPool({contact:(from,to)=>state.world.contact?.(from,to)??null},(owner,point)=>{state.walls.explode('impact',point);const actor=state.entities.find(e=>e.seat===owner);if(actor)this.blast(actor,point,15,1.5);});this.reset();}
 private reset(){this.round=this.state.round;this.side=this.state.attackTeam;this.impacts.clear();this.impactTick=-1;this.stock.clear();this.holds.clear();this.charges.clear();for(const t of [0,1]as const)this.pool[t]=this.state.entities.filter(e=>e.team===t).length*2;for(const e of this.state.entities)this.stock.set(e.seat,{charges:e.attacking?2:0,barricades:e.attacking?0:2,impacts:e.attacking?0:2,last:0,melee:0,reinforced:0,releaseUse:false});this.publish();}
 inventory(seat:number){const s=this.stock.get(seat),e=this.state.entities.find(e=>e.seat===seat);return{charges:s?.charges??0,barricades:s?.barricades??0,impacts:s?.impacts??0,pool:e?this.pool[e.team]:0};}
 sync(){if(this.round!==this.state.round||this.side!==this.state.attackTeam)this.reset();}
 step(e:Entity,i:InputFrame,dt:number){
  this.sync();const stock=this.stock.get(e.seat);if(!stock||e.hp<=0||!['prep','action','planted'].includes(this.state.phase)){this.holds.delete(e.seat);return;}
  if(this.impactTick!==this.state.tick){this.impactTick=this.state.tick;this.impacts.update(dt);if(e.hp<=0){this.holds.delete(e.seat);this.publish();return;}}
  const obj=objectiveContext(this.state,e);if(e.bot&&!obj)this.bot(e,i,stock);
  const pressed=i.buttons,last=stock.last;stock.last=pressed;if(!(pressed&BUTTON.INTERACT))stock.releaseUse=false;
  if((pressed&BUTTON.MELEE)&&this.state.phase!=='prep'&&this.state.time>=stock.melee){stock.melee=this.state.time+800;const origin=eye(e),c=Math.cos(e.pitch),dir={x:-Math.sin(e.yaw)*c,y:Math.sin(e.pitch),z:-Math.cos(e.yaw)*c};let best=1.6,target:Entity|undefined;
   for(const other of this.state.entities){if(other.team===e.team||other.hp<=0)continue;const hit=capsuleHit(origin,dir,other,other.crouch?1.25:1.83);if(hit!==null&&hit<best&&!this.state.world.blocked(origin,{x:origin.x+dir.x*hit,y:origin.y+dir.y*hit,z:origin.z+dir.z*hit})){best=hit;target=other;}}
   const hit=aim(this.state,e,1.6);if(hit&&hit.distance<best)this.state.walls.damageCell(this.state.walls.cellIndex(hit.panel.id,hit.col,hit.row),'melee');else if(target)this.damage(e,target,40);
  }
  if((pressed&BUTTON.IMPACT)&&!(last&BUTTON.IMPACT)&&!e.attacking&&stock.impacts>0&&this.state.phase!=='prep'&&this.impacts.launch(e))stock.impacts--;

  if((pressed&BUTTON.CHARGE)&&!(last&BUTTON.CHARGE)&&e.attacking&&this.charges.has(e.seat)){this.detonate(e);this.holds.delete(e.seat);this.publish();return;}
  let kind:Kind|undefined,hit=aim(this.state,e,e.attacking?1.5:1.2,!e.attacking&&!!(pressed&BUTTON.INTERACT));
  if((pressed&BUTTON.CHARGE)&&e.attacking&&this.state.phase!=='prep'&&stock.charges>0&&!this.charges.has(e.seat)&&hit&&!(hit.panel.flags&PANEL_FLAG.ATTACHED))kind='charge';
  else if((pressed&BUTTON.INTERACT)&&!stock.releaseUse&&!obj&&!e.attacking&&hit){const p=hit.panel;if(p.material==='wood'){if(!(p.flags&PANEL_FLAG.BARRICADE)&&stock.barricades>0)kind='barricade';else if(p.owner===e.seat&&this.state.walls.hp.subarray(p.firstCell,p.firstCell+p.cellCount).every(hp=>hp===40))kind='reclaim';}else if(this.state.walls.canReinforce(p.id)&&this.pool[e.team]>0)kind='reinforce';}
  if(!kind||!hit){this.holds.delete(e.seat);this.publish();return;}
  let hold=this.holds.get(e.seat);if(!hold||hold.kind!==kind||hold.panel!==hit.panel.id||distance(hold.origin,e)>.5||(kind==='charge'&&(hold.col!==hit.col||hold.row!==hit.row))){hold={kind,panel:hit.panel.id,col:hit.col,row:hit.row,elapsed:0,duration:kind==='reinforce'?2.5:kind==='charge'?1:1.5,origin:{x:e.x,y:e.y,z:e.z},point:hit.point};this.holds.set(e.seat,hold);}
  hold.elapsed+=Math.max(0,Math.min(dt,.1));if(e.bot){i.x=0;i.z=0;}
  if(hold.elapsed+1e-7>=hold.duration){const store=this.state.walls;
   if(kind==='reinforce'&&store.reinforce(hold.panel)){this.pool[e.team]--;stock.reinforced++;}
   if(kind==='barricade'&&store.placeBarricade(hold.panel,e.seat))stock.barricades--;
   if(kind==='reclaim'&&store.reclaimBarricade(hold.panel,e.seat))stock.barricades++;
   if(kind==='charge'&&store.setAttached(hold.panel,true)){stock.charges--;const cell=store.cellIndex(hold.panel,hold.col,hold.row);this.charges.set(e.seat,{owner:e.seat,panel:hold.panel,col:hold.col,cell,point:hold.point,at:this.state.time});}
   if(kind!=='charge')stock.releaseUse=true;this.holds.delete(e.seat);
  }this.publish();
 }
 hitCharge(cell:number){for(const[seat,charge]of this.charges)if(charge.cell===cell){this.charges.delete(seat);this.state.walls.setAttached(charge.panel,false);this.publish();return true;}return false;}
 private detonate(e:Entity){const charge=this.charges.get(e.seat);if(!charge)return;this.charges.delete(e.seat);this.state.walls.setAttached(charge.panel,false);this.state.walls.breach(charge.panel,charge.col,'charge');this.blast(e,charge.point,60,3);}
 private damage(owner:Entity,target:Entity,amount:number){target.hp=Math.max(0,target.hp-Math.round(amount));this.state.events.push({type:'damage',seat:owner.seat,target:target.seat,hp:target.hp});if(!target.hp){owner.kills++;target.deaths++;this.state.events.push({type:'eliminated',seat:owner.seat,target:target.seat});}}
 private blast(e:Entity,point:Point,max:number,radius:number){for(const target of this.state.entities){const d=distance(target,point);if(target.team!==e.team&&target.hp>0&&d<radius&&!this.state.world.blocked(point,eye(target)))this.damage(e,target,max*(d<=radius/2?1:2*(1-d/radius)));}}
 private bot(e:Entity,i:InputFrame,stock:Stock){
  if(stock.releaseUse){i.buttons=0;i.x=i.z=0;return;}
  const obstacle=aim(this.state,e,1.5,true,true,i.yaw,0);if(obstacle?.panel.material==='wood'&&(obstacle.panel.flags&PANEL_FLAG.BARRICADE)&&!this.state.walls.hasDoorway(obstacle.panel.id)){const p=obstacle.panel,start=Math.max(0,Math.floor(p.cols/2)-1),width=Math.min(2,p.cols);let target=-1;for(let row=0;row<Math.min(4,p.rows)&&target<0;row++)for(let col=start;col<start+width;col++){const cell=this.state.walls.cellIndex(p.id,col,row);if(this.state.walls.states[cell]!==3){target=cell;break;}}if(target>=0){if(obstacle.distance>.65){i.pitch=0;i.x=0;i.z=127;i.buttons=0;return;}const point=this.state.walls.cellCenter(target),origin=eye(e);i.yaw=Math.atan2(-(point.x-e.x),-(point.z-e.z));i.pitch=Math.atan2(point.y-origin.y,Math.hypot(point.x-origin.x,point.z-origin.z));i.x=i.z=0;i.buttons=BUTTON.MELEE;return;}}
  if(this.charges.has(e.seat)){i.buttons=(stock.last&BUTTON.CHARGE)?0:BUTTON.CHARGE;i.x=i.z=0;return;}
  const reinforce=!e.attacking&&this.state.phase==='prep'&&this.pool[e.team]>0&&stock.reinforced<2,breach=e.attacking&&this.state.phase==='action'&&stock.charges===2;
  if(!reinforce&&!breach)return;const data=CUSTOMS_HOUSE.siteData[this.state.objective.site??'A'];
  let target=stock.botPanel===undefined?undefined:this.state.walls.getPanel(stock.botPanel);
  const available=(p:WallPanel)=>p.material==='drywall'&&p.y===0&&!(p.flags&PANEL_FLAG.ATTACHED)&&(!reinforce||this.state.walls.canReinforce(p.id))&&![...this.holds].some(([seat,h])=>seat!==e.seat&&h.panel===p.id);
  if(!target||!available(target)){const list=reinforce?data.reinforcePanels:this.state.walls.panels.filter(p=>p.wall==='south'||p.wall==='corridor-north').map(p=>p.id);target=list.map(id=>this.state.walls.getPanel(id)).filter((p):p is WallPanel=>!!p&&available(p)).sort((a,b)=>distance(e,{x:a.x+a.cols*.25,y:0,z:a.z})-distance(e,{x:b.x+b.cols*.25,y:0,z:b.z}))[0];stock.botPanel=target?.id;}
  if(!target)return;const cx=target.x+(target.axis==='x'?target.cols*.25:0),cz=target.z+(target.axis==='z'?target.cols*.25:0),normal=target.axis==='x'?'z':'x',sign=(e[normal]-target[normal])>=0?1:-1,goal={x:cx+(normal==='x'?sign*.9:0),y:e.y,z:cz+(normal==='z'?sign*.9:0)};
  if(Math.hypot(e.x-goal.x,e.z-goal.z)>.25){const path=this.state.world.path?.(e,goal),next=path?.slice(1).find(p=>Math.hypot(e.x-p.x,e.z-p.z)>.4)??goal;i.yaw=Math.atan2(-(next.x-e.x),-(next.z-e.z));i.pitch=0;i.x=0;i.z=127;i.buttons=0;}else{i.yaw=Math.atan2(-(cx-e.x),-(cz-e.z));i.pitch=0;i.x=i.z=0;i.buttons=reinforce?BUTTON.INTERACT:BUTTON.CHARGE;}
 }
 private publish(){const packet=[1,this.state.round,...this.pool,[...this.stock].map(([seat,s])=>[seat,s.charges,s.barricades,s.impacts,s.releaseUse?1:0]),[...this.holds].map(([seat,h])=>[seat,kinds.indexOf(h.kind),Math.round(h.elapsed*1000),h.duration*1000,h.panel]),[...this.charges].map(([seat,c])=>[seat,c.panel,c.col,c.cell]),this.state.walls.panels.filter(p=>p.flags&PANEL_FLAG.BARRICADE).map(p=>[p.id,p.owner,this.state.walls.hp.subarray(p.firstCell,p.firstCell+p.cellCount).every(hp=>hp===40)?1:0]),this.impacts.snapshot()];const reliable=JSON.stringify([packet[1],packet[2],packet[3],packet[4],packet[6],packet[7],(packet[8]as number[][]).map(p=>p.slice(0,2))]);if(reliable!==this.reliable){this.reliable=reliable;this.state.events.push({type:'wall',seat:0});}const key=JSON.stringify(packet);if(key!==this.published){this.published=key;this.state.tools=packet;}}
}
