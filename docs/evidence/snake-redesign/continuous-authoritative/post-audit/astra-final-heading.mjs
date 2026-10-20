import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from '/workspace/qcc-snake/node_modules/typescript/lib/typescript.js';
const root='/workspace/qcc-snake';
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(sha,'03d4a1c4c800bf803999d4859431e98d1c2982ce');
const source=fs.readFileSync(root+'/src/games/snake/model.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const m=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const clone=structuredClone;
const dirs=['right','down','left','up'];
const rot=(p,n)=>{let x=p.x-7,y=p.y-7;while(n--)[x,y]=[-y,x];return {x:x+7,y:y+7};};
const turn=(d,n)=>dirs[(dirs.indexOf(d)+n)%4];
const old=n=>({version:1,seed:7,body:[{x:5,y:6},{x:4,y:6},{x:3,y:6}].map(p=>rot(p,n)),food:rot({x:9,y:6},n),direction:turn('right',n),queue:[],phase:'running',score:0,elapsed:93,ticks:1});
let assertions=0;
function ok(check){assert.ok(check);assertions++;}
function eq(a,b){assert.deepEqual(a,b);assertions++;}
for(let n=0;n<4;n++){
 const base=old(n),perp=turn('up',n),back=turn('left',n),forward=turn('right',n);
 for(const phase of ['ready','running']){
  eq(m.restoreState({...base,phase,direction:back}),null);
  eq(m.restoreState({...base,phase,direction:perp,queue:[back]}),null);
  const state=m.restoreState({...base,phase,direction:perp});ok(state);
  const before=clone(state),queue=state.queue,migration=state.migration;
  eq(m.start(state,back),false);eq(state,before);eq(state.queue===queue,true);eq(state.migration===migration,true);
  eq(m.start(state,forward),true);m.advance(state,80);eq(state.phase,'running');ok(Math.abs(m.pathLength(state.body)-2)<1e-9);eq(m.restoreState(clone(state)),state);
 }
 const continued=m.restoreState({...base,direction:perp});eq(m.start(continued),true);m.advance(continued,80);eq(continued.body[0],rot({x:5,y:5.5},n));eq(m.restoreState(clone(continued)),continued);
 const priority=m.restoreState({...base,queue:[perp]});eq(m.start(priority,back),true);eq(priority.direction,perp);eq(priority.queue,[back]);m.advance(priority,240);eq(priority.body[0],rot({x:4.5,y:5},n));eq(priority.phase,'running');eq(m.restoreState(clone(priority)),priority);
 for(const direction of [perp,back]){
  const terminal=m.restoreState({...base,phase:'lost',direction});ok(terminal);eq(m.restoreState(clone(terminal)),terminal);const before=clone(terminal);eq(m.start(terminal,forward),false);m.advance(terminal,10000);eq(terminal,before);
 }
}
// The active-leg start entry point still behaves exactly like enqueue, without moving its deadline.
for(const elapsed of [0,33,159.99999999])for(const queue of [[],['up'],['up','left']])for(const d of [undefined,...dirs]){
 const a=m.createState(7);m.start(a);m.advance(a,elapsed);for(const pending of queue)m.enqueue(a,pending);
 const b=clone(a);if(d)m.enqueue(b,d);eq(m.start(a,d),true);eq(a,b);m.advance(a,40);m.advance(b,40);eq(a,b);
}
console.log(JSON.stringify({sha,assertions,rotations:4,result:'PASS: queued reverse legacy rejected; rejected start immutable; safe retry/Continue/priority/terminal/v2 preserved; active-leg queue semantics unchanged'},null,2));
