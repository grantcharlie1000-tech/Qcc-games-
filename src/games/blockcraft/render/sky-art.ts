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

// ---- Clouds -----------------------------------------------------------------------------------------------------------
/** Cloud cells per side of the tiling cloud map (each cell is CLOUD_CELL blocks). */
export const CLOUD_CELLS=48;
function lattice(x:number,y:number,period:number,salt:number){
  const px=((x%period)+period)%period,py=((y%period)+period)%period;
  let h=Math.imul(px*374761393+py*668265263+salt*1442695041,1274126177);h=Math.imul(h^h>>>13,1103515245);
  return((h^h>>>16)>>>0)/4294967296;
}
/** Smooth periodic value noise in 0..1 with `period` lattice cells across the map. */
function valueNoise(x:number,y:number,size:number,period:number,salt:number){
  const fx=x/size*period,fy=y/size*period,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy;
  const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
  const a=lattice(ix,iy,period,salt),b=lattice(ix+1,iy,period,salt),c=lattice(ix,iy+1,period,salt),d=lattice(ix+1,iy+1,period,salt);
  return (a+(b-a)*sx)+((c+(d-c)*sx)-(a+(b-a)*sx))*sy;
}
/** Blocky cloud map like the vanilla clouds texture: irregular blobs of cells covering about a third of the sky,
 *  seamless when tiled. 1 = cloud, row-major `size`×`size`. */
export function paintCloudMap(size=CLOUD_CELLS,seed=7):Uint8Array{
  const out=new Uint8Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const v=valueNoise(x,y,size,12,seed)*.55+valueNoise(x,y,size,24,seed+1)*.3+valueNoise(x,y,size,48,seed+2)*.15;
    out[x+y*size]=v>.58?1:0;
  }
  return out;
}
export interface CloudGeometry{positions:Float32Array;shades:Float32Array;quads:number}
/** 3D cloud boxes for a `copies`×`copies` tiling of the map, centred on the origin, one quad per exposed face, cells
 *  ordered nearest-first from the centre (so a single depth-writing pass draws mostly front to back). Face shades are the
 *  vanilla fancy-cloud ones: top 1, bottom 0.7, x sides 0.9, z sides 0.8. */
export function buildCloudGeometry(map:Uint8Array,size:number,cell:number,thickness:number,copies=2):CloudGeometry{
  const total=size*copies,half=total*cell/2,cells:number[]=[];
  const at=(x:number,z:number)=>map[((x%size)+size)%size+(((z%size)+size)%size)*size];
  for(let z=0;z<total;z++)for(let x=0;x<total;x++)if(at(x,z))cells.push(x+z*total);
  const centre=(total-1)/2;
  cells.sort((a,b)=>Math.hypot(a%total-centre,Math.floor(a/total)-centre)-Math.hypot(b%total-centre,Math.floor(b/total)-centre));
  const pos:number[]=[],shade:number[]=[];
  const quad=(c:number[][],s:number)=>{for(const i of [0,1,2,2,1,3]){pos.push(c[i][0],c[i][1],c[i][2]);shade.push(s);}};
  for(const index of cells){
    const cx=index%total,cz=Math.floor(index/total),x0=cx*cell-half,x1=x0+cell,z0=cz*cell-half,z1=z0+cell,y0=0,y1=thickness;
    // Counter-clockwise seen from outside.
    quad([[x0,y1,z1],[x1,y1,z1],[x0,y1,z0],[x1,y1,z0]],1);
    quad([[x0,y0,z0],[x1,y0,z0],[x0,y0,z1],[x1,y0,z1]],.7);
    if(!at(cx+1,cz))quad([[x1,y0,z1],[x1,y0,z0],[x1,y1,z1],[x1,y1,z0]],.9);
    if(!at(cx-1,cz))quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z0],[x0,y1,z1]],.9);
    if(!at(cx,cz+1))quad([[x0,y0,z1],[x1,y0,z1],[x0,y1,z1],[x1,y1,z1]],.8);
    if(!at(cx,cz-1))quad([[x1,y0,z0],[x0,y0,z0],[x1,y1,z0],[x0,y1,z0]],.8);
  }
  return{positions:new Float32Array(pos),shades:new Float32Array(shade),quads:pos.length/18};
}
