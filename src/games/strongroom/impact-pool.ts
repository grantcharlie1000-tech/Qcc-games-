import type {Entity,Point,SimWorld} from './sim';

export const IMPACT_CAPACITY=20;
export type ImpactRow=[number,number,number,number,number];
const finite=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
const cm=(value:number)=>Math.round(Math.max(-327.67,Math.min(327.67,value))*100)||0;

/** Host-only ballistic impacts. launch/update allocate no projectile objects or scratch vectors. */
export class ImpactPool{
 private positions=new Float64Array(IMPACT_CAPACITY*3);
 private velocities=new Float64Array(IMPACT_CAPACITY*3);
 private ages=new Float64Array(IMPACT_CAPACITY);
 private ids=new Int32Array(IMPACT_CAPACITY);
 private owners=new Int8Array(IMPACT_CAPACITY);
 private count=0;
 private nextId=1;
 private disposed=false;
 private from:Point={x:0,y:0,z:0};
 private to:Point={x:0,y:0,z:0};
 private impact:Point={x:0,y:0,z:0};

 /** The callback point is borrowed scratch: consume it synchronously, or copy it if retaining it. */
 constructor(private world:Pick<SimWorld,'contact'>,private onImpact:(owner:number,point:Point)=>void){}
 get activeCount(){return this.count;}
 launch(e:Entity):boolean{
  if(this.disposed||this.count>=IMPACT_CAPACITY||!Number.isInteger(e.seat)||e.seat<0||e.seat>=10||!finite(e)||
   Math.abs(e.x)>327.67||Math.abs(e.y)>327.67||Math.abs(e.z)>327.67||!Number.isFinite(e.yaw)||!Number.isFinite(e.pitch)||e.hp<=0)return false;
  const slot=this.count++,at=slot*3,c=Math.cos(e.pitch);
  this.positions[at]=e.x;this.positions[at+1]=e.y+(e.crouch?1.08:1.62);this.positions[at+2]=e.z;
  this.velocities[at]=-Math.sin(e.yaw)*c*12;this.velocities[at+1]=Math.sin(e.pitch)*12+1.5;this.velocities[at+2]=-Math.cos(e.yaw)*c*12;
  this.ages[slot]=0;this.owners[slot]=e.seat;
  let id:number,used:boolean;
  do{id=this.nextId;this.nextId=id===0x7fffffff?1:id+1;used=false;for(let i=0;i<slot;i++)if(this.ids[i]===id){used=true;break;}}while(used);
  this.ids[slot]=id;return true;
 }
 update(dt:number):void{
  if(this.disposed||!Number.isFinite(dt)||dt<=0)return;
  let slot=0,remaining=this.count;
  while(remaining-->0&&slot<this.count){
   const at=slot*3,step=Math.min(dt,3-this.ages[slot]);
   this.from.x=this.positions[at];this.from.y=this.positions[at+1];this.from.z=this.positions[at+2];
   this.to.x=this.from.x+this.velocities[at]*step;this.to.y=this.from.y+this.velocities[at+1]*step-4.9*step*step;this.to.z=this.from.z+this.velocities[at+2]*step;
   const hit=this.world.contact?.(this.from,this.to);
   if(hit&&finite(hit.point)&&finite(hit.normal)){
    const length=Math.hypot(hit.normal.x,hit.normal.y,hit.normal.z);
    this.impact.x=hit.point.x+(length>1e-9?hit.normal.x/length*.04:0);
    this.impact.y=hit.point.y+(length>1e-9?hit.normal.y/length*.04:.04);
    this.impact.z=hit.point.z+(length>1e-9?hit.normal.z/length*.04:0);
    this.finish(slot);continue;
   }
   if(this.to.y<=.05||this.from.y<=.05){
    const fraction=this.from.y<=.05?0:Math.max(0,Math.min(1,(.05-this.from.y)/(this.to.y-this.from.y)));
    this.impact.x=this.from.x+(this.to.x-this.from.x)*fraction;this.impact.y=.09;this.impact.z=this.from.z+(this.to.z-this.from.z)*fraction;
    this.finish(slot);continue;
   }
   this.positions[at]=this.to.x;this.positions[at+1]=this.to.y;this.positions[at+2]=this.to.z;
   this.velocities[at+1]-=9.8*step;this.ages[slot]+=step;
   if(this.ages[slot]>=3-1e-9){this.impact.x=this.to.x;this.impact.y=this.to.y;this.impact.z=this.to.z;this.finish(slot);continue;}
   slot++;
  }
 }
 /** Remove before invoking user code, so even an exception cannot cause a second impact callback. */
 private finish(slot:number){
  const owner=this.owners[slot],last=--this.count;
  if(slot!==last){
   this.positions.copyWithin(slot*3,last*3,last*3+3);this.velocities.copyWithin(slot*3,last*3,last*3+3);this.ages[slot]=this.ages[last];this.ids[slot]=this.ids[last];this.owners[slot]=this.owners[last];
  }
  this.onImpact(owner,this.impact);
 }
 clear():void{this.count=0;this.positions.fill(0);this.velocities.fill(0);this.ages.fill(0);this.ids.fill(0);this.owners.fill(0);}
 /** Serialization is the only allocating operation; snapshots remain stable after subsequent physics ticks. */
 snapshot():ImpactRow[]{
  const rows:ImpactRow[]=new Array(this.count);
  for(let i=0;i<this.count;i++){const at=i*3;rows[i]=[this.ids[i],this.owners[i],cm(this.positions[at]),cm(this.positions[at+1]),cm(this.positions[at+2])];}
  return rows;
 }
 dispose():void{if(this.disposed)return;this.clear();this.disposed=true;}
}
