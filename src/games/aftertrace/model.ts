/** Aftertrace: deterministic, browser-independent arcade simulation. */
export interface Vec { x: number; y: number }
export interface TracePoint extends Vec { t: number }
export interface Foe extends Vec { id: number; vx: number; vy: number; speed: number; kind: 0 | 1; phase: number; radius: number }
export interface Spark extends Vec { id: number; }
export type Phase = 'ready' | 'playing' | 'over';
export interface World {
  version: 1; width: number; height: number; phase: Phase; seed: number; nextId: number;
  seconds: number; score: number; kills: number; lives: number; wave: number; charge: number;
  hurtFor: number; pulseFor: number; pulseCount: number; spawnIn: number; sparkIn: number;
  player: Vec; trail: TracePoint[]; pulsePath: Vec[]; enemies: Foe[]; sparks: Spark[];
}
export interface Effects { kills: number; pickups: number; damage: number; pulse: number; finished: boolean }
export const ZERO_EFFECTS: Effects = { kills: 0, pickups: 0, damage: 0, pulse: 0, finished: false };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function rand(world: World): number {
  let x = world.seed || 0x6d2b79f5;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  world.seed = x >>> 0;
  return world.seed / 4294967296;
}
export const playingBounds = (w: World) => ({
  left: 23, right: Math.max(24, w.width - 23), top: 97, bottom: Math.max(120, w.height - (w.height < 680 ? 78 : 104))
});
const distance2 = (a: Vec, b: Vec) => (a.x-b.x)**2 + (a.y-b.y)**2;
function distanceSegmentSquared(p: Vec, a: Vec, b: Vec): number {
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
  return (p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;
}
export function makeWorld(width: number, height: number, seed = 0x12345678): World {
  const w = clamp(Math.round(width)||390, 290, 1800), h=clamp(Math.round(height)||760, 390, 1300);
  return {version:1,width:w,height:h,phase:'ready',seed:seed>>>0||1,nextId:1,seconds:0,score:0,kills:0,
    lives:3,wave:1,charge:1,hurtFor:0,pulseFor:0,pulseCount:0,spawnIn:1.1,sparkIn:1.6,
    player:{x:w/2,y:h/2},trail:[],pulsePath:[],enemies:[],sparks:[]};
}
export function begin(world: World): void { if(world.phase==='ready'){world.phase='playing';makeEnemy(world);makeEnemy(world);makeSpark(world);world.spawnIn=.75;} }
export function resize(world: World, width: number, height: number): void {
  const w=clamp(Math.round(width)||390,290,1800),h=clamp(Math.round(height)||760,390,1300);
  if(w===world.width&&h===world.height)return;
  const sx=w/world.width,sy=h/world.height;
  const scale=(point:Vec)=>{point.x*=sx;point.y*=sy;};
  scale(world.player);world.trail.forEach(scale);world.pulsePath.forEach(scale);
  world.enemies.forEach(e=>{scale(e);e.vx*=sx;e.vy*=sy;});world.sparks.forEach(scale);
  world.width=w;world.height=h;
  const b=playingBounds(world);
  world.player.x=clamp(world.player.x,b.left,b.right);world.player.y=clamp(world.player.y,b.top,b.bottom);
}
export function fire(world: World): Effects {
  const e={...ZERO_EFFECTS};
  if(world.phase!=='playing'||world.charge<1||world.trail.length<4||world.pulseFor>0) return e;
  world.charge-=1;world.pulsePath=world.trail.map(({x,y})=>({x,y}));world.trail=[];
  world.pulseFor=.82;world.pulseCount=0;e.pulse=1;
  return e;
}
function makeEnemy(world: World): void {
  const b=playingBounds(world);
  const angle=rand(world)*Math.PI*2,radius=Math.min(260,Math.min(world.width,world.height)*.36)+45*rand(world);
  const x=clamp(world.player.x+Math.cos(angle)*radius,b.left,b.right);
  const y=clamp(world.player.y+Math.sin(angle)*radius,b.top,b.bottom);
  const kind:0|1=world.wave>=3&&rand(world)<.3?1:0;
  const speed=(kind?86:61)+world.wave*5.7+rand(world)*18;
  world.enemies.push({id:world.nextId++,x,y,vx:0,vy:0,speed,kind,phase:rand(world)*Math.PI*2,radius:kind?12:13});
}
function makeSpark(world:World):void{
  const b=playingBounds(world),pad=37;
  world.sparks.push({id:world.nextId++,x:b.left+pad+rand(world)*Math.max(1,b.right-b.left-pad*2),y:b.top+pad+rand(world)*Math.max(1,b.bottom-b.top-pad*2)});
}
/** Fixed-step update. Caller supplies an analog movement vector in [-1,1]. */
export function step(world: World, dt: number, ax: number, ay: number): Effects {
  const effects={...ZERO_EFFECTS};
  if(world.phase!=='playing'||!finite(dt)||dt<=0)return effects;
  dt=Math.min(.05,dt);world.seconds+=dt;world.wave=Math.min(15,1+Math.floor(world.seconds/18));
  world.score+=dt*2.5;world.hurtFor=Math.max(0,world.hurtFor-dt);
  world.pulseFor=Math.max(0,world.pulseFor-dt);
  if(world.pulseFor===0)world.pulsePath=[];
  world.charge=clamp(world.charge+dt*.145,0,2);
  const b=playingBounds(world), before={...world.player},m=Math.hypot(ax,ay);
  if(m>.035){
    const speed=235;
    world.player.x=clamp(world.player.x+ax/Math.max(1,m)*speed*dt,b.left,b.right);
    world.player.y=clamp(world.player.y+ay/Math.max(1,m)*speed*dt,b.top,b.bottom);
    const tail=world.trail[world.trail.length-1];
    if(!tail||distance2(world.player,tail)>90||world.seconds-tail.t>.08){
      world.trail.push({x:world.player.x,y:world.player.y,t:world.seconds});
    }
    // When a pressed direction is blocked against a wall, no new points should be manufactured.
    if(distance2(before,world.player)<.02&&world.trail.length)world.trail.pop();
  }
  while(world.trail.length&&(world.seconds-world.trail[0].t>3.45||world.trail.length>115))world.trail.shift();
  world.spawnIn-=dt;
  const maxEnemies=Math.min(25,5+world.wave*2);
  if(world.spawnIn<=0){if(world.enemies.length<maxEnemies)makeEnemy(world);world.spawnIn=Math.max(.44,1.45-world.wave*.09);}
  world.sparkIn-=dt;
  if(world.sparkIn<=0){if(world.sparks.length<6)makeSpark(world);world.sparkIn=3.5+rand(world)*1.5;}
  for(let i=world.sparks.length-1;i>=0;i--){const s=world.sparks[i];
    if(distance2(s,world.player)<(s.id%2?24:26)**2){world.sparks.splice(i,1);world.score+=45;world.charge=clamp(world.charge+.26,0,2);effects.pickups++;}
  }
  for(let i=world.enemies.length-1;i>=0;i--){const foe=world.enemies[i];
    let dx=world.player.x-foe.x,dy=world.player.y-foe.y;
    const d=Math.hypot(dx,dy)||1;dx/=d;dy/=d;
    // Weavers arc sideways; hunters choose the direct line.
    const weave=foe.kind?Math.sin(world.seconds*3.8+foe.phase)*.66:0;
    const tx=(dx-dy*weave)*foe.speed,ty=(dy+dx*weave)*foe.speed;
    const pull=Math.min(1,dt*(foe.kind?3:4));foe.vx+=(tx-foe.vx)*pull;foe.vy+=(ty-foe.vy)*pull;
    foe.x+=foe.vx*dt;foe.y+=foe.vy*dt;
    // Charge follows the trail's exact straight segments; no endpoint-only gaps.
    let zapped=false;
    if(world.pulseFor>0){
      const radius=(foe.radius+12)**2;
      for(let j=1;j<world.pulsePath.length;j++){
        if(distanceSegmentSquared(foe,world.pulsePath[j-1],world.pulsePath[j])<radius){zapped=true;break;}
      }
    }
    if(zapped){world.enemies.splice(i,1);world.pulseCount++;
      const multiplier=Math.min(5,world.pulseCount);
      world.score+=90*multiplier;world.kills++;effects.kills++;
      if(world.sparks.length<5&&rand(world)<.22)world.sparks.push({x:foe.x,y:foe.y,id:world.nextId++});
      continue;
    }
    if(world.hurtFor<=0&&distance2(foe,world.player)<(foe.radius+14)**2){
      world.enemies.splice(i,1);world.lives--;world.hurtFor=1.75;
      world.trail=[];world.pulsePath=[];world.pulseFor=0;
      effects.damage++;
      if(world.lives<=0){world.phase='over';effects.finished=true;break;}
    }
  }
  return effects;
}
export function snapshot(world:World):World { return JSON.parse(JSON.stringify(world)) as World; }
/** Strict validation for local/cloud save data, including size and object ceilings. */
export function restore(input: unknown, currentWidth: number, currentHeight: number): World | null {
  if(!input||typeof input!=='object')return null;
  const s=input as Partial<World>;
  if(s.version!==1||!['ready','playing','over'].includes(String(s.phase)))return null;
  const nums=['width','height','seed','nextId','seconds','score','kills','lives','wave','charge','hurtFor','pulseFor','pulseCount','spawnIn','sparkIn'] as const;
  if(nums.some(k=>!finite(s[k])))return null;
  if(s.width!<290||s.width!>1800||s.height!<390||s.height!>1300||s.seconds!<0||s.seconds!>1e7||s.score!<0||s.score!>2e9||s.lives!<0||s.lives!>3||s.charge!<0||s.charge!>2.001)return null;
  const point=(p:unknown):p is Vec=>!!p&&typeof p==='object'&&finite((p as Vec).x)&&finite((p as Vec).y)&&Math.abs((p as Vec).x)<5000&&Math.abs((p as Vec).y)<5000;
  if(!point(s.player)||!Array.isArray(s.trail)||s.trail.length>115||!s.trail.every(p=>point(p)&&finite(p.t)))return null;
  if(!Array.isArray(s.pulsePath)||s.pulsePath.length>115||!s.pulsePath.every(point))return null;
  if(!Array.isArray(s.enemies)||s.enemies.length>25||!s.enemies.every(f=>point(f)&&finite(f.vx)&&finite(f.vy)&&finite(f.speed)&&finite(f.id)&&finite(f.phase)&&finite(f.radius)&&(f.kind===0||f.kind===1)))return null;
  if(!Array.isArray(s.sparks)||s.sparks.length>6||!s.sparks.every(p=>point(p)&&finite(p.id)))return null;
  const copy=snapshot(s as World);
  resize(copy,currentWidth,currentHeight);return copy;
}
