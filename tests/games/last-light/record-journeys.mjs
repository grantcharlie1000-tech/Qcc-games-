/** Regenerate the deterministic 120 Hz journey witnesses after changing maps.
 * Run: node tests/games/last-light/record-journeys.mjs [zero-based stage ids]
 * The bounded search only supplies legal input to the real model. It explores
 * landing position, jump hold, dash timing and hazard phase without moving the
 * courier between jumps. An exhausted search reports uncertainty, not proof
 * that a stage is impossible. Unit tests independently replay the result.
 */
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const root=new URL('../../../',import.meta.url);
const scratch=new URL('work/last-light/journey-recording/',root);
await mkdir(scratch,{recursive:true});
const bundle=new URL('model.mjs',scratch);
await build({stdin:{contents:"export * from './src/games/last-light/levels.ts'; export * from './src/games/last-light/model.ts';",resolveDir:fileURLToPath(root)},bundle:true,platform:'node',format:'esm',outfile:fileURLToPath(bundle)});
const {LEVELS,createRun,respawn,step,platformAt,stationAt}=await import(bundle.href);
const idle={move:0,jump:false,dash:false,interact:false};
const mask=s=>s.activated.reduce((n,i)=>n|(1<<i),0);
const stateKey=s=>`${s.ground}:${Math.round(s.x/24)}:${Math.round(s.vx/100)}:${Math.round((s.clock%3.2)/.25)}:${mask(s)}`;
let budget=0;const LIMIT=600_000_000;
function act(s,input,inputs){budget++;const a={...input,interact:false};const ev=step(s,a);inputs.push(a);return !ev.death;}
function toward(s,p,aim=.5){const r=platformAt(p,s.clock),d=r.x+r.w*aim-(s.x+8);return Math.abs(d)<8?0:Math.sign(d);}
function advance(s,to,deep=false,from=s.ground,direction){
 const l=LEVELS[s.stage],b=l.platforms[to],a=l.platforms[from],sourceGround=from,dir=direction??(Math.sign(b.x+b.w/2-(s.x+8))||s.facing),solutions=[],seen=new Set();
 if(!a)return [];
 // A slow pallet or punt can be most of its swing away: keep waiting, up to seven seconds, before giving the hop up.
 const waits=deep?[0,24,48,72,96,120,160,200,240,280,320,360]:[0,48,96,144,192,240,288,336,384,432,480,540,600,660,720,780,840];
 waits: for(const waiting of waits){
  let atThisPhase=0;
  const base=structuredClone(s),prefix=[];let alive=true;
  if(base.previousJump)alive=act(base,idle,prefix);
  for(let i=0;i<waiting&&alive;i++)alive=act(base,idle,prefix);
  if(!alive)continue;
  for(let approach=0;approach<=160;approach+=8){
   if(approach){for(let i=0;i<8&&alive;i++)alive=act(base,{...idle,move:dir},prefix);}
   if(!alive)break;
   if(base.ground!==sourceGround&&base.coyote<=0&&a.kind!=='spring')break;
   for(const dashAt of (s.stage===1&&to<=3?[-1]:[-1,32,44,20,56]))for(const hold of [65,12,32,0])for(const aim of to===from?(dir>0?[.75,.9,.6]:[.25,.1,.4]):[.25,.7,.5]){
    const q=structuredClone(base),inputs=[...prefix];let reached=false;
    for(let f=0;f<220;f++){
     if(!act(q,{move:toward(q,b,aim),jump:f<hold,dash:f===dashAt},inputs))break;
     const br=platformAt(b,q.clock);
     if(q.grounded&&q.ground===to&&(to!==from||dir*(q.x-s.x)>48)||b.kind==='spring'&&q.vy< -600&&Math.abs(q.y+24-br.y)<12&&q.x+16>br.x&&q.x<br.x+br.w){reached=true;break;}
     if(f>15&&q.grounded&&q.ground!==sourceGround&&q.ground!==to)break;
     if(q.phase!=='playing')break;
    }
    if(reached){
     // A one-frame touchdown at an emitter edge is not a usable landing.
     // Check that the courier can brake on the host deck before extending
     // this candidate into the next jump. No state is assigned or corrected.
     if(l.hazards.some(h=>['steam','laser'].includes(h.kind)&&h.x<b.x+b.w&&h.x+h.w>b.x)&&b.kind!=='crumble'){
      let stable=true;for(let i=0;i<4;i++)if(!act(q,idle,inputs)||q.ground!==to){stable=false;break;}
      if(!stable)continue;
     }
     const key=stateKey(q);if(seen.has(key))continue;seen.add(key);solutions.push({s:q,inputs,to,waiting,approach,hold,dashAt});
     if(solutions.length>=12)return solutions.sort((a,b)=>a.s.clock-b.s.clock);
     if(++atThisPhase>=3)continue waits;
    }
    if(budget>LIMIT)return solutions.sort((a,b)=>a.s.clock-b.s.clock);
   }
  }
 }
 return solutions.sort((a,b)=>a.s.clock-b.s.clock);
}
function finish(s){const l=LEVELS[s.stage],inputs=[];for(let f=0;f<500&&s.phase==='playing';f++){const d=l.exit.x+19-(s.x+8);if(!act(s,{...idle,move:Math.abs(d)<3?0:Math.sign(d)},inputs))return null;}return s.phase!=='playing'?inputs:null;}
function compact(inputs){const blocks=[];for(const a of inputs){const code=(a.move+1)|(a.jump?4:0)|(a.dash?8:0)|(a.interact?16:0);const last=blocks.at(-1);if(last&&last[1]===code)last[0]++;else blocks.push([1,code]);}return blocks;}
async function solve(stage,route){
 budget=0;const initial=createRun();initial.stage=stage;initial.cleared=stage;respawn(initial,false);const intro=[];for(let i=0;i<3;i++)act(initial,idle,intro);
 const l=LEVELS[stage],targets=route??Array.from({length:l.mainCount-1},(_,i)=>i+1);let attempts=0,failure=null,bestDepth=0;
 function go(s,index,inputs,segments,sameHops=0){
  // A journey of several minutes has several hundred hops; the search allowance grows with the route.
  attempts++;if(attempts>180+targets.length*8||budget>LIMIT)return null;
  if(index===targets.length){const q=structuredClone(s),tail=finish(q);return tail?{s:q,inputs:[...inputs,...tail],segments}:null;}
  if(index>bestDepth){bestDepth=index;console.log(`stage ${stage+1} progress ${index}/${targets.length} at ${s.clock.toFixed(2)}s; ${budget} ticks`);}
  const to=targets[index],choices=advance(s,to,index===0,index?targets[index-1]:0);
  if(!choices.length)failure={target:to,from:s.ground,x:s.x,y:s.y,clock:s.clock,threat:s.threat};
  for(const c of choices.slice(0,12)){const solved=go(c.s,index+1,[...inputs,...c.inputs],[...segments,{to,waiting:c.waiting,approach:c.approach,hold:c.hold,dashAt:c.dashAt,seconds:c.s.clock,x:c.s.x,activated:c.s.activated}]);if(solved)return solved;}
  // A broad ledge can contain a spike before a wide launch. Clearing that
  // spike and landing on the same ledge is a real input sequence, not a new
  // takeoff point assigned by the solver.
  if(!choices.length&&sameHops<2){
   const from=index?targets[index-1]:0,direction=Math.sign(l.platforms[to].x+l.platforms[to].w/2-(s.x+8))||s.facing;
   for(const c of advance(s,from,false,from,direction).slice(0,6)){
    const solved=go(c.s,index,[...inputs,...c.inputs],[...segments,{to:from,preparation:true,seconds:c.s.clock,x:c.s.x}],sameHops+1);
    if(solved)return solved;
   }
  }
  return null;
 }
 const solved=go(initial,0,intro,[]);if(!solved)return {stage,solved:false,attempts,budget,bestDepth,targets,failure};
 return {stage,solved:true,phase:solved.s.phase,seconds:+solved.s.clock.toFixed(3),deaths:solved.s.stageDeaths,activated:solved.s.activated,steps:solved.inputs.length,blocks:compact(solved.inputs),segments:solved.segments,attempts,budget};
}
const stages=process.argv.slice(2).map(Number);
if(stages.some(stage=>!Number.isInteger(stage)||stage<0||stage>=LEVELS.length))throw new Error('Stage ids must be zero-based campaign indices.');
const destination=new URL('journeys.json',import.meta.url);
let recorded=[];
try{recorded=JSON.parse(await readFile(destination,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
let failed=false;
for(const stage of stages.length?stages:LEVELS.map(level=>level.id)){
 const row=await solve(stage);
 await writeFile(new URL(`stage-${stage}.json`,scratch),JSON.stringify(row,null,2));
 console.log('RESULT',JSON.stringify({...row,blocks:undefined,segments:undefined}));
 if(!row.solved){failed=true;continue;}
 recorded=recorded.filter(previous=>previous.stage!==stage);
 recorded.push({stage,blocks:row.blocks});
}
if(failed)throw new Error('Search budget exhausted for a journey. Inspect the saved state and route before changing either the game or search. Existing fixtures were preserved.');
recorded.sort((a,b)=>a.stage-b.stage);
if(recorded.length!==LEVELS.length)throw new Error('Run the complete campaign once before updating selected chapters.');
await writeFile(destination,`[\n${recorded.map(row=>' '+JSON.stringify(row)).join(',\n')}\n]\n`);
console.log(`Recorded ${recorded.length} continuous journeys in ${fileURLToPath(destination)}.`);
