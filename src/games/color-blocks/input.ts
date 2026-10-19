import {SHAPES} from './model';
export interface Point {x:number;y:number}
export interface Bounds {left:number;top:number;width:number;height:number}
/** Same viewport coordinates and lifted anchor are used for visual, ghost and release. */
export function mapDrag(board:Bounds,pointer:Point,anchor:Point,pointerType:string){
 const cell=board.width/8,offsetY=pointerType==='touch'?Math.max(26,cell*1.25):0;
 const liftedY=pointer.y-offsetY;
 return {x:Math.floor((pointer.x-board.left)/cell)-anchor.x,y:Math.floor((liftedY-board.top)/(board.height/8))-anchor.y,
  left:pointer.x-(anchor.x+.5)*cell,top:liftedY-(anchor.y+.5)*cell,cell,offsetY};
}
/** A piece's bounding rectangle can contain holes; never anchor a missing tile. */
export function grabCell(shape:number,bounds:Bounds,pointer:Point):Point{
 const cells=SHAPES[shape],w=Math.max(...cells.map(c=>c[0]))+1,h=Math.max(...cells.map(c=>c[1]))+1;
 const x=Math.max(0,Math.min(w-1,Math.floor((pointer.x-bounds.left)/bounds.width*w)));
 const y=Math.max(0,Math.min(h-1,Math.floor((pointer.y-bounds.top)/bounds.height*h)));
 const nearest=cells.reduce((a,b)=>Math.hypot(b[0]-x,b[1]-y)<Math.hypot(a[0]-x,a[1]-y)?b:a);
 return {x:nearest[0],y:nearest[1]};
}
