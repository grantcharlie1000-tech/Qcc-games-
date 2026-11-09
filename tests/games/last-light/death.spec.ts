import {test,expect} from '../../fixtures';

test('death feedback renders in all forty chapters with the district palette',async({page})=>{
 await page.goto('/#/game/last-light');await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();
 const counts=await page.evaluate(async()=>{
  const [{DeathAnimation},{createRun},{LEVELS},{DEATH_CAUSES}]=await Promise.all(['/src/games/last-light/death-art.ts','/src/games/last-light/model.ts','/src/games/last-light/levels.ts','/src/games/last-light/death.ts'].map(path=>import(path)));
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;const c=canvas.getContext('2d')!;
  return LEVELS.map((l:any)=>{const pose=createRun();Object.assign(pose,{stage:l.id,x:64,y:64,clock:1});const a=new DeathAnimation();a.begin(pose,0,0,DEATH_CAUSES[l.id%DEATH_CAUSES.length]);a.age=.06;c.clearRect(0,0,160,120);a.drawBody(c,0,0,false);return c.getImageData(0,0,160,120).data.some((v:number,i:number)=>i%4===3&&v>0);});
 });
 expect(counts).toHaveLength(40);expect(counts.every(Boolean)).toBe(true);
});

test('nine death causes have distinct native-pixel animations, frozen pause frames and quick retries',async({page})=>{
 await page.goto('/#/game/last-light');await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const [{DeathAnimation},{createRun},{DEATH_CAUSES,DEATH_DURATION,DEATH_IMPACT}]=await Promise.all(['/src/games/last-light/death-art.ts','/src/games/last-light/model.ts','/src/games/last-light/death.ts'].map(path=>import(path)));
  const canvas=document.createElement('canvas');canvas.width=260;canvas.height=170;const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
  const rows=[];
  for(const cause of DEATH_CAUSES){const pose=createRun();Object.assign(pose,{x:120,y:85,vx:180,vy:130,clock:1});const before=JSON.stringify(pose),animation=new DeathAnimation();animation.begin(pose,0,0,cause,{x:135,y:cause==='water'?107:100,w:26,h:18},'crawler');
   const draw=(age:number,reduced=false)=>{animation.age=age;c.clearRect(0,0,260,170);animation.drawBody(c,0,0,reduced);const pixels=c.getImageData(0,0,260,170).data;let count=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])count++;return {hash:pixels.reduce((h:number,v:number)=>Math.imul(h^v,16777619)>>>0,2166136261),count};};
   const frames=[.025,.075,.135,.19].map(age=>draw(age)),paused=[draw(.09),draw(.09)],quiet=[draw(.08,true),draw(.08,true)];
   animation.age=DEATH_IMPACT+.01;const checkpoint=animation.impact===false&&animation.active;animation.step(DEATH_DURATION);rows.push({cause,frames,paused,quiet,checkpoint,finished:!animation.active,unchanged:before===JSON.stringify(pose)});
  }
  return rows;
 });
 expect(result).toHaveLength(9);expect(new Set(result.map(r=>r.frames[1].hash)).size).toBe(9);
 for(const row of result){expect(new Set(row.frames.map(f=>f.hash)).size,row.cause).toBe(4);expect(row.frames.every(f=>f.count>12),row.cause).toBe(true);expect(row.paused[0]).toEqual(row.paused[1]);expect(row.quiet[0]).toEqual(row.quiet[1]);expect(row.checkpoint).toBe(true);expect(row.finished).toBe(true);expect(row.unchanged).toBe(true);}
});

test('renderer receives the cause and impact before model respawn and resets on retry',async({page})=>{
 await page.goto('/#/game/last-light');await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const [{Scene},{createRun,respawn},{LEVELS}]=await Promise.all(['/src/games/last-light/render.ts','/src/games/last-light/model.ts','/src/games/last-light/levels.ts'].map(path=>import(path)));
  const canvas=document.createElement('canvas'),scene=new Scene(canvas);scene.resize(1280,720);const run=createRun();scene.draw(run,false);const pose={...run,x:240,y:LEVELS[0].platforms[0].y-24};respawn(run);
  scene.step(run,{death:true,deathCause:'steam',deathHit:{x:240,y:400,w:18,h:40},deathPose:pose},1/120);scene.draw(run,false);const active={active:scene.dying,cause:scene.deathCause};respawn(run);scene.draw(run,false);return {active,reset:!scene.dying,empty:scene.deathCause};
 });
 expect(result).toEqual({active:{active:true,cause:'steam'},reset:true,empty:''});
});

for(const [width,height] of [[1280,800],[390,844]])test(`boat departs and lift reaches its upper doorway at ${width}×${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.goto('/#/game/last-light');await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();
 const rows=await page.evaluate(async({width,height})=>{
  const [{Scene},{LEVELS},{createRun,step},{clearDuration,departureOffset,departurePose},{goalComposition}]=await Promise.all(['/src/games/last-light/render.ts','/src/games/last-light/levels.ts','/src/games/last-light/model.ts','/src/games/last-light/departure.ts','/src/games/last-light/composition.ts'].map(path=>import(path)));
  const rows=[];for(const l of LEVELS.filter((l:any)=>l.goal==='ferry'||l.goal==='engine')){
   const canvas=document.createElement('canvas'),scene=new Scene(canvas);scene.resize(width,height);const s=createRun();Object.assign(s,{stage:l.id,cleared:l.id,x:l.exit.x,y:l.exit.y+32});scene.draw(s,false);const start={x:scene.cameraX,y:scene.cameraY};Object.assign(s,{phase:'cleared',cleared:l.id+1,cinematic:clearDuration(l)});scene.step(s,{clear:true},1/120);
   for(let i=0;i<Math.ceil(clearDuration(l)*120)+1;i++){scene.step(s,step(s,{move:0,jump:false,dash:false}),1/120);}scene.draw(s,false);const offset=departureOffset(l,s,false,scene),pose=departurePose(l,s,false,scene),art=goalComposition(l);
   rows.push({goal:l.goal,exited:l.goal==='ferry'?art.x-62+offset.x>scene.cameraX+scene.width&&pose.x>scene.cameraX+scene.width:offset.y<=-280&&Math.abs(pose.y+24-(art.y-8+offset.y))<1&&pose.opacity===0&&scene.cameraY<start.y-200,stationary:l.goal==='engine'||Math.abs(scene.cameraX-start.x)<.01&&Math.abs(scene.cameraY-start.y)<.01});
  }return rows;
 },{width,height});
 for(const row of rows){expect(row.exited,row.goal).toBe(true);expect(row.stationary,row.goal).toBe(true);}
});
