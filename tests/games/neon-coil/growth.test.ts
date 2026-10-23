import { expect, test } from 'vitest';
import { createArena, stepArena, bodyLength, restoreArena, snapshot, SPEED, STEP, type Arena } from '../../../src/games/neon-coil/model';

function quiet(): Arena {
  const s=createArena(); s.phase='running';
  // Keep valid dead-bot snapshots, and stop respawn during this controlled run.
  s.snakes.slice(1).forEach(b=>{b.alive=false;b.body=[];b.pathLength=0;b.diedAt=0;});
  s.food=[];return s;
}
function meal(s:Arena,value:number) {
  const p=s.snakes[0];s.food=[{id:s.nextFood++,x:p.x+Math.cos(p.angle)*SPEED*STEP,y:p.y+Math.sin(p.angle)*SPEED*STEP,value,color:0,trail:false}];
  // Advance valid bots' death timestamps to keep the isolated meal deterministic.
  s.snakes.slice(1).forEach(b=>b.diedAt=s.ticks);
  stepArena(s,{angle:p.angle});
}

test('eating crosses 600 and keeps earning mass beyond 10,000, with boost and save continuation',()=>{
 const s=quiet(),p=s.snakes[0];p.mass=599;
 meal(s,4);expect(p.mass).toBe(603);expect(s.eaten).toBe(1);
 for(let i=0;i<100;i++)meal(s,100);
 expect(p.mass).toBe(10603);expect(s.eaten).toBe(101);
 const restored=restoreArena(snapshot(s));expect(restored).not.toBeNull();expect(restored!.snakes[0].mass).toBe(10603);
 meal(restored!,100);expect(restored!.snakes[0].mass).toBe(10703);
 stepArena(restored!,{boost:true});expect(restored!.snakes[0].mass).toBeCloseTo(10702.9);
});

test('real body grows well beyond the former 1,930-pixel limit with bounded history',()=>{
 const s=quiet(),p=s.snakes[0];p.mass=100000;
 let maxPoints=0;
 // Circular forward motion stays inside the arena and exercises repeated self crossings.
 for(let i=0;i<16000;i++){
  s.snakes.slice(1).forEach(b=>b.diedAt=s.ticks);
  s.food=[];stepArena(s,{angle:(i+1)*.018});maxPoints=Math.max(maxPoints,p.body.length);
 }
 expect(s.phase).toBe('running');expect(p.pathLength).toBeGreaterThan(5000);
 expect(bodyLength(100000)).toBeGreaterThan(bodyLength(10000));
 expect(maxPoints).toBeLessThanOrEqual(2048);
 expect(restoreArena(snapshot(s))).not.toBeNull();
},30000);
