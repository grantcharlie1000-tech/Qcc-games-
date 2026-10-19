import Matter from 'matter-js';
const { Bodies, Body, Composite, Engine, Events, Sleeping, Query } = Matter;
export const WIDTH = 360, HEIGHT = 480, FLOOR = 422, LIMIT = 40;
export const KINDS = ['hippo', 'capybara', 'turtle', 'sheep', 'fox'] as const;
export type Kind = typeof KINDS[number];
export const ANIMALS: Record<Kind, { name: string; width: number; height: number; mass: number; color: string }> = {
  hippo: { name:'Hippo', width:104, height:54, mass:5.8, color:'#a9a0de' },
  capybara: { name:'Capybara', width:94, height:48, mass:4.2, color:'#dca26c' },
  turtle: { name:'Turtle', width:86, height:40, mass:3.6, color:'#9bc86d' },
  sheep: { name:'Sheep', width:76, height:52, mass:2.6, color:'#fff3d6' },
  fox: { name:'Fox', width:80, height:44, mass:2.2, color:'#f49b5e' },
};
export interface Animal { kind: Kind; body: Matter.Body; offset: {x:number;y:number}; age:number; stable:number; scored:boolean; impact:number }
export function createAnimal(kind: Kind, x: number, y: number): Animal {
  const a = ANIMALS[kind];
  // Broad convex torsos provide readable contact surfaces; side heads and ears remain physical.
  const parts = [Bodies.rectangle(0, 0, a.width, a.height, {chamfer:{radius:kind==='turtle'?12:8}})];
  if (kind === 'hippo') parts.push(Bodies.rectangle(a.width/2-4, -6, 25, 32, {chamfer:{radius:8}}));
  if (kind === 'capybara') parts.push(Bodies.rectangle(a.width/2-4, -8, 25, 28, {chamfer:{radius:6}}));
  if (kind === 'turtle') parts.push(Bodies.circle(a.width/2+3, 5, 12));
  if (kind === 'sheep') parts.push(Bodies.circle(a.width/2-1, 2, 15));
  if (kind === 'fox') {
    parts.push(Bodies.trapezoid(a.width/2-1, -6, 28, 30, 0.3));
    parts.push(Bodies.polygon(a.width/2-5, -25, 3, 10));
  }
  const body = Body.create({parts, label:kind, friction:0.85, frictionStatic:1.5, frictionAir:0.018, restitution:0.025, sleepThreshold:90, slop:0.025});
  const offset = {x:-body.position.x, y:-body.position.y};
  Body.setMass(body, a.mass); Body.setPosition(body,{x,y});
  return {kind,body,offset,age:0,stable:0,scored:false,impact:0};
}
interface SavedAnimal { kind:Kind; x:number;y:number;angle:number;vx:number;vy:number;av:number;age:number;stable:number;scored:boolean;sleeping:boolean }
export interface Snapshot {version:1;seed:number;aim:number;score:number;height:number;over:boolean;complete:boolean;next:Kind;active:number|null;tick:number;animals:SavedAnimal[]}
const finite = (v:unknown, min:number,max:number): v is number => typeof v==='number' && Number.isFinite(v) && v>=min && v<=max;
const kindValid = (v:unknown):v is Kind => KINDS.includes(v as Kind);
export function parseSnapshot(data: unknown): Snapshot | null {
  if (!data || typeof data!=='object') return null;
  const s=data as Snapshot;
  if (s.version!==1 || !finite(s.seed,1,0xffffffff) || !Number.isInteger(s.seed) || !finite(s.aim,24,336) || !finite(s.score,0,1000000) || !finite(s.height,0,6000) || !finite(s.tick,0,1e9) || !kindValid(s.next) || typeof s.over!=='boolean' || typeof s.complete!=='boolean' || !Array.isArray(s.animals) || s.animals.length>LIMIT || !(s.active===null || (Number.isInteger(s.active)&&s.active>=0&&s.active<s.animals.length))) return null;
  for (const a of s.animals) {
    if (!a || !kindValid(a.kind) || !finite(a.x,-500,860) || !finite(a.y,-6500,1500) || !finite(a.angle,-1e5,1e5) || !finite(a.vx,-40,40) || !finite(a.vy,-40,40) || !finite(a.av,-1,1) || !finite(a.age,0,1e9) || !finite(a.stable,0,1e9) || typeof a.scored!=='boolean' || typeof a.sleeping!=='boolean') return null;
  }
  const count=s.animals.filter(a=>a.scored).length;
  if(s.score!==count*100+s.height*2 || (s.complete && (count!==LIMIT || s.active!==null || s.over)))return null;
  return {version:1,seed:s.seed,aim:s.aim,score:s.score,height:s.height,over:s.over,complete:s.complete,next:s.next,active:s.active,tick:s.tick,animals:s.animals.map(a=>({kind:a.kind,x:a.x,y:a.y,angle:a.angle,vx:a.vx,vy:a.vy,av:a.av,age:a.age,stable:a.stable,scored:a.scored,sleeping:a.sleeping}))};
}
export class AnimalWorld {
  readonly engine = Engine.create({enableSleeping:true,positionIterations:12,velocityIterations:10});
  readonly platform = Bodies.rectangle(180,FLOOR+15,210,30,{isStatic:true,friction:0.9,frictionStatic:1.5,restitution:0,label:'island'});
  animals: Animal[]=[]; seed:number; aimX=180; score=0; height=0; over=false; complete=false; nextKind:Kind='hippo'; active:number|null=null; tick=0;
  constructor(seed=173) {
    this.seed=(seed>>>0)||173; this.engine.gravity.y=0.9; Composite.add(this.engine.world,this.platform);
    Events.on(this.engine,'collisionStart', event => {
      for (const pair of event.pairs) for (const a of this.animals) {
        if (pair.bodyA.parent===a.body || pair.bodyB.parent===a.body) a.impact=Math.min(1,a.body.speed/7);
      }
    });
  }
  get supportedCount() { return this.animals.filter(a=>a.scored).length; }
  get ready() { return !this.over && !this.complete && this.active===null && this.animals.length<LIMIT; }
  get top() { return Math.min(FLOOR,...this.animals.filter(a=>a.body.position.y<FLOOR+40).map(a=>a.body.bounds.min.y)); }
  get cameraTop() { return Math.min(FLOOR,...this.animals.filter(a=>a.scored).map(a=>a.body.bounds.min.y)); }
  get spawnY() { return Math.min(110,this.top-96); }
  aim(x:number) { if (Number.isFinite(x)) this.aimX=Math.max(24,Math.min(336,x)); }
  private random() { let x=this.seed; x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0 || 173;return this.seed/4294967296; }
  drop() {
    if (!this.ready) return false;
    const a=createAnimal(this.nextKind,this.aimX,this.spawnY); Composite.add(this.engine.world,a.body);this.animals.push(a);this.active=this.animals.length-1;
    this.nextKind=KINDS[(KINDS.indexOf(this.nextKind)+1+Math.floor(this.random()*(KINDS.length-1)))%KINDS.length]; return true;
  }
  step() {
    if (this.over || this.complete) return;
    Engine.update(this.engine,1000/60);this.tick++;
    // Follow geometric collision contacts to the island. Mere airborne slowness never earns points.
    const supported = new Set<Matter.Body>([this.platform]);
    // Engine pairs omit sleeping contacts; query geometry so sleeping foundations still support newcomers.
    const bodies=[this.platform,...this.animals.map(a=>a.body)];
    const contacts=this.animals.flatMap(a=>a.body.parts.slice(1).flatMap(part=>Query.collides(part,bodies.filter(b=>b!==a.body))));
    for (let pass=0;pass<=this.animals.length;pass++) {
      let changed=false;
      for (const pair of contacts) {
        const a=pair.bodyA.parent,b=pair.bodyB.parent;
        if (supported.has(a) && !supported.has(b)) { supported.add(b);changed=true; }
        if (supported.has(b) && !supported.has(a)) { supported.add(a);changed=true; }
      }
      if (!changed) break;
    }
    for (const a of this.animals) {
      a.age++;a.impact*=0.84;
      const b=a.body;
      if (a.age>24 && (b.position.y>FLOOR+135 || b.position.x < -100 || b.position.x > WIDTH+100)) {this.over=true;return;}
      if (!a.scored) {
        a.stable=supported.has(b) && b.speed<0.45 && Math.abs(b.angularVelocity)<0.018 ? a.stable+1 : 0;
        if (a.stable>=30) {
          a.scored=true;this.height=Math.max(this.height,Math.round(FLOOR-Math.min(FLOOR,...this.animals.filter(a=>supported.has(a.body)).map(a=>a.body.bounds.min.y))));
          this.score=this.supportedCount*100+this.height*2;
        }
      }
    }
    if (this.active!==null) {
      const a=this.animals[this.active];
      if (a.scored || (a.age>300 && supported.has(a.body))) this.active=null;
    }
    if (this.animals.length>=LIMIT && this.active===null && this.supportedCount===LIMIT) this.complete=true;
  }
  snapshot():Snapshot { return {version:1,seed:this.seed,aim:this.aimX,score:this.score,height:this.height,over:this.over,complete:this.complete,next:this.nextKind,active:this.active,tick:this.tick,animals:this.animals.map(a=>({kind:a.kind,x:a.body.position.x,y:a.body.position.y,angle:a.body.angle,vx:a.body.velocity.x,vy:a.body.velocity.y,av:a.body.angularVelocity,age:a.age,stable:a.stable,scored:a.scored,sleeping:a.body.isSleeping}))}; }
  restore(data:unknown) {
    const s=parseSnapshot(data);if (!s) return false;
    const restored=s.animals.map(v=> {const a=createAnimal(v.kind,v.x,v.y);Body.setAngle(a.body,v.angle);Body.setVelocity(a.body,{x:v.vx,y:v.vy});Body.setAngularVelocity(a.body,v.av);Sleeping.set(a.body,v.sleeping);a.age=v.age;a.stable=v.stable;a.scored=v.scored;return a;});
    // Reject deep intersections before touching a live run; solver recovery from corrupt overlapping saves is unsafe.
    for(let i=0;i<restored.length;i++) {
      const others=[this.platform,...restored.slice(0,i).map(a=>a.body)];
      if(restored[i].body.parts.slice(1).some(part=>Query.collides(part,others).some(c=>c.depth>5)))return false;
    }
    Composite.clear(this.engine.world,false);Engine.clear(this.engine);Composite.add(this.engine.world,this.platform);this.animals=restored;
    Composite.add(this.engine.world,this.animals.map(a=>a.body));Object.assign(this,{seed:s.seed,aimX:s.aim,score:s.score,height:s.height,over:s.over,complete:s.complete,nextKind:s.next,active:s.active,tick:s.tick});return true;
  }
  dispose() { Events.off(this.engine,'collisionStart');Composite.clear(this.engine.world,false);Engine.clear(this.engine); }
}
