/** The host owns this model, including bots and round transitions. No rendering or transport dependencies. */
export type Team=0|1;
export type Phase='menu'|'prep'|'action'|'roundEnd'|'gameEnd';
export const PHASES:readonly Phase[]=['menu','prep','action','roundEnd','gameEnd'];
export const BUTTON={FIRE:1,RELOAD:2,JUMP:4,CROUCH:8,WALK:16,ADS:32,INTERACT:64} as const;
export interface InputFrame{seq:number;at:number;view:number;x:number;z:number;yaw:number;pitch:number;buttons:number;weapon:number}
export const neutralInput=(seq=0):InputFrame=>({seq,at:0,view:0,x:0,z:0,yaw:0,pitch:0,buttons:0,weapon:0});
export interface Seat{seat:number;name:string;team:Team;bot:boolean;peer?:string}
export interface Entity extends Seat{x:number;y:number;z:number;vx:number;vy:number;vz:number;yaw:number;pitch:number;hp:number;ammo:number;reserve:number;mags:[number,number];reserves:[number,number];weapon:number;reload:number;nextFire:number;crouch:boolean;ground:boolean;kills:number;deaths:number;ack:number;away:number|null;jumpHeld:boolean}
export interface Point{x:number;y:number;z:number}
export interface SimWorld{
 spawns:[number,number,number][];
 spawn?(team:Team,index:number):Point&{yaw?:number};
 collide(e:Entity,dx:number,dy:number,dz:number):Point&{ground:boolean};
 blocked(from:Point,to:Point):boolean;
 path?(from:Point,to:Point):Point[];
}
export const GUNS=[{id:'m4a1',name:'TC-5 Carbine',damage:34,rpm:720,mag:30,reserve:150,reload:2.6},{id:'usp',name:'S-45 Suppressed',damage:33,rpm:360,mag:12,reserve:72,reload:2}] as const;
export function move(e:Entity,i:InputFrame,dt:number,world:SimWorld){
 e.yaw=Math.atan2(Math.sin(i.yaw),Math.cos(i.yaw));e.pitch=Math.max(-1.45,Math.min(1.45,i.pitch));e.crouch=!!(i.buttons&BUTTON.CROUCH);
 if(e.hp<=0)return;
 const length=Math.max(127,Math.hypot(i.x,i.z)),speed=e.crouch?1.6:i.buttons&BUTTON.WALK?2:4.2;
 const mult=i.buttons&BUTTON.ADS?.7:1,x=i.x/length*speed*mult,z=i.z/length*speed*mult;
 e.vx=Math.cos(i.yaw)*x-Math.sin(i.yaw)*z;e.vz=-Math.sin(i.yaw)*x-Math.cos(i.yaw)*z;
 if(i.buttons&BUTTON.JUMP){if(e.ground&&!e.jumpHeld){e.vy=4.6;e.ground=false;}e.jumpHeld=true;}else e.jumpHeld=false;
 const dy=e.vy*dt-10*dt*dt;e.vy=Math.max(-30,e.vy-20*dt);
 const result=world.collide(e,e.vx*dt,dy,e.vz*dt);
 e.x=Math.max(-52,Math.min(52,result.x));e.y=Math.max(-2,Math.min(20,result.y));e.z=Math.max(-42,Math.min(42,result.z));
 e.ground=result.ground;if(e.ground||result.y<e.y+dy-.001)e.vy=0;
}
/** Ray / vertical capsule, including hemispherical ends; distance in metres. */
export function capsuleHit(o:Point,d:Point,e:Point,height=1.83,radius=.35):number|null{
 let nearest=Infinity;
 const sphere=(cy:number)=>{const x=o.x-e.x,y=o.y-cy,z=o.z-e.z,b=x*d.x+y*d.y+z*d.z,c=x*x+y*y+z*z-radius*radius,h=b*b-c;if(h>=0){const t=-b-Math.sqrt(h);if(t>=0)nearest=Math.min(nearest,t);}};
 sphere(e.y+radius);sphere(e.y+height-radius);
 const x=o.x-e.x,z=o.z-e.z,a=d.x*d.x+d.z*d.z,b=x*d.x+z*d.z,c=x*x+z*z-radius*radius,h=b*b-a*c;
 if(a>1e-9&&h>=0){const t=(-b-Math.sqrt(h))/a,y=o.y+t*d.y;if(t>=0&&y>=e.y+radius&&y<=e.y+height-radius)nearest=Math.min(nearest,t);}
 return Number.isFinite(nearest)?nearest:null;
}
export interface SimEvent{type:'shot'|'damage'|'eliminated'|'phase';seat:number;target?:number;hp?:number;head?:boolean;phase?:Phase;round?:number;winner?:Team}
export class Simulation{
 entities:Entity[]=[];phase:Phase='menu';round=0;scores:[number,number]=[0,0];timer=0;time=0;tick=0;winner:Team=0;paused=false;
 readonly inputs=new Map<number,InputFrame>();readonly events:SimEvent[]=[];
 /** Host-only rewind hook; history never changes live actor positions. */
 rewind:((seat:number,view:number)=>Point&{height?:number}|null)|null=null;
 private inputAt=new Map<number,number>();private brain=new Map<number,{next:number;path:Point[];target:number;input:InputFrame}>();
 thinkHz=5;difficulty:'easy'|'normal'|'hard'='normal';private rng:number;
 constructor(public world:SimWorld,seats:Seat[],seed=1,public quick=false){this.rng=seed>>>0||1;this.setSeats(seats);}
 setSeats(seats:Seat[]){this.entities=seats.map(s=>({...s,x:0,y:0,z:0,vx:0,vy:0,vz:0,yaw:0,pitch:0,hp:100,ammo:30,reserve:150,mags:[30,12] as [number,number],reserves:[150,72] as [number,number],weapon:0,reload:0,nextFire:0,crouch:false,ground:true,kills:0,deaths:0,ack:0,away:null,jumpHeld:false}));}
 random(){this.rng^=this.rng<<13;this.rng^=this.rng>>>17;this.rng^=this.rng<<5;return(this.rng>>>0)/4294967296;}
 start(){this.scores=[0,0];this.round=0;this.time=0;this.tick=0;for(const e of this.entities){e.kills=0;e.deaths=0;}this.nextRound();}
 nextRound(){
  this.round++;this.phase='prep';this.timer=3;this.inputs.clear();this.inputAt.clear();this.brain.clear();
  const used=[0,0];
  for(const e of this.entities){const index=used[e.team]++,p=this.world.spawn?.(e.team,index)??(()=>{const a=this.world.spawns[e.team]??[0,0,0];return{x:a[0]+index*1.2,y:a[1],z:a[2],yaw:e.team===0?Math.PI:0};})();
   Object.assign(e,p,{vx:0,vy:0,vz:0,hp:100,ammo:30,reserve:150,mags:[30,12] as [number,number],reserves:[150,72] as [number,number],weapon:0,reload:0,nextFire:0,ack:0,crouch:false,ground:true,jumpHeld:false});
  }
  this.events.push({type:'phase',seat:0,phase:this.phase,round:this.round});
 }
 applyInput(seat:number,input:InputFrame){const e=this.entities.find(e=>e.seat===seat);if(!e||e.bot||e.away!==null||input.seq<=e.ack)return false;this.inputs.set(seat,input);this.inputAt.set(seat,this.time);return true;}
 setAway(seat:number,on:boolean){const e=this.entities.find(e=>e.seat===seat);if(!e)return;e.away=on?this.time:null;if(!on){if(e.bot)e.ack=0;e.bot=false;}this.inputs.delete(seat);}
 disconnect(seat:number){const e=this.entities.find(e=>e.seat===seat);if(e){e.bot=true;delete e.peer;this.inputs.delete(seat);}}
 step(dt:number){
  if(this.paused||this.phase==='menu'||this.phase==='gameEnd')return;
  this.time+=dt*1000;this.tick++;this.timer=Math.max(0,this.timer-dt);
  if(this.phase==='prep'){if(!this.timer){this.phase='action';this.timer=this.quick?120:150;this.events.push({type:'phase',seat:0,phase:this.phase,round:this.round});}return;}
  if(this.phase==='roundEnd'){if(!this.timer){if(Math.max(...this.scores)>=(this.quick?3:4)){this.phase='gameEnd';this.events.push({type:'phase',seat:0,phase:this.phase,round:this.round,winner:this.winner});}else this.nextRound();}return;}
  for(const e of this.entities){
   if(e.away!==null&&this.time-e.away>=60000)e.bot=true;
   if(e.hp<=0)continue;
   let input=e.bot?this.botInput(e):this.inputs.get(e.seat);
   if(!e.bot&&(e.away!==null||this.time-(this.inputAt.get(e.seat)??-Infinity)>200))input=undefined;
   const i=input??{...neutralInput(e.ack),yaw:e.yaw,pitch:e.pitch,weapon:e.weapon,buttons:e.crouch?BUTTON.CROUCH:0};
   move(e,i,dt,this.world);if(input)e.ack=Math.max(e.ack,input.seq);
   if(i.weapon!==e.weapon){e.mags[e.weapon]=e.ammo;e.reserves[e.weapon]=e.reserve;e.weapon=i.weapon;e.ammo=e.mags[e.weapon];e.reserve=e.reserves[e.weapon];e.reload=0;}
   if(e.reload>0){e.reload=Math.max(0,e.reload-dt);if(e.reload===0){const n=Math.min(GUNS[e.weapon].mag-e.ammo,e.reserve);e.ammo+=n;e.reserve-=n;}}
   if(i.buttons&BUTTON.RELOAD&&e.reload===0&&e.ammo<GUNS[e.weapon].mag&&e.reserve>0)e.reload=GUNS[e.weapon].reload;
   if(i.buttons&BUTTON.FIRE)this.fire(e,i.view);
  }
  const alive=[0,0];for(const e of this.entities)if(e.hp>0)alive[e.team]++;
  if(!alive[0]||!alive[1]||this.timer===0)this.endRound(!alive[1]?0:!alive[0]?1:alive[0]>alive[1]?0:1);
 }
 endRound(winner:Team){if(this.phase!=='action')return;this.winner=winner;this.scores[winner]++;this.phase='roundEnd';this.timer=6;this.events.push({type:'phase',seat:0,phase:this.phase,round:this.round,winner});}
 fire(e:Entity,view:number){
  if(this.phase!=='action'||e.hp<=0||e.reload>0||e.ammo<=0||this.time<e.nextFire)return false;
  const gun=GUNS[e.weapon];e.nextFire=this.time+60000/gun.rpm;e.ammo--;this.events.push({type:'shot',seat:e.seat});
  const eye={x:e.x,y:e.y+(e.crouch?1.08:1.62),z:e.z},c=Math.cos(e.pitch),dir={x:-Math.sin(e.yaw)*c,y:Math.sin(e.pitch),z:-Math.cos(e.yaw)*c};
  let best=80,target:Entity|undefined,head=false;
  for(const other of this.entities){if(other===e||other.hp<=0||other.team===e.team)continue;const p=this.rewind?.(other.seat,view)??other,h=('height' in p?p.height:undefined)??(other.crouch?1.25:1.83),t=capsuleHit(eye,dir,p,h);if(t!==null&&t<best){const end={x:eye.x+dir.x*t,y:eye.y+dir.y*t,z:eye.z+dir.z*t};if(!this.world.blocked(eye,end)){best=t;target=other;head=end.y>p.y+h-.32;}}}
  if(target){const falloff=best<=22?1:Math.max(.7,1-(best-22)/18*.3);target.hp=Math.max(0,target.hp-Math.round(gun.damage*falloff*(head?4:1)));this.events.push({type:'damage',seat:e.seat,target:target.seat,hp:target.hp,head});if(!target.hp){e.kills++;target.deaths++;this.events.push({type:'eliminated',seat:e.seat,target:target.seat,head});}}
  return true;
 }
 private botInput(e:Entity):InputFrame{
  let b=this.brain.get(e.seat);
  if(!b||this.time>=b.next){
   const targets=this.entities.filter(t=>t.team!==e.team&&t.hp>0).sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z));
   const target=targets[0],i={...neutralInput(this.tick),yaw:e.yaw,pitch:0};
   b={next:this.time+1000/this.thinkHz,path:b?.path??[],target:target?.seat??-1,input:i};
   if(target){const eye={x:e.x,y:e.y+1.62,z:e.z},to={x:target.x,y:target.y+1.3,z:target.z},distance=Math.hypot(to.x-eye.x,to.z-eye.z);
    if(!this.world.blocked(eye,to)&&distance<42){i.yaw=Math.atan2(-(to.x-e.x),-(to.z-e.z));const error=this.difficulty==='easy'?.09:this.difficulty==='hard'?.008:.03;i.pitch=Math.atan2(to.y-eye.y,distance)+(this.random()-.5)*error;i.yaw+=(this.random()-.5)*error;i.buttons=BUTTON.FIRE;i.z=distance>20?70:0;}
    else{b.path=this.world.path?.(e,target)??[{x:target.x,y:target.y,z:target.z}];const p=b.path.find(p=>Math.hypot(p.x-e.x,p.z-e.z)>.6)??target;i.yaw=Math.atan2(-(p.x-e.x),-(p.z-e.z));i.z=127;}
    if(e.ammo===0)i.buttons=BUTTON.RELOAD;
   }
   this.brain.set(e.seat,b);
  }
  b.input.view=this.time;b.input.seq=this.tick;return b.input;
 }
}
