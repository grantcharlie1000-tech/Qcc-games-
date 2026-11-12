// Usage: node work/last-light/tools/check.mjs <stage> [--tune] [--full]
// Fast authoring audit for one stage: every consecutive main hop must be found by the campaign test's own
// jumpBetween search; headroom rules; with --full the whole reachability graph; with --tune, speeds for failing movers.
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
const root=new URL('../../../',import.meta.url),scratch=new URL('work/last-light/journey-recording/',root);
await mkdir(scratch,{recursive:true});
const out=new URL('check.mjs',scratch);
await build({stdin:{contents:"export * from './src/games/last-light/levels.ts'; export * from './src/games/last-light/model.ts'; export * from './tests/games/last-light/routes.ts';",resolveDir:fileURLToPath(root)},bundle:true,platform:'node',format:'esm',outfile:fileURLToPath(out),logLevel:'error'});
const {LEVELS,platformAt,stationAt,overlap,jumpBetween,routeGraph,reachable}=await import(out.href+'?'+Date.now());
const args=process.argv.slice(2),stage=+args[0],l=LEVELS[stage],tune=args.includes('--tune'),full=args.includes('--full');
console.log(`stage ${stage+1}: ${l.mainCount} main + ${l.platforms.length-l.mainCount} side; width ${l.width} height ${l.height} water ${l.water}; exit ${JSON.stringify(l.exit)}`);
let bad=0;
const desc=p=>`#${p.id}(${p.x},${p.y},${p.w}${p.kind==='stone'?'':','+p.kind}${p.tag?','+p.tag:''})`;
for(let i=0;i<l.mainCount-1;i++){
 if(!jumpBetween(l,i,i+1)){
  bad++;const a=l.platforms[i],b=l.platforms[i+1];console.log(`NO HOP ${desc(a)} -> ${desc(b)}`);
  if(tune)for(const m of [a,b])if(m.kind==='moving'){
   const keep=m.speed,ok=[];
   for(let v=.4;v<=2.4;v+=.025){m.speed=+v.toFixed(3);const j=m.id,edges=[[j-1,j],[j,j+1]].filter(([x,y])=>x>=0&&y<l.mainCount);if(edges.every(([x,y])=>jumpBetween(l,x,y)))ok.push(m.speed);}
   m.speed=keep;console.log(`   speeds that work for mover #${m.id}: ${ok.join(' ')||'none'}`);
  }
 }
}
for(const clock of [0,1.8,4.2]){
 const solids=l.platforms.map(p=>({id:p.id,...platformAt(p,clock)}));
 for(const u of solids)for(const d of solids)if(u.id!==d.id&&u.y<=d.y&&u.x<d.x+d.w&&d.x<u.x+u.w&&d.y-u.y-u.h<32){bad++;console.log(`SQUEEZE ${u.id}/${d.id} at ${clock}s: ${d.y-u.y-u.h}`);}
 const gh=l.goal==='relay'&&l.setting==='garden'?164:116,exit={x:l.exit.x+19-80,y:l.exit.y+56-gh,w:160,h:gh};
 for(const p of solids)if(overlap(exit,p)){bad++;console.log(`EXIT overlaps ${p.id} at ${clock}s`);}
 for(const s of l.stations){const at=stationAt(s,l,clock),space={x:at.x-32,y:at.y-70,w:64,h:70};for(const p of solids)if(p.id!==s.platform&&overlap(space,p)){bad++;console.log(`STATION ${s.id} overlaps ${p.id}`);}}
 for(const k of l.pickups){const space={x:k.x-9,y:k.y-12,w:18,h:24};for(const p of solids)if(overlap(space,p)){bad++;console.log(`PICKUP ${k.id} overlaps ${p.id}`);}}
}
if(l.height-40<=Math.max(...l.platforms.map(p=>p.y+p.h))+60){bad++;console.log('FALL line too close to the lowest landing');}
if(!(l.platforms[0].x<=152&&l.platforms[0].x+l.platforms[0].w>=152)){bad++;console.log('first platform does not cover x=152');}
for(const cp of l.checkpoints){const p=l.platforms[cp.platform];if(p.kind!=='stone'||p.w<56)console.log(`note: checkpoint on ${desc(p)}`);}
if(full){
 const t=Date.now(),graph=routeGraph(l),from=reachable(graph,0);
 for(const p of l.platforms){if(!from.has(p.id)){bad++;console.log(`UNREACHABLE ${desc(p)}`);}if(!reachable(graph,p.id).has(l.mainCount-1)){bad++;console.log(`NO WAY ON from ${desc(p)}`);}}
 const optional=l.platforms.slice(0,l.mainCount-1).some(entry=>{const queue=(graph.get(entry.id)??[]).filter(id=>id>=l.mainCount),seen=new Set(queue);while(queue.length)for(const id of graph.get(queue.shift())??[]){if(id<l.mainCount){if(id>entry.id)return true;continue;}if(!seen.has(id)){seen.add(id);queue.push(id);}}return false;});
 if(!optional){bad++;console.log('NO SIDE ROUTE reconnects farther along');}
 for(const k of l.pickups.filter(k=>k.kind==='spark')){const support=l.platforms.findIndex(r=>k.x>=r.x&&k.x<=r.x+r.w&&k.y===r.y-30);if(support<0||!from.has(support)){bad++;console.log(`MEMORY ${k.id} unreachable (support ${support})`);}}
 console.log(`graph ${((Date.now()-t)/1000).toFixed(1)}s`);
}
console.log(bad?`${bad} problems`:'ok');
