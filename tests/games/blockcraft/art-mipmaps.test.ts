import {describe,expect,test} from 'vitest';
import {ATLAS_HEIGHT,ATLAS_MIP_LEVELS,ATLAS_WIDTH,atlasPixels,mipLevel,paintAtlasMipTexture} from '../../../src/games/blockcraft/art/atlas';
import {ATLAS_COLUMNS,TILE,TILE_INDEX} from '../../../src/games/blockcraft/data/blocks';

// Terrain mipmaps (vanilla Mipmap Levels 4): each 16 px tile filters on its own down to 1 px, weighted by alpha.
describe('atlas mipmaps',()=>{
  test('a 2x2 box filter weighted by alpha: transparent texels never darken their neighbours',()=>{
    const src=new Uint8Array([200,100,50,255, 0,0,0,0, 100,50,25,255, 0,0,0,0]);
    expect([...mipLevel(src,2,2)]).toEqual([150,75,38,128]);
    expect([...mipLevel(new Uint8Array(16),2,2)]).toEqual([0,0,0,0]);
  });
  test('the chain goes down to 1x1 and the level-4 texel of a tile is that tile\'s own average',()=>{
    const tex=paintAtlasMipTexture(),mips=tex.mipmaps as unknown as {data:Uint8Array;width:number;height:number}[];
    expect(mips[0].width).toBe(ATLAS_WIDTH);expect(mips.at(-1)!.width).toBe(1);expect(mips.at(-1)!.height).toBe(1);
    expect(TILE>>ATLAS_MIP_LEVELS).toBe(1);
    const atlas=atlasPixels(),level=mips[ATLAS_MIP_LEVELS];
    for(const name of ['stone','grass_block_top','water_still','oak_leaves']){
      const tile=TILE_INDEX.get(name)!,cx=tile%ATLAS_COLUMNS,cy=Math.floor(tile/ATLAS_COLUMNS);
      let r=0,a=0;
      for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){const i=((cy*TILE+y)*ATLAS_WIDTH+cx*TILE+x)*4;r+=atlas[i]*atlas[i+3];a+=atlas[i+3];}
      // Mip data is flipped for WebGL, like level 0.
      const row=ATLAS_HEIGHT/TILE-1-cy,o=(row*level.width+cx)*4;
      expect(Math.abs(level.data[o]-r/a),name).toBeLessThanOrEqual(4);
      expect(Math.abs(level.data[o+3]-a/(TILE*TILE)),name).toBeLessThanOrEqual(2);
    }
    tex.dispose();
  });
});
