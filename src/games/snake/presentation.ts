import {advance,vector,type Cell,type SnakeState} from './model';
export interface SnakePresentation {time:number;foodAt:number;ateAt:number;eaten:Cell|null}
export interface SnakePose {path:Cell[];head:Cell;tangent:Cell;progress:number}
export function createPresentation(s?:SnakeState):SnakePresentation{return {time:s?.time??0,foodAt:s?.foodAt??-Infinity,ateAt:s?.ateAt??-Infinity,eaten:s?.eaten?{...s.eaten}:null};}
export function advancePresentation(s:SnakeState,view:SnakePresentation,ms:number):void{advance(s,ms);Object.assign(view,createPresentation(s));}
/** The model's continuous trail is the rendered geometry; no delayed projection or predicted endpoint. */
export function projectSnake(s:SnakeState,_view?:SnakePresentation,_reducedMotion=false):SnakePose{return {path:s.body.map(p=>({...p})),head:{...s.body[0]},tangent:{...vector[s.direction]},progress:s.elapsed/160};}
export function savePresentation(view:SnakePresentation):{foodAge:number;eatAge:number;eaten:Cell|null}{
 const age=(at:number)=>Number.isFinite(at)?Math.min(200,Math.max(0,view.time-at)):200;
 return {foodAge:age(view.foodAt),eatAge:age(view.ateAt),eaten:age(view.ateAt)<200&&view.eaten?{...view.eaten}:null};
}
export function restorePresentation(s:SnakeState,value:unknown,legacy=false):SnakePresentation{
 // Only the original raw v1 discriminator authorizes import; v2 owns effects even at time zero.
 if(legacy&&s.migration&&value&&typeof value==='object'&&s.time===0){
  const p=value as {foodAge?:unknown;eatAge?:unknown;eaten?:Cell};
  const age=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=200;
  if(age(p.foodAge))s.foodAt=-p.foodAge;
  if(age(p.eatAge)&&p.eaten&&Number.isInteger(p.eaten.x)&&Number.isInteger(p.eaten.y)&&p.eaten.x>=0&&p.eaten.y>=0&&p.eaten.x<16&&p.eaten.y<16){s.ateAt=-p.eatAge;s.eaten={...p.eaten};}
 }
 return createPresentation(s);
}
