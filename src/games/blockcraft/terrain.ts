import {Simplex,hash3} from './noise';
import {AIR,GRASS,DIRT,STONE,SAND,LOG,LEAVES,COAL,IRON,SNOW,WATER,BEDROCK} from './blocks';

export const CS=16,CH=64,SEA=26,LAYER=CS*CS,CHUNK_VOLUME=LAYER*CH;
export const SNOW_LINE=48,ROCK_LINE=44;
/** Index of a local voxel. y-major layers keep each 16×16 slab contiguous. */
export const voxelIndex=(x:number,y:number,z:number)=>x+z*CS+y*LAYER;

export class TerrainGenerator{
  readonly seed:number;
  private base:Simplex;private detail:Simplex;private caves:Simplex;
  // Scratch buffers reused for every chunk this generator produces.
  private heights=new Int16Array((CS+4)*(CS+4));
  private caveSamples=new Float32Array(5*5*17);
  constructor(seed:number){this.seed=seed>>>0;this.base=new Simplex(this.seed);this.detail=new Simplex(this.seed^0x5bd1e995);this.caves=new Simplex(this.seed^0x1b873593);}

  /** Surface height of a world column. */
  heightAt(wx:number,wz:number):number{
    const b=this.base,d=this.detail;
    const continent=b.noise2(wx/320,wz/320);
    const hills=(d.noise2(wx/90,wz/90)+.5*d.noise2(wx/40+31,wz/40-17)+.25*d.noise2(wx/17-9,wz/17+5))/1.75;
    const ridge=Math.max(0,b.noise2(wx/210+100,wz/210-40));
    const h=28+continent*8+hills*7+ridge*ridge*34;
    return Math.max(3,Math.min(CH-8,Math.floor(h)));
  }
  private treeAt(wx:number,wz:number,h:number):number{
    if(h<SEA+2||h>=ROCK_LINE)return 0;
    if(hash3(wx,7,wz,this.seed)>=.012)return 0;
    return 4+Math.floor(hash3(wx,9,wz,this.seed)*3);
  }

  /** Deterministic, self-contained chunk contents. Trees that cross chunk borders
   *  are produced identically by every chunk they touch. */
  generate(cx:number,cz:number,out=new Uint8Array(CHUNK_VOLUME)):Uint8Array{
    out.fill(AIR);
    const x0=cx*CS,z0=cz*CS,heights=this.heights,P=CS+4;
    for(let z=-2;z<CS+2;z++)for(let x=-2;x<CS+2;x++)heights[(x+2)+(z+2)*P]=this.heightAt(x0+x,z0+z);
    // Caves: 3D noise sampled on a 4-voxel lattice, trilinearly interpolated.
    const cs=this.caveSamples,caves=this.caves;
    for(let gy=0;gy<17;gy++)for(let gz=0;gz<5;gz++)for(let gx=0;gx<5;gx++)
      cs[(gy*5+gz)*5+gx]=caves.noise3((x0+gx*4)/30,gy*4/16,(z0+gz*4)/30);
    const seed=this.seed;
    for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){
      const h=heights[(x+2)+(z+2)*P],wx=x0+x,wz=z0+z;
      const beach=h<=SEA+1,top=beach?SAND:h>=SNOW_LINE?SNOW:h>=ROCK_LINE?STONE:GRASS,under=beach?SAND:h>=ROCK_LINE?STONE:DIRT;
      const gx=x>>2,fx=(x&3)/4,gz=z>>2,fz=(z&3)/4;
      // Land columns may open to the sky; underwater floors stay sealed.
      const caveTop=h>SEA+2?h:h-5;
      for(let y=0;y<CH;y++){
        let id=AIR;
        if(y===0)id=BEDROCK;
        else if(y<h-3)id=STONE;
        else if(y<h)id=under;
        else if(y===h)id=top;
        else if(y<=SEA)id=WATER;
        if(id!==AIR&&id!==WATER&&id!==BEDROCK&&y>1&&y<=caveTop){
          const gy=y>>2,fy=(y&3)/4,i=(gy*5+gz)*5+gx;
          const c00=cs[i]+(cs[i+1]-cs[i])*fx,c10=cs[i+5]+(cs[i+6]-cs[i+5])*fx;
          const c01=cs[i+25]+(cs[i+26]-cs[i+25])*fx,c11=cs[i+30]+(cs[i+31]-cs[i+30])*fx;
          const v=(c00+(c10-c00)*fz)*(1-fy)+(c01+(c11-c01)*fz)*fy;
          if(v>.58-(y<12?.08:0))id=AIR;
        }
        if(id===STONE){
          if(y<54&&hash3(wx>>1,y>>1,wz>>1,seed+11)<.035&&hash3(wx,y,wz,seed+12)<.6)id=COAL;
          else if(y<34&&hash3(wx>>1,y>>1,wz>>1,seed+13)<.022&&hash3(wx,y,wz,seed+14)<.6)id=IRON;
        }
        out[x+z*CS+y*LAYER]=id;
      }
    }
    // Trees from this chunk and a two-column margin so canopies cross borders.
    for(let pass=0;pass<2;pass++)for(let tz=-2;tz<CS+2;tz++)for(let tx=-2;tx<CS+2;tx++){
      const h=heights[(tx+2)+(tz+2)*P],trunk=this.treeAt(x0+tx,z0+tz,h);if(!trunk)continue;
      const topY=h+trunk;
      if(pass===0){
        for(let dy=-2;dy<=1;dy++){
          const r=dy<=-1?2:1,y=topY+dy;if(y>=CH)continue;
          for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
            const x=tx+dx,z=tz+dz;if(x<0||x>=CS||z<0||z>=CS)continue;
            // Trim some corners for a rounder canopy.
            if(Math.abs(dx)===r&&Math.abs(dz)===r&&(dy===1||hash3(x0+x,y,z0+z,seed+3)<.5))continue;
            const i=x+z*CS+y*LAYER;if(out[i]===AIR)out[i]=LEAVES;
          }
        }
      }else if(tx>=0&&tx<CS&&tz>=0&&tz<CS){
        if(out[tx+tz*CS+h*LAYER]===GRASS)out[tx+tz*CS+h*LAYER]=DIRT;
        for(let y=h+1;y<topY&&y<CH;y++){const i=tx+tz*CS+y*LAYER;if(out[i]===AIR||out[i]===LEAVES)out[i]=LOG;}
      }
    }
    return out;
  }

  private clearOfTrees(x:number,z:number){
    for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++)if(this.treeAt(x+dx,z+dz,this.heightAt(x+dx,z+dz)))return false;
    return true;
  }
  /** A dry, moderate column near the origin, away from tree canopies. Returns feet position. */
  spawnPoint():{x:number;y:number;z:number}{
    for(let r=0;r<400;r+=3)for(let a=0;a<Math.max(1,r);a++){
      const angle=a/Math.max(1,r)*Math.PI*2,x=Math.round(Math.cos(angle)*r),z=Math.round(Math.sin(angle)*r);
      const h=this.heightAt(x,z);
      if(h>SEA+1&&h<ROCK_LINE-2&&this.clearOfTrees(x,z))return{x:x+.5,y:h+1,z:z+.5};
    }
    return{x:.5,y:CH-2,z:.5};
  }
}
