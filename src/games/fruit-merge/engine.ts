import Matter from 'matter-js';
const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter;
export const STEP = 1000 / 60;
export const WIDTH = 360, HEIGHT = 510, LEFT = 18, RIGHT = 342, FLOOR = 488, DANGER = 114;
export const TIERS = [
 {name:'Cherry',r:15,color:'#f65068',edge:'#a82b48'},
 {name:'Strawberry',r:20,color:'#ff754e',edge:'#b63c32'},
 {name:'Grape',r:26,color:'#a578e2',edge:'#65429b'},
 {name:'Mandarin',r:32,color:'#ffae36',edge:'#bf6922'},
 {name:'Lemon',r:39,color:'#f9db42',edge:'#b49325'},
 {name:'Apple',r:46,color:'#f56955',edge:'#ad3434'},
 {name:'Pear',r:53,color:'#b9d94d',edge:'#749735'},
 {name:'Peach',r:60,color:'#ffb39a',edge:'#c16c65'},
 {name:'Pineapple',r:67,color:'#efc04f',edge:'#aa8130'},
 {name:'Melon',r:75,color:'#a6dd65',edge:'#508d45'},
 {name:'Watermelon',r:84,color:'#69c976',edge:'#267a52'},
] as const;
export interface FruitState {id:number;tier:number;x:number;y:number;vx:number;vy:number;angle:number;av:number;age:number;danger:number;sleeping:boolean}
export interface Snapshot {version:1;seed:number;bag:number[];current:number;next:number;score:number;time:number;lastDrop:number;lastMerge:number;combo:number;aim:number;nextId:number;lost:boolean;fruits:FruitState[]}
export interface Fruit {id:number;tier:number;body:Matter.Body;age:number;danger:number}
export interface Merge {x:number;y:number;tier:number;points:number;combo:number}
const clamp = (n:number,a:number,b:number) => Math.max(a,Math.min(b,n));
const finite=(x:unknown,min:number,max:number):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const integer=(x:unknown,min:number,max:number):x is number=>finite(x,min,max)&&Number.isInteger(x);
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
export function validateSnapshot(value:unknown):value is Snapshot {
 if(!record(value)||value.version!==1||!integer(value.seed,1,4294967295)||!integer(value.current,0,3)||!integer(value.next,0,3)||!integer(value.score,0,1e12)||!finite(value.time,0,1e12)||!finite(value.lastDrop,-10000,1e12)||!finite(value.lastMerge,-10000,1e12)||!integer(value.combo,0,1e8)||!finite(value.aim,LEFT,RIGHT)||!integer(value.nextId,1,1e9)||typeof value.lost!=='boolean'||!Array.isArray(value.bag)||value.bag.length>8||!value.bag.every(v=>integer(v,0,3))||!Array.isArray(value.fruits)||value.fruits.length>90) return false;
 const ids=new Set<number>();
 for(const f of value.fruits){
  if(!record(f)||!integer(f.id,1,value.nextId-1)||ids.has(f.id)||!integer(f.tier,0,10)||!finite(f.x,LEFT-10,RIGHT+10)||!finite(f.y,-160,FLOOR+20)||!finite(f.vx,-20,20)||!finite(f.vy,-20,20)||!finite(f.angle,-1e8,1e8)||!finite(f.av,-1,1)||!finite(f.age,0,1e12)||!finite(f.danger,0,2200)||typeof f.sleeping!=='boolean')return false;
  ids.add(f.id);
 }
 return value.lastDrop<=value.time && value.lastMerge<=value.time;
}
export class FruitEngine {
 readonly engine=Engine.create({enableSleeping:true,positionIterations:8,velocityIterations:6});
 readonly fruits=new Map<number,Fruit>();
 current=0;next=0;score=0;time=0;lastDrop=-1000;lastMerge=-10000;combo=0;aim=180;lost=false;
 private seed:number;private bag:number[]=[];private nextId=1;private pairs:[number,number][]=[];private disposed=false;
 onMerge?: (merge:Merge)=>void;
 constructor(seed=0x51A17){
  this.seed=(seed>>>0)||1;
  Composite.add(this.engine.world,[Bodies.rectangle(LEFT-15,230,30,700,{isStatic:true}),Bodies.rectangle(RIGHT+15,230,30,700,{isStatic:true}),Bodies.rectangle(180,FLOOR+15,360,30,{isStatic:true})]);
  const collect=(event:Matter.IEventCollision<Matter.Engine>)=>{for(const p of event.pairs){const a=p.bodyA.plugin.fruitId as number|undefined,b=p.bodyB.plugin.fruitId as number|undefined;if(a&&b)this.pairs.push(a<b?[a,b]:[b,a]);}};
  Events.on(this.engine,'collisionStart',collect);Events.on(this.engine,'collisionActive',collect);
  this.current=this.drawTier();this.next=this.drawTier();
 }
 private random(){let s=this.seed;s^=s<<13;s^=s>>>17;s^=s<<5;this.seed=s>>>0;return this.seed/4294967296;}
 private drawTier(){
  if(!this.bag.length){this.bag=[0,0,1,1,2,2,3,3];for(let i=7;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}}
  return this.bag.pop()!;
 }
 setAim(x:number){const r=TIERS[this.current].r;this.aim=clamp(x,LEFT+r+1,RIGHT-r-1);}
 get ready(){return !this.disposed&&!this.lost&&this.time-this.lastDrop>=450&&this.fruits.size<90;}
 drop(x=this.aim){
  if(!this.ready)return false;this.setAim(x);const r=TIERS[this.current].r;
  for(const f of this.fruits.values())if(Math.hypot(f.body.position.x-this.aim,f.body.position.y-58)<r+TIERS[f.tier].r+2)return false;
  this.add({id:this.nextId++,tier:this.current,x:this.aim,y:58,vx:0,vy:0,angle:0,av:0,age:0,danger:0,sleeping:false});
  this.lastDrop=this.time;this.current=this.next;this.next=this.drawTier();this.setAim(this.aim);return true;
 }
 private add(f:FruitState){
  const body=Bodies.circle(f.x,f.y,TIERS[f.tier].r,{restitution:.12,friction:.35,frictionStatic:.6,frictionAir:.008,density:.002,slop:.03,sleepThreshold:50,plugin:{fruitId:f.id}},32);
  Body.setAngle(body,f.angle);Body.setVelocity(body,{x:f.vx,y:f.vy});Body.setAngularVelocity(body,f.av);if(f.sleeping)Sleeping.set(body,true);
  const entry={id:f.id,tier:f.tier,body,age:f.age,danger:f.danger};this.fruits.set(f.id,entry);Composite.add(this.engine.world,body);return entry;
 }
 step(){
  if(this.disposed||this.lost)return;
  this.time+=STEP;this.pairs=[];Engine.update(this.engine,STEP);
  // Engine's collisionStart is before position/velocity solving: mutate only after update.
  const claimed=new Set<number>();this.pairs.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  for(const [aid,bid]of this.pairs){
   const a=this.fruits.get(aid),b=this.fruits.get(bid);
   if(!a||!b||claimed.has(aid)||claimed.has(bid)||a.tier!==b.tier||a.tier===10)continue;
   claimed.add(aid);claimed.add(bid);const tier=a.tier+1,r=TIERS[tier].r;
   const x=clamp((a.body.position.x+b.body.position.x)/2,LEFT+r+.5,RIGHT-r-.5),y=Math.min((a.body.position.y+b.body.position.y)/2,FLOOR-r);
   const vx=clamp((a.body.velocity.x+b.body.velocity.x)/2,-2,2),vy=clamp((a.body.velocity.y+b.body.velocity.y)/2-.65,-1.5,2);
   Composite.remove(this.engine.world,[a.body,b.body]);this.fruits.delete(aid);this.fruits.delete(bid);
   this.add({id:this.nextId++,tier,x,y,vx,vy,angle:0,av:0,age:0,danger:0,sleeping:false});
   this.combo=this.time-this.lastMerge<=800?this.combo+1:1;this.lastMerge=this.time;
   const points=(tier+1)*(tier+2)/2*Math.min(4,this.combo);this.score+=points;this.onMerge?.({x,y,tier,points,combo:this.combo});
  }
  for(const f of this.fruits.values()){
   f.age+=STEP;const body=f.body;
   if(body.speed>14)Body.setVelocity(body,{x:clamp(body.velocity.x,-10,10),y:clamp(body.velocity.y,-12,12)});
   if(Math.abs(body.angularVelocity)>.12)Body.setAngularVelocity(body,clamp(body.angularVelocity,-.12,.12));
   const danger=f.age>1200&&body.position.y-TIERS[f.tier].r<DANGER&&body.speed<.65;
   f.danger=danger?f.danger+STEP:0;
   if(f.danger>=2000)this.lost=true;
  }
 }
 snapshot():Snapshot {
  return {version:1,seed:this.seed,bag:[...this.bag],current:this.current,next:this.next,score:this.score,time:this.time,lastDrop:this.lastDrop,lastMerge:this.lastMerge,combo:this.combo,aim:this.aim,nextId:this.nextId,lost:this.lost,fruits:[...this.fruits.values()].map(f=>({id:f.id,tier:f.tier,x:f.body.position.x,y:f.body.position.y,vx:f.body.velocity.x,vy:f.body.velocity.y,angle:f.body.angle,av:f.body.angularVelocity,age:f.age,danger:f.danger,sleeping:f.body.isSleeping}))};
 }
 restore(data:unknown){
  if(this.disposed||!validateSnapshot(data))return false;
  this.clearFruit();this.seed=data.seed;this.bag=[...data.bag];this.current=data.current;this.next=data.next;this.score=data.score;this.time=data.time;this.lastDrop=data.lastDrop;this.lastMerge=data.lastMerge;this.combo=data.combo;this.aim=data.aim;this.nextId=data.nextId;this.lost=data.lost;
  this.engine.timing.timestamp=data.time;for(const f of data.fruits)this.add(f);return true;
 }
 private clearFruit(){for(const f of this.fruits.values())Composite.remove(this.engine.world,f.body);this.fruits.clear();this.pairs=[];Engine.clear(this.engine);}
 restart(){if(this.disposed)return;this.clearFruit();this.score=0;this.time=0;this.lastDrop=-1000;this.lastMerge=-10000;this.combo=0;this.aim=180;this.lost=false;this.nextId=1;this.bag=[];this.engine.timing.timestamp=0;this.current=this.drawTier();this.next=this.drawTier();}
 dispose(){if(this.disposed)return;this.clearFruit();Events.off(this.engine,'collisionStart');Events.off(this.engine,'collisionActive');Composite.clear(this.engine.world,false);Engine.clear(this.engine);this.onMerge=undefined;this.disposed=true;}
}
