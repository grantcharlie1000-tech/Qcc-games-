import {SHAPES} from '../../../src/games/color-blocks/model';
export interface HandMove {slot:number;x:number;y:number}
// Independent test oracle: occupancy only, exhaustive depth-three search and
// simultaneous row/column removal. It never calls the production placement code.
export function clearReference(input:readonly number[]):number[]{
 const full=new Set<number>();
 for(let n=0;n<8;n++){
  if(input.slice(n*8,n*8+8).every(Boolean))for(let i=0;i<8;i++)full.add(n*8+i);
  if(Array.from({length:8},(_,i)=>input[i*8+n]).every(Boolean))for(let i=0;i<8;i++)full.add(i*8+n);
 }
 return input.map((v,i)=>full.has(i)?0:v);
}
export function solveHand(board:readonly number[],tray:readonly (number|null)[]):HandMove[]|null{
 const failed=new Set<string>();
 function search(cells:readonly number[],remaining:number):HandMove[]|null{
  if(!remaining)return [];
  const key=cells.map(v=>v?'1':'0').join('')+':'+remaining;if(failed.has(key))return null;
  for(let slot=0;slot<3;slot++)if(remaining&(1<<slot)){
   const shape=SHAPES[tray[slot]!];
   for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    if(shape.some(([dx,dy])=>x+dx>=8||y+dy>=8||cells[(y+dy)*8+x+dx]))continue;
    const next=[...cells];for(const [dx,dy] of shape)next[(y+dy)*8+x+dx]=1;
    const rest=search(clearReference(next),remaining^(1<<slot));if(rest)return [{slot,x,y},...rest];
   }
  }
  failed.add(key);return null;
 }
 return search(board,tray.reduce<number>((mask,p,i)=>p===null?mask:mask|(1<<i),0));
}
