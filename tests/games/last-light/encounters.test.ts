import {describe,it,expect} from 'vitest';
import {LEVELS} from '../../../src/games/last-light/levels';
import {createRun,step,respawn,serialize,restore,STEP} from '../../../src/games/last-light/model';
import {enemyAt} from '../../../src/games/last-light/enemies';
import {pressAt,pressState} from '../../../src/games/last-light/press';
import {FEATURE_ROUTES} from '../../../src/games/last-light/feature-routes';
const idle={move:0,jump:false,dash:false};
function contact(kind:'crawler'|'moth',mode:'side'|'stomp'|'dash'){
 const l=LEVELS.find(l=>l.enemies.some(e=>e.kind===kind))!,enemy=l.enemies.find(e=>e.kind===kind)!,s=createRun(),at=enemyAt(enemy,STEP);
 Object.assign(s,{stage:l.id,cleared:l.id,x:at.x+3,y:mode==='stomp'?at.y-25:at.y-5,vy:mode==='stomp'?180:0,dashLeft:mode==='dash'?.1:0,grounded:false});return {s,enemy};
}
describe('readable movement encounters',()=>{
 for(const kind of ['crawler','moth'] as const){
  it(`${kind}: side contact hurts, stomp bounces, and dash breaks it without farming points`,()=>{
   const side=contact(kind,'side');expect(step(side.s,idle).deathCause).toBe('enemy');expect(side.s.stageDeaths).toBe(1);
   const stomp=contact(kind,'stomp');const hit=step(stomp.s,idle);expect(hit.stomp).toBe(true);expect(hit.death).not.toBe(true);expect(stomp.s.vy).toBeLessThan(0);expect(stomp.s.dashReady).toBe(true);expect(stomp.s.defeated[stomp.enemy.id]).toBeDefined();
   const dash=contact(kind,'dash');expect(step(dash.s,idle).enemy).toBe(true);expect(dash.s.best).toBe(0);expect(dash.s.sparks).toBe(0);expect(step(dash.s,idle).enemy).not.toBe(true);
   expect(serialize(dash.s)).not.toHaveProperty('defeated');expect(restore(serialize(dash.s))?.defeated).toEqual({});respawn(dash.s,false);expect(dash.s.defeated).toEqual({});
  });
 }
 it('pauses before reversing and never leaves the authored patrol envelope',()=>{
  for(const l of LEVELS)for(const e of l.enemies){
   const a=enemyAt(e,(.44-e.offset)*e.period),b=enemyAt(e,(.48-e.offset)*e.period);expect(a.x).toBeCloseTo(b.x);expect(a.turning).toBe(true);
   const p=l.platforms[e.platform];for(let t=0;t<e.period;t+=.03){const r=enemyAt(e,t);expect(r.x).toBeGreaterThan(p.x+12);expect(r.x+r.w).toBeLessThan(p.x+p.w-12);}
  }
 });
 it('presses warn before dropping and retract to a safe walking clearance',()=>{
  let count=0;for(const l of LEVELS)for(const h of l.hazards.filter(h=>h.kind==='crusher')){count++;const period=h.period!;
   const at=(phase:number)=>(phase*period-(h.offset??0));expect(pressState(h,at(.45)).warning).toBe(true);expect(pressState(h,at(.45)).extension).toBe(0);
   expect(pressAt(h,at(.65)).y+18).toBeCloseTo(l.platforms[h.platform!].y);expect(pressAt(h,at(.1)).y+18).toBeLessThan(l.platforms[h.platform!].y-48);expect(pressState(h,at(.85)).extension).toBeLessThan(1);
  }expect(count).toBeGreaterThanOrEqual(5);
 });
 it('grates allow upward passage, catch descending feet, and release Down without changing jump physics',()=>{
  const l=LEVELS[3],p=l.platforms.find(p=>p.kind==='grate')!,s=createRun();Object.assign(s,{stage:3,cleared:3,x:p.x+32,y:p.y+5,vy:-330});
  for(let i=0;i<70;i++)step(s,{...idle,jump:true});expect(s.ground).toBe(p.id);expect(s.grounded).toBe(true);
  const y=s.y;step(s,{...idle,drop:true});for(let i=0;i<12;i++)step(s,idle);expect(s.y).toBeGreaterThan(y+5);expect(s.ground).not.toBe(p.id);
 });
 it('never stacks two obstacles on a small landing',()=>{
  for(const l of LEVELS)for(const p of l.platforms.filter(p=>p.w<200)){
   const hazards=l.hazards.filter(h=>h.platform===p.id),enemies=l.enemies.filter(e=>e.platform===p.id);
   expect(hazards.length+enemies.length,`chapter ${l.id+1}, ledge ${p.id}`).toBeLessThanOrEqual(1);
  }
 });
 it('signature routes have a substantial vertical span, reversals and stacked space',()=>{
  for(const id of Object.keys(FEATURE_ROUTES).map(Number)){const l=LEVELS[id],main=l.platforms.slice(0,l.mainCount);expect(Math.max(...main.map(p=>p.y))-Math.min(...main.map(p=>p.y))).toBeGreaterThan(500);expect(main.some((p,i)=>i>0&&p.x<main[i-1].x)).toBe(true);expect(main.filter(p=>p.kind==='grate').length).toBeGreaterThanOrEqual(3);}
 });
});
