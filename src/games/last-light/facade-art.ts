import {WORLDS} from './levels';
type C=CanvasRenderingContext2D;
const cache=new Map<string,HTMLCanvasElement>();
function r(c:C,k:string,x:number,y:number,w:number,h:number){c.fillStyle=k;c.fillRect(x,y,w,h);}
/** Recessed windows share native texels, masonry ramps and bronze with the
 * playable slab. Cached fittings add construction detail without live loops. */
export function facadeWindow(world:number,variant:number){
 const key=`${world}/${variant}`;let canvas=cache.get(key);if(canvas)return canvas;
 canvas=document.createElement('canvas');canvas.width=38;canvas.height=57;const c=canvas.getContext('2d',{willReadFrequently:true})!,a=WORLDS[world],lit=variant===1;
 r(c,a.sky,6,4,26,44);r(c,a.near,3,2,32,4);r(c,a.edge+'66',4,2,29,1);r(c,a.sky+'a0',5,6,29,3);
 for(const x of [5,29]){r(c,a.near,x,9,4,38);r(c,a.edge+'40',x,9,1,35);for(let y=11;y<45;y+=9){r(c,a.sky,x,y,4,1);r(c,a.edge+'20',x+1,y+2,2,1);}}
 r(c,'#172d38',10,9,18,34);r(c,lit?'#8f805d':'#3a535e',11,10,16,31);r(c,lit?'#d8bd84':'#6c8787',12,11,3,27);
 if(variant===2){for(let y=12;y<40;y+=5){r(c,a.near,12,y,14,3);r(c,a.edge+'35',12,y,13,1);r(c,a.sky,13,y+3,13,1);}r(c,'#9b8c6f',23,25,2,4);}else{
  r(c,a.sky,18,10,2,32);r(c,a.edge+'40',18,11,1,28);r(c,a.sky,10,25,18,2);r(c,a.edge+'30',11,25,15,1);r(c,a.sky+'60',21,11,6,13);
  if(lit){r(c,'#b7a878',22,28,4,12);r(c,'#716d55',21,27,1,14);}
 }
 r(c,a.sky,3,46,34,5);r(c,a.edge+'77',3,46,32,1);r(c,a.near,4,47,30,2);r(c,a.edge+'25',7,50,24,1);
 for(const x of [7,28]){r(c,a.near,x,51,3,5);r(c,a.edge+'30',x,51,1,4);}
 cache.set(key,canvas);return canvas;
}
