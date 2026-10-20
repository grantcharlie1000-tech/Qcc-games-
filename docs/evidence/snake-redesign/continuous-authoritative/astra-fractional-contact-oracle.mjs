import assert from 'node:assert/strict';
const src=await(await fetch('http://127.0.0.1:4181/src/games/snake/model.ts')).text();
const m=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const dirs={up:{x:0,y:-1},right:{x:1,y:0},down:{x:0,y:1},left:{x:-1,y:0}};
const clone=v=>JSON.parse(JSON.stringify(v));let rng=83371;const rand=n=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return (rng>>>5)%n;};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function moved(path,v,q,growth){
 const out=[{x:path[0].x+v.x*q,y:path[0].y+v.y*q},...clone(path)];let trim=Math.max(0,q-growth);
 while(trim>0&&out.length>1){const a=out.at(-1),b=out.at(-2),len=dist(a,b);if(trim>=len){out.pop();trim-=len;}else{out[out.length-1]={x:a.x+(b.x-a.x)*trim/len,y:a.y+(b.y-a.y)*trim/len};break;}}
 return out;
}
function clearance(path){
 const h=path[0];let arc=0,min=Math.min(h.x+.5,15.5-h.x,h.y+.5,15.5-h.y)-.4;
 for(let i=1;i<path.length;i++){
  let a=path[i-1],b=path[i];const len=dist(a,b);if(!len)continue;
  if(arc+len>=1.2){if(arc<1.2){const fraction=(1.2-arc)/len;a={x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};}
   const x=Math.max(Math.min(a.x,b.x),Math.min(Math.max(a.x,b.x),h.x));
   const y=Math.max(Math.min(a.y,b.y),Math.min(Math.max(a.y,b.y),h.y));
   min=Math.min(min,Math.hypot(h.x-x,h.y-y)-.8);
  }arc+=len;
 }
 return min;
}
function firstContact(path,v,growth,limit=1){let prev=0;for(let i=1;i<=500;i++){const q=limit*i/500;if(clearance(moved(path,v,q,growth))<=0){let lo=prev,hi=q;for(let k=0;k<36;k++){const mid=(lo+hi)/2;if(clearance(moved(path,v,mid,growth))<=0)hi=mid;else lo=mid;}return hi;}prev=q;}return null;}
let fixtures=0,contacts=0,maxDelta=0;const failures=[];
for(let trial=0;trial<700;trial++){
 const path=[{x:rand(16),y:rand(16)}],occupied=new Set([path[0].x+16*path[0].y]);
 for(let k=0,len=2+rand(55);k<len;k++){
  const a=path.at(-1),choices=Object.values(dirs).map(v=>({x:a.x+v.x,y:a.y+v.y})).filter(p=>p.x>=0&&p.y>=0&&p.x<16&&p.y<16&&!occupied.has(p.x+16*p.y));
  if(!choices.length)break;const next=choices[rand(choices.length)];path.push(next);occupied.add(next.x+16*next.y);
 }if(path.length<3)continue;
 const heading=Object.keys(dirs).find(d=>dirs[d].x===path[0].x-path[1].x&&dirs[d].y===path[0].y-path[1].y);
 let fruit;for(let y=0;y<16&&!fruit;y++)for(let x=0;x<16&&!fruit;x++)if(!occupied.has(x+16*y))fruit={x,y};
 for(const d of Object.keys(dirs))for(const growth of [0,1]){
  const old={version:1,seed:7,body:clone(path),food:fruit,direction:heading,queue:[],phase:'running',score:(path.length-3)*10,elapsed:0,ticks:0};
  const s=m.restoreState(old);assert.ok(s);if(!m.start(s,d))continue;
  s.food=null;m.advance(s,43.2);if(s.phase!=='running')continue;
  s.growth=growth;s.segments+=growth;s.score+=growth*10;
  m.advance(s,rand(149)+1);if(s.phase!=='running')continue;
  const initial=clone(s),window=160-s.elapsed,limit=window/160;
  const expected=firstContact(initial.body,dirs[d],initial.growth,limit);m.advance(s,window);fixtures++;
  const actual=s.phase==='lost'?(s.time-initial.time)/160:null;
  if(actual!==null)contacts++;
  const delta=actual!==null&&expected!==null?Math.abs(actual-expected):0;maxDelta=Math.max(maxDelta,delta);
  if((actual===null)!==(expected===null)||delta>1e-6)failures.push({trial,d,growth,expected,actual,initial});
 }
}
console.log(JSON.stringify({sourceCommit:'c4156180c1f590212cbeb47f25245dbfe78605c5',fractionalStart:true,oracle:'Independent polyline advection/tail trimming and axis-aligned signed distances, dense sweep plus bisection; food disabled to isolate solids',fixtures,contacts,maxContactDistanceDelta:maxDelta,failures:failures.slice(0,4)},null,2));assert.equal(failures.length,0);
