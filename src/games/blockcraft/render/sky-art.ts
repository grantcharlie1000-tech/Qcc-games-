// Original pixel art for the sky: a square sun with a soft glow border and a square cratered moon
// in eight phases. One strip of 16×16 cells: cell 0 is the sun, cells 1..8 are moon phases 0..7.
// Colours are drawn additively over the sky (black adds nothing).
export const CELESTIAL_CELL=16;
export const CELESTIAL_CELLS=9;
export const CELESTIAL_WIDTH=CELESTIAL_CELL*CELESTIAL_CELLS;
/** Moon craters as [x, y] pixels inside the 10×10 moon square (top-left origin). */
const CRATERS:[number,number][]=[[2,1],[3,1],[2,2],[6,2],[7,3],[1,5],[4,4],[4,5],[5,5],[8,6],[2,7],[3,8],[6,7],[6,8],[7,8],[8,1]];

/** RGBA strip (top row first), CELESTIAL_WIDTH × CELESTIAL_CELL. */
export function paintCelestial():Uint8ClampedArray{
  const W=CELESTIAL_WIDTH,data=new Uint8ClampedArray(W*CELESTIAL_CELL*4);
  const put=(cell:number,x:number,y:number,r:number,g:number,b:number,a:number)=>{
    const i=(y*W+cell*CELESTIAL_CELL+x)*4;data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;
  };
  // Sun: hot white core, yellow body, orange rim, then a fading glow border.
  for(let y=0;y<CELESTIAL_CELL;y++)for(let x=0;x<CELESTIAL_CELL;x++){
    const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));
    if(d<2.5)put(0,x,y,255,253,232,255);
    else if(d<4)put(0,x,y,255,240,150,255);
    else if(d<5)put(0,x,y,255,214,92,255);
    else if(d<6.5)put(0,x,y,255,196,84,110);
    else put(0,x,y,255,182,70,38);
  }
  const crater=new Set(CRATERS.map(([x,y])=>y*10+x));
  for(let phase=0;phase<8;phase++){
    // The lit hemisphere's centre swings left while waning (phases 1-3) and in from the right while waxing (5-7).
    const centre=-phase*Math.PI/4;
    for(let y=0;y<CELESTIAL_CELL;y++)for(let x=0;x<CELESTIAL_CELL;x++){
      const mx=x-3,my=y-3;
      if(mx<0||my<0||mx>9||my>9){put(1+phase,x,y,0,0,0,0);continue;}
      const sx=(mx+.5)/5-1,sy=(my+.5)/5-1;
      const longitude=Math.asin(Math.max(-1,Math.min(1,sx/Math.sqrt(Math.max(.06,1-sy*sy*.75)))));
      // Full and new moons are exact so the square's corners (longitude ±90°) follow them.
      const lit=phase===0||phase!==4&&Math.cos(longitude-centre)>1e-6;
      if(!lit){put(1+phase,x,y,0,0,0,255);continue;}
      const edge=mx===0||my===0||mx===9||my===9;
      if(crater.has(my*10+mx))put(1+phase,x,y,150,156,178,255);
      else if(edge)put(1+phase,x,y,184,190,210,255);
      else put(1+phase,x,y,216,222,236,255);
    }
  }
  return data;
}
