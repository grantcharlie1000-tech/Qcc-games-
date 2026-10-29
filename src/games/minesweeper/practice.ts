import {LEVELS,neighbors,type Board,type Level} from './model';
export const LABELS:Record<Level,string>={beginner:'Easy',intermediate:'Medium',expert:'Hard'};
export interface Stats {played:number;wins:number;bestMs:number|null}
export type AllStats=Record<Level,Stats>;
export const emptyStats=():AllStats=>({beginner:{played:0,wins:0,bestMs:null},intermediate:{played:0,wins:0,bestMs:null},expert:{played:0,wins:0,bestMs:null}});
export function readStats(value:unknown):AllStats {
 const out=emptyStats();if(!value||typeof value!=='object')return out;
 for(const level of Object.keys(LEVELS) as Level[]){const s=(value as AllStats)[level];if(s&&Number.isSafeInteger(s.played)&&s.played>=0&&Number.isSafeInteger(s.wins)&&s.wins>=0&&s.wins<=s.played&&(s.bestMs===null||Number.isFinite(s.bestMs)&&s.bestMs>=0))out[level]={played:s.played,wins:s.wins,bestMs:s.bestMs};}return out;
}
export function recordStart(stats:AllStats,level:Level,assisted:boolean){if(!assisted)stats[level].played++;}
export function recordWin(stats:AllStats,level:Level,ms:number,assisted:boolean){if(!assisted){const s=stats[level];s.wins++;s.bestMs=Math.min(s.bestMs??Infinity,ms);}}
/** Higher is better in QCC's shared leaderboard. One millisecond resolution, no par cap. */
export function competitiveScore(b:Board,assisted:boolean){return b.status==='won'&&!assisted?2147483647-Math.min(2147483646,Math.max(0,Math.ceil(b.elapsedMs))):0;}
export const SCORE_TIERS:Record<Level,{base:number;parMs:number}>={beginner:{base:0,parMs:60000},intermediate:{base:10000,parMs:180000},expert:{base:20000,parMs:480000}};
export function winScore(b:Board,assisted:boolean){if(b.status!=='won'||assisted)return 0;const {base,parMs}=SCORE_TIERS[b.level];return base+Math.max(1,Math.floor(9999*parMs/(parMs+Math.max(0,Math.ceil(b.elapsedMs)))));}
export const rankingKey=(level:Level)=>`minesweeper-${({beginner:'easy',intermediate:'medium',expert:'hard'} as const)[level]}` as const;
export function formatTime(ms:number,precise=false){const sec=Math.floor(ms/1000);return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}${precise?'.'+String(Math.floor(ms%1000)).padStart(3,'0'):''}`;}
export interface Hint {index:number;explanation:string}
/** Constraint/subset deductions use ONLY revealed numbers. Player flags are never evidence. */
export function hint(b:Board):Hint|null {
 if(b.status!=='playing')return null;
 const position=(i:number)=>`row ${Math.floor(i/LEVELS[b.level].width)+1}, column ${i%LEVELS[b.level].width+1}`;
 type Constraint={cells:number[];mines:number;sources:number[]};
 const constraints:Constraint[]=b.cells.flatMap((n,i)=>b.revealed[i]&&n>=0?[{cells:neighbors(b,i).filter(j=>!b.revealed[j]),mines:n,sources:[i]}]:[]).filter(c=>c.cells.length);
 const known=new Set<number>();
 // At most 480 cells; bounded subset passes keep hints cheap on school hardware.
 for(let pass=0;pass<12;pass++){
  let changed=false;
  for(const c of constraints){const cells=c.cells.filter(i=>!known.has(i)),mines=c.mines-(c.cells.length-cells.length);
   if(mines<0||mines>cells.length)return null;
   if(cells.length&&mines===0)return {index:cells[0],explanation:`${c.sources.length===1?'The visible number':'Comparing the visible numbers'} at ${c.sources.map(position).join(' and ')} leaves 0 mines in these ${cells.length} remaining neighbouring cells. ${position(cells[0])} is safe. Flags are not used as evidence.`};
   if(cells.length&&mines===cells.length)for(const i of cells)if(!known.has(i)){known.add(i);changed=true;}
  }
  const simplified=constraints.map(c=>({...c,cells:c.cells.filter(i=>!known.has(i)),mines:c.mines-c.cells.filter(i=>known.has(i)).length})).filter(c=>c.cells.length);
  const seen=new Set(constraints.map(c=>c.cells.join(',')+':'+c.mines));
  for(const a of simplified)for(const c of simplified){
   if(a.cells.length>=c.cells.length||!a.cells.every(i=>c.cells.includes(i)))continue;
   const cells=c.cells.filter(i=>!a.cells.includes(i)),mines=c.mines-a.mines,key=cells.join(',')+':'+mines;
   if(!seen.has(key)&&constraints.length<300){seen.add(key);constraints.push({cells,mines,sources:[...new Set([...a.sources,...c.sources])]});changed=true;}
  }
  if(!changed)break;
 }
 return null;
}
