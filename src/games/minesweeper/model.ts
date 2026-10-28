/** Rules have no DOM or clock dependencies. Mines are sampled only on first reveal. */
export const LEVELS = {beginner:{width:9,height:9,mines:10},intermediate:{width:16,height:16,mines:40},expert:{width:30,height:16,mines:99}} as const;
export type Level = keyof typeof LEVELS;
export interface Board {version:1;level:Level;seed:number;first:number|null;cells:number[];revealed:boolean[];flags:boolean[];status:'ready'|'playing'|'won'|'lost';exploded:number|null;elapsedMs:number}
export function create(level:Level='beginner',seed=1):Board {
  const n=LEVELS[level].width*LEVELS[level].height;
  return {version:1,level,seed:seed>>>0,first:null,cells:Array(n).fill(0),revealed:Array(n).fill(false),flags:Array(n).fill(false),status:'ready',exploded:null,elapsedMs:0};
}
function valid(b:Board,i:number):boolean{return Number.isInteger(i)&&i>=0&&i<b.cells.length;}
function active(b:Board):boolean{return b.status==='ready'||b.status==='playing';}
export function neighbors(b:Board,i:number):number[]{
  if(!valid(b,i))return [];
  const {width,height}=LEVELS[b.level],x=i%width,y=Math.floor(i/width),out:number[]=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)out.push((y+dy)*width+x+dx);
  return out;
}
function place(b:Board,first:number):void {
  const {mines}=LEVELS[b.level];
  const protectedCells=new Set([first,...neighbors(b,first)]);
  // With all supported boards a full 3x3 opening fits. Fallback keeps the click safe.
  if(b.cells.length-protectedCells.size<mines){protectedCells.clear();protectedCells.add(first);}
  const pool=b.cells.map((_,i)=>i).filter(i=>!protectedCells.has(i));
  let state=b.seed;
  const uint=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return (t^(t>>>14))>>>0;};
  const below=(n:number)=>{const limit=Math.floor(4294967296/n)*n;let r=uint();while(r>=limit)r=uint();return r%n;};
  // Partial Fisher-Yates: sample without replacement. Rejection avoids modulo bias.
  for(let k=0;k<mines;k++){const j=k+below(pool.length-k);[pool[k],pool[j]]=[pool[j],pool[k]];b.cells[pool[k]]=-1;}
  for(let i=0;i<b.cells.length;i++)if(b.cells[i]!==-1)b.cells[i]=neighbors(b,i).filter(j=>b.cells[j]===-1).length;
  b.first=first;b.status='playing';
}
function open(b:Board,start:number):void {
  if(b.revealed[start]||b.flags[start])return;
  if(b.cells[start]===-1){b.revealed[start]=true;b.exploded=start;b.status='lost';return;}
  const queue=[start];b.revealed[start]=true;
  // Iterative BFS visits each safe cell at most once, stopping at numbered borders.
  for(let head=0;head<queue.length;head++)if(b.cells[queue[head]]===0)for(const j of neighbors(b,queue[head])){
    if(!b.revealed[j]&&!b.flags[j]&&b.cells[j]!==-1){b.revealed[j]=true;queue.push(j);}
  }
}
function finish(b:Board):void {if(b.status==='playing'&&b.cells.every((n,i)=>n===-1||b.revealed[i]))b.status='won';}
export function reveal(b:Board,i:number):boolean {
  if(!active(b)||!valid(b,i)||b.flags[i]||b.revealed[i])return false;
  if(b.first===null)place(b,i);
  open(b,i);finish(b);return true;
}
export function flag(b:Board,i:number):boolean {
  if(!active(b)||!valid(b,i)||b.revealed[i])return false;
  b.flags[i]=!b.flags[i];return true;
}
export function chord(b:Board,i:number):boolean {
  if(b.status!=='playing'||!valid(b,i)||!b.revealed[i]||b.cells[i]<=0)return false;
  const near=neighbors(b,i);
  if(near.filter(j=>b.flags[j]).length!==b.cells[i])return false;
  // Treat a chord as one action: resolve a mine before opening any safe targets.
  const danger=near.find(j=>!b.flags[j]&&!b.revealed[j]&&b.cells[j]===-1);
  if(danger!==undefined){open(b,danger);return true;}
  let changed=false;
  for(const j of near)if(!b.flags[j]&&!b.revealed[j]){open(b,j);changed=true;if(b.exploded!==null)break;}
  finish(b);return changed;
}
/** Rebuild the hidden board from its seed and first click; do not trust saved mines. */
export function restore(data:unknown):Board|null {
  if(!data||typeof data!=='object')return null;
  const d=data as Record<string,unknown>;
  if(d.version!==1||typeof d.level!=='string'||!Object.hasOwn(LEVELS,d.level)||!Number.isInteger(d.seed)||Number(d.seed)<0||Number(d.seed)>0xFFFFFFFF||typeof d.elapsedMs!=='number'||!Number.isFinite(d.elapsedMs)||d.elapsedMs<0||d.elapsedMs>31536000000)return null;
  const b=create(d.level as Level,d.seed as number),n=b.cells.length;
  if(!Array.isArray(d.revealed)||d.revealed.length!==n||!d.revealed.every(x=>typeof x==='boolean')||!Array.isArray(d.flags)||d.flags.length!==n||!d.flags.every(x=>typeof x==='boolean')||!Array.isArray(d.cells)||d.cells.length!==n)return null;
  if(d.first!==null){if(typeof d.first!=='number'||!valid(b,d.first))return null;place(b,d.first);}
  if(!b.cells.every((v,i)=>v===(d.cells as unknown[])[i]))return null;
  b.revealed=[...d.revealed] as boolean[];b.flags=[...d.flags] as boolean[];b.elapsedMs=d.elapsedMs;
  if(b.revealed.some((v,i)=>v&&b.flags[i]))return null;
  const detonated=b.revealed.flatMap((v,i)=>v&&b.cells[i]===-1?[i]:[]);
  const won=b.first!==null&&b.cells.every((v,i)=>v===-1||b.revealed[i]);
  if(d.status==='ready'){
    if(b.first!==null||b.revealed.some(Boolean)||d.exploded!==null||(b.elapsedMs!==0&&!(d.practice===true&&d.assisted===true)))return null;
  }else{
    if(b.first===null||!b.revealed[b.first])return null;
    if(d.status==='playing'){if(won||detonated.length||d.exploded!==null)return null;}
    else if(d.status==='won'){if(!won||detonated.length||d.exploded!==null)return null;}
    else if(d.status==='lost'){if(won||detonated.length!==1||d.exploded!==detonated[0])return null;}
    else return null;
  }
  b.status=d.status as Board['status'];b.exploded=d.exploded as number|null;return b;
}
/** Losses score safe cells (<1000). Wins: harder level first, then 3 per second under par. */
export const WIN={beginner:{base:1000,par:300},intermediate:{base:3000,par:900},expert:{base:6000,par:1800}} as const;
export function score(b:Board):number {
  const safe=b.revealed.filter((v,i)=>v&&b.cells[i]!==-1).length,{base,par}=WIN[b.level];
  return b.status==='won'?base+Math.max(0,par-Math.floor(b.elapsedMs/1000))*3:safe;
}
