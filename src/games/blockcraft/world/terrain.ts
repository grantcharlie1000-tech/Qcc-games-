// STUB terrain (owned by the terrain & biomes agent, who replaces it): the original generator
// adapted to the new registries, 128-high chunks and per-column biomes. Pure and deterministic:
// it also runs inside world/worker.ts.
import {Simplex,hash3} from './noise';
import {AIR,B,blockId} from '../data/blocks';
import {biomeId} from '../data/biomes';
import {CS,CH,LAYER,CHUNK_VOLUME,SEA_LEVEL} from '../engine/constants';
import type {BlockWriter,ChunkData,TerrainService,TreeKind,Vec3} from '../engine/contracts';

const PLAINS=biomeId('plains'),BEACH=biomeId('beach'),OCEAN=biomeId('ocean'),SNOWY=biomeId('snowy_peaks');
const COAL=blockId('coal_ore'),IRON=blockId('iron_ore'),GOLD=blockId('gold_ore'),DIAMOND=blockId('diamond_ore');

export class TerrainGenerator implements TerrainService{
  readonly seed:number;
  private base:Simplex;private detail:Simplex;private caves:Simplex;
  private heights=new Int16Array((CS+4)*(CS+4));
  constructor(seed:number){this.seed=seed>>>0;this.base=new Simplex(this.seed);this.detail=new Simplex(this.seed^0x5bd1e995);this.caves=new Simplex(this.seed^0x1b873593);}
  heightAt(wx:number,wz:number):number{
    const b=this.base,d=this.detail;
    const continent=b.noise2(wx/320,wz/320);
    const hills=(d.noise2(wx/90,wz/90)+.5*d.noise2(wx/40+31,wz/40-17)+.25*d.noise2(wx/17-9,wz/17+5))/1.75;
    const ridge=Math.max(0,b.noise2(wx/210+100,wz/210-40));
    return Math.max(3,Math.min(CH-12,Math.floor(64+continent*10+hills*8+ridge*ridge*44)));
  }
  biomeAt(x:number,z:number){const h=this.heightAt(x,z);return h<SEA_LEVEL-2?OCEAN:h<=SEA_LEVEL+1?BEACH:h>=100?SNOWY:PLAINS;}
  private treeAt(wx:number,wz:number,h:number):number{
    if(h<SEA_LEVEL+2||h>=92)return 0;
    if(hash3(wx,7,wz,this.seed)>=.012)return 0;
    return 4+Math.floor(hash3(wx,9,wz,this.seed)*3);
  }
  generate(cx:number,cz:number):ChunkData{
    const blocks=new Uint8Array(CHUNK_VOLUME),biomes=new Uint8Array(LAYER);
    const x0=cx*CS,z0=cz*CS,heights=this.heights,P=CS+4,seed=this.seed;
    for(let z=-2;z<CS+2;z++)for(let x=-2;x<CS+2;x++)heights[(x+2)+(z+2)*P]=this.heightAt(x0+x,z0+z);
    for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){
      const h=heights[(x+2)+(z+2)*P],wx=x0+x,wz=z0+z,beach=h<=SEA_LEVEL+1;
      biomes[x+z*CS]=h<SEA_LEVEL-2?OCEAN:beach?BEACH:h>=100?SNOWY:PLAINS;
      const top=beach?B.sand:h>=100?B.snowBlock:h>=90?B.stone:B.grass,under=beach?B.sand:h>=90?B.stone:B.dirt;
      for(let y=0;y<CH;y++){
        let id=AIR;
        if(y===0)id=B.bedrock;else if(y<h-3)id=B.stone;else if(y<h)id=under;else if(y===h)id=top;else if(y<=SEA_LEVEL)id=B.water;
        if(id!==AIR&&id!==B.water&&id!==B.bedrock&&y>4&&y<h-4&&this.caves.noise3(wx/30,y/18,wz/30)>.62)id=AIR;
        if(id===B.stone){
          if(hash3(wx>>1,y>>1,wz>>1,seed+11)<.03&&hash3(wx,y,wz,seed+12)<.6)id=COAL;
          else if(y<64&&hash3(wx>>1,y>>1,wz>>1,seed+13)<.02&&hash3(wx,y,wz,seed+14)<.6)id=IRON;
          else if(y<32&&hash3(wx>>1,y>>1,wz>>1,seed+15)<.008&&hash3(wx,y,wz,seed+16)<.6)id=GOLD;
          else if(y<16&&hash3(wx,y,wz,seed+17)<.0015)id=DIAMOND;
        }
        blocks[x+z*CS+y*LAYER]=id;
      }
    }
    for(let pass=0;pass<2;pass++)for(let tz=-2;tz<CS+2;tz++)for(let tx=-2;tx<CS+2;tx++){
      const h=heights[(tx+2)+(tz+2)*P],trunk=this.treeAt(x0+tx,z0+tz,h);if(!trunk)continue;
      const topY=h+trunk;
      if(pass===0){
        for(let dy=-2;dy<=1;dy++){
          const r=dy<=-1?2:1,y=topY+dy;if(y>=CH)continue;
          for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
            const x=tx+dx,z=tz+dz;if(x<0||x>=CS||z<0||z>=CS)continue;
            if(Math.abs(dx)===r&&Math.abs(dz)===r&&(dy===1||hash3(x0+x,y,z0+z,seed+3)<.5))continue;
            const i=x+z*CS+y*LAYER;if(blocks[i]===AIR)blocks[i]=B.oakLeaves;
          }
        }
      }else if(tx>=0&&tx<CS&&tz>=0&&tz<CS){
        if(blocks[tx+tz*CS+h*LAYER]===B.grass)blocks[tx+tz*CS+h*LAYER]=B.dirt;
        for(let y=h+1;y<topY&&y<CH;y++){const i=tx+tz*CS+y*LAYER;if(blocks[i]===AIR||blocks[i]===B.oakLeaves)blocks[i]=B.oakLog;}
      }
    }
    return{blocks,biomes};
  }
  private clearOfTrees(x:number,z:number){
    for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++)if(this.treeAt(x+dx,z+dz,this.heightAt(x+dx,z+dz)))return false;
    return true;
  }
  spawnPoint():Vec3{
    for(let r=0;r<400;r+=3)for(let a=0;a<Math.max(1,r);a++){
      const angle=a/Math.max(1,r)*Math.PI*2,x=Math.round(Math.cos(angle)*r),z=Math.round(Math.sin(angle)*r),h=this.heightAt(x,z);
      if(h>SEA_LEVEL+1&&h<88&&this.clearOfTrees(x,z))return{x:x+.5,y:h+1,z:z+.5};
    }
    return{x:.5,y:CH-2,z:.5};
  }
  growTree(world:BlockWriter,x:number,y:number,z:number,_kind:TreeKind,random:()=>number):boolean{
    const height=4+Math.floor(random()*3);
    for(let dy=1;dy<=height+1;dy++){const id=world.get(x,y+dy,z);if(id!==AIR&&id!==B.oakLeaves)return false;}
    for(let dy=-2;dy<=1;dy++){const r=dy<=-1?2:1;for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
      if(Math.abs(dx)===r&&Math.abs(dz)===r&&(dy===1||random()<.5))continue;
      if(world.get(x+dx,y+height+dy,z+dz)===AIR)world.set(x+dx,y+height+dy,z+dz,B.oakLeaves,'growth');}}
    for(let dy=0;dy<height;dy++)world.set(x,y+dy,z,B.oakLog,'growth');
    return true;
  }
}
export function createTerrain(seed:number):TerrainService{return new TerrainGenerator(seed);}
