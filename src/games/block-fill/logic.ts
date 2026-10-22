/** Grid cells are vertices; Manhattan-distance-one pairs are undirected edges. */
export interface Level { size:number; cells:number[]; start:number; solution:number[] }
/** Best clear of one garden: forward steps taken (retraced squares count again), then hints. */
export interface Best { steps:number; hints:number }
/** `best` is campaign progress keyed by garden index: it survives Restart and Reset path. */
export interface State { version:1; level:number; path:number[]; rewarded:boolean; steps:number; hints:number; best:Record<string,Best> }
export const LEVEL_COUNT=12;
const plans = [[3,9],[4,14],[4,16],[5,20],[5,23],[5,25],[6,27],[6,29],[6,31],[6,33],[6,35],[6,36]] as const;
export function adjacent(a:number,b:number,size:number):boolean { return Math.abs(a%size-b%size)+Math.abs(Math.floor(a/size)-Math.floor(b/size))===1; }
/** Seeded backbite transformations preserve one Hamiltonian path; truncating it creates holes. */
export function generateLevel(index:number):Level {
  const [size,count]=plans[index] ?? plans[0]!;
  let seed=(index+1)*7919;
  const random=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  let route=Array.from({length:size*size},(_,i)=>Math.floor(i/size)*size+(Math.floor(i/size)%2 ? size-1-i%size : i%size));
  for(let k=0;k<32;k++) {
    if(random()<.5) route.reverse();
    const candidates=route.map((c,i)=>({c,i})).filter(({c,i})=>i>1&&adjacent(route[0]!,c,size));
    const chosen=candidates[Math.floor(random()*candidates.length)];
    if(chosen) route=[...route.slice(0,chosen.i).reverse(),...route.slice(chosen.i)];
  }
  route=route.slice(0,count);
  return {size,cells:[...route].sort((a,b)=>a-b),start:route[0]!,solution:route};
}
export function initialState(best:Record<string,Best>={}):State { return {version:1,level:0,path:[generateLevel(0).start],rewarded:false,steps:0,hints:0,best:{...best}}; }
/** Base is 100 per open square; par is one step per square after START. Each hint costs a tenth of base from the bonus. */
export function levelPoints(index:number,best:Best):number {
  const cells=plans[index]![1], base=100*cells, par=cells-1;
  return base+Math.max(0,Math.round(base*Math.min(1,par/Math.max(1,best.steps)))-best.hints*Math.round(base/10));
}
export const campaignScore=(best:Record<string,Best>):number=>Object.entries(best).reduce((sum,[index,b])=>sum+levelPoints(Number(index),b),0);
/** A solved path updates its garden's record only when that scores higher. */
export function recordWin(state:State):State {
  if(!solved(generateLevel(state.level),state.path)) return state;
  const next={steps:state.steps,hints:state.hints}, old=state.best[state.level];
  return old&&levelPoints(state.level,old)>=levelPoints(state.level,next)?state:{...state,best:{...state.best,[state.level]:next}};
}
const count=(value:unknown,min:number):value is number=>Number.isInteger(value)&&(value as number)>=min&&(value as number)<=1_000_000;
/** Old snapshots lack `best`; malformed entries are dropped. */
export function readBest(value:unknown):Record<string,Best> {
  const best:Record<string,Best>={};
  if(!value||typeof value!=='object'||Array.isArray(value)) return best;
  for(const [key,entry] of Object.entries(value)) {
    const b=entry as Partial<Best>|null, index=Number(key);
    if(/^\d+$/.test(key)&&index<LEVEL_COUNT&&b&&typeof b==='object'&&count(b.steps,plans[index]![1]-1)&&count(b.hints,0)) best[index]={steps:b.steps,hints:b.hints};
  }
  return best;
}
export function step(level:Level,path:number[],cell:number):number[] {
  if(!level.cells.includes(cell)||!adjacent(path.at(-1)!,cell,level.size)) return path;
  if(path.length>1&&cell===path.at(-2)) return path.slice(0,-1);
  if(path.includes(cell)||solved(level,path)) return path;
  return [...path,cell];
}
export function undo(path:number[]):number[] { return path.length>1?path.slice(0,-1):path; }
export function validPath(level:Level,path:unknown):path is number[] {
  return Array.isArray(path)&&path.length>0&&path[0]===level.start&&path.length<=level.cells.length&&new Set(path).size===path.length&&Array.from(path).every((c,i)=>Number.isInteger(c)&&level.cells.includes(c)&&(i===0||adjacent(path[i-1],c,level.size)));
}
export function solved(level:Level,path:number[]):boolean { return path.length===level.cells.length&&validPath(level,path); }
/** Exact DFS with connectivity/degree pruning. A budget abort is distinguishable from proven failure. */
function search(level:Level,prefix:number[],budget:number):number[]|null|'limit' {
  if(!validPath(level,prefix)) return null;
  const cells=new Set(level.cells), visited=new Set(prefix), route=[...prefix];
  const neighbours=(c:number)=>[c-level.size,c+1,c+level.size,c-1].filter(n=>cells.has(n)&&adjacent(c,n,level.size));
  const edges=new Map(level.cells.map(c=>[c,neighbours(c)]));
  let nodes=0,limited=false;
  function visit(head:number):boolean {
    if(route.length===cells.size) return true;
    if(++nodes>budget) { limited=true; return false; }
    const remaining=level.cells.filter(c=>!visited.has(c));
    // The remaining graph plus its current head must be connected.
    const reachable=new Set<number>([head]), queue=[head];
    for(let i=0;i<queue.length;i++) for(const n of edges.get(queue[i]!)!) if(!reachable.has(n)&&(!visited.has(n)||n===head)){reachable.add(n);queue.push(n);}
    if(reachable.size!==remaining.length+1) return false;
    // At most one remaining vertex can be the terminal degree-one endpoint.
    let leaves=0;
    for(const c of remaining) {
      const degree=edges.get(c)!.filter(n=>!visited.has(n)||n===head).length;
      if(degree===0||degree===1&&++leaves>1) return false;
    }
    const next=edges.get(head)!.filter(n=>!visited.has(n)).sort((a,b)=>edges.get(a)!.filter(n=>!visited.has(n)).length-edges.get(b)!.filter(n=>!visited.has(n)).length);
    for(const n of next) {
      visited.add(n); route.push(n);
      if(visit(n)) return true;
      route.pop();visited.delete(n);
      if(limited) return false;
    }
    return false;
  }
  return visit(prefix.at(-1)!)?route:limited?'limit':null;
}
export function solve(level:Level,prefix:number[]):number[]|null { const result=search(level,prefix,1_000_000); return result==='limit'?null:result; }
export type Hint={kind:'step';cell:number}|{kind:'backtrack';count:number;proven:boolean}|{kind:'done'};
export function hint(level:Level,path:number[]):Hint {
  if(solved(level,path)) return {kind:'done'};
  const result=search(level,path,80_000);
  if(Array.isArray(result)) return {kind:'step',cell:result[path.length]!};
  // Find an explicitly solvable recovery prefix. Stored construction is used ONLY after undoing to a matching prefix.
  for(let length=path.length-1;length>=1;length--) {
    const prefix=path.slice(0,length);
    if(prefix.every((c,i)=>c===level.solution[i])) return {kind:'backtrack',count:path.length-length,proven:result===null};
    const recovery=search(level,prefix,8_000);
    if(Array.isArray(recovery)) return {kind:'backtrack',count:path.length-length,proven:result===null};
  }
  return {kind:'backtrack',count:path.length-1,proven:result===null};
}
export function restoreState(data:unknown):State|null {
  if(!data||typeof data!=='object') return null;
  const s=data as Record<string,unknown>;
  // steps, hints and best are optional so pre-campaign snapshots still restore.
  if(!['level','path','rewarded','version'].every(k=>k in s)||Object.keys(s).some(k=>!['level','path','rewarded','version','steps','hints','best'].includes(k))||typeof s.rewarded!=='boolean'||s.version!==1||!Number.isInteger(s.level)||(s.level as number)<0||(s.level as number)>=LEVEL_COUNT) return null;
  const level=generateLevel(s.level as number);
  if(!validPath(level,s.path)||solved(level,s.path)&&!s.rewarded) return null;
  const path=[...s.path];
  return recordWin({version:1,level:s.level as number,path,rewarded:s.rewarded,steps:count(s.steps,path.length-1)?s.steps:path.length-1,hints:count(s.hints,0)?s.hints:0,best:readBest(s.best)});
}
export interface Point {x:number;y:number}
/** Samples at one eighth of a cell; orthogonal fast segments cannot skip a cell. */
export function sampleSegment(a:Point,b:Point,size:number):number[] {
  const count=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))*8)), result:number[]=[];
  for(let i=0;i<=count;i++) {
    const x=Math.floor(a.x+(b.x-a.x)*i/count), y=Math.floor(a.y+(b.y-a.y)*i/count);
    if(x>=0&&x<size&&y>=0&&y<size) {const cell=y*size+x;if(result.at(-1)!==cell)result.push(cell);}
  }
  return result;
}
