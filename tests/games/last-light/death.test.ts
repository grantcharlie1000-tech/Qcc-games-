import {describe,it,expect} from 'vitest';
import {LEVELS,type Level,type Hazard} from '../../../src/games/last-light/levels';
import {createRun,step,STEP} from '../../../src/games/last-light/model';
import {DEATH_CAUSES,DEATH_DURATION,type DeathCause} from '../../../src/games/last-light/death';
import {departureOffset,departurePose,clearDuration} from '../../../src/games/last-light/departure';
import {goalComposition,serviceDoor,foregroundFits} from '../../../src/games/last-light/composition';
const idle={move:0,jump:false,dash:false};
describe('death causes and impact context',()=>{
 for(const cause of DEATH_CAUSES)it(`${cause} reaches the animation with the original pose and contact`,()=>{
  const original=LEVELS[0],fixture:Level={...original,platforms:[],hazards:[],enemies:[],water:null,goal:'shelter',spawn:{x:20,y:20},height:500,exit:{x:5000,y:0,w:38,h:56}};
  const s=createRun();Object.assign(s,{x:124,y:110,clock:0});
  if(['spikes','saw','laser','steam','crusher'].includes(cause)){
   const h:Hazard={kind:cause as Hazard['kind'],x:120,y:cause==='spikes'?132:cause==='crusher'?40:110,w:40,h:cause==='spikes'?10:40,period:3.2,travel:cause==='crusher'?94:0};fixture.hazards=[h];
   if(cause==='crusher'){s.clock=3.2*.65-STEP;s.y=116;}
  }else if(cause==='enemy'){fixture.enemies=[{id:0,platform:0,kind:'crawler',x:130,y:140,travel:0,period:3,offset:0}];s.y=116;}
  else if(cause==='water')fixture.water=125;
  else if(cause==='dark'){fixture.goal='escape';fixture.pressure=0;s.threat=160;}
  else s.y=550;
  (LEVELS as Level[])[0]=fixture;
  try{const event=step(s,idle);expect(event.deathCause).toBe(cause);expect(event.death).toBe(true);expect(s.respawn).toBe(DEATH_DURATION);expect(s.deaths).toBe(1);expect(event.deathPose?.x).toBe(124);expect(event.deathPose?.respawn).toBe(0);expect(s.x).toBe(20);expect(s.y).toBe(20);
   if(cause!=='fall')expect(event.deathHit).toBeDefined();if(cause==='water')expect(event.deathHit?.y).toBe(125);if(cause==='enemy')expect(event.deathEnemy).toBe('crawler');
   for(let i=0;i<Math.ceil(DEATH_DURATION/STEP)+1;i++)step(s,idle);expect(s.respawn).toBe(0);expect(s.deaths).toBe(1);
  }finally{(LEVELS as Level[])[0]=original;}
 });
 it('begins a fall while its pose is visible and below every real landing',()=>{
  for(const level of LEVELS){
   expect(level.height-40).toBeGreaterThan(Math.max(...level.platforms.map(p=>p.y+p.h))+60);
  }
  const s=createRun();s.x=400;s.y=LEVELS[0].height-39;s.vy=200;
  const event=step(s,idle);expect(event.deathCause).toBe('fall');expect(event.deathPose!.y).toBeLessThan(LEVELS[0].height);expect(s.respawn).toBe(DEATH_DURATION);
 });
 it('has one explicit animation cause for every deadly source',()=>{const kinds=new Set<DeathCause>(LEVELS.flatMap(l=>l.hazards.map(h=>h.kind)));for(const kind of ['water','fall','enemy','dark'] as const)kinds.add(kind);for(const kind of kinds)expect(DEATH_CAUSES).toContain(kind);expect(DEATH_CAUSES).toHaveLength(9);});
});
describe('departures cross an actual threshold',()=>{
 for(const width of [320,640,1280])it(`boats leave the view and lifts reach another floor at ${width}px`,()=>{
  const view={width,height:width===320?844:360,cameraX:0,cameraY:0};
  for(const level of LEVELS.filter(l=>l.goal==='ferry'||l.goal==='engine')){
   const art=goalComposition(level),s=createRun();Object.assign(s,{stage:level.id,cleared:level.id+1,phase:'cleared',x:level.exit.x,y:level.exit.y+32,cinematic:0});
   view.cameraX=art.x-width*.58;view.cameraY=art.y-view.height*.6;
   const offset=departureOffset(level,s,false,view),pose=departurePose(level,s,false,view);
   if(level.goal==='ferry'){expect(art.x-62+offset.x).toBeGreaterThan(view.cameraX+width);expect(pose.x).toBeGreaterThan(view.cameraX+width);}
   else{expect(offset.y).toBeLessThanOrEqual(-280);expect(pose.x).toBeCloseTo(art.x+98);expect(pose.y+24).toBeCloseTo(art.y-8+offset.y);expect(pose.opacity).toBe(0);s.cinematic=clearDuration(level)-.4;expect(departureOffset(level,s,false,view)).toEqual({x:0,y:0});}
  }
 });
 it('every signal, relay and dawn exit has a clear, reachable onward doorway',()=>{
  for(const l of LEVELS.filter(l=>['signal','relay','dawn'].includes(l.goal))){const door=serviceDoor(l)!;expect(door).not.toBeNull();expect(foregroundFits(l,{x:door.x-28,y:door.y-58,w:56,h:60},l.mainCount-1,-1,true)).toBe(true);
   const s=createRun();Object.assign(s,{stage:l.id,phase:'cleared',x:l.exit.x,y:l.exit.y+32,cinematic:clearDuration(l)});
   expect(departurePose(l,s,false).action).toBe('interact');s.cinematic=0;const end=departurePose(l,s,false);expect(Math.abs(end.x-door.x)).toBeLessThan(20);expect(end.opacity).toBe(0);
  }
 });
});
