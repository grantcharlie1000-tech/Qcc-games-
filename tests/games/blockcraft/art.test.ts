import {describe,expect,test} from 'vitest';
import {TILE,TILE_NAMES,TILE_ALPHA,TINTED_TILES,ATLAS_COLUMNS,ATLAS_ROWS,WOOL_COLOURS,WOOD_TYPES} from '../../../src/games/blockcraft/data/blocks';
import {PAINTERS,placeholder,paintAtlas,atlasPixels,tilePixels,paintTile,paintAtlasTexture,paintClouds,ATLAS_WIDTH,ATLAS_HEIGHT} from '../../../src/games/blockcraft/art/atlas';

type Px=Uint8ClampedArray;
const N=TILE*TILE;
const px=(name:string)=>tilePixels(name);
const at=(p:Px,x:number,y:number)=>{const i=(y*TILE+x)*4;return[p[i],p[i+1],p[i+2],p[i+3]];};
const alphaOf=(p:Px,x:number,y:number)=>p[(y*TILE+x)*4+3];
const luma=(r:number,g:number,b:number)=>.299*r+.587*g+.114*b;
/** Mean colour of the pixels (optionally only those matching `keep`). */
function mean(p:Px,keep:(x:number,y:number,c:number[])=>boolean=(x,y,c)=>c[3]>0):number[]{
  const s=[0,0,0];let n=0;
  for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){const c=at(p,x,y);if(!keep(x,y,c))continue;s[0]+=c[0];s[1]+=c[1];s[2]+=c[2];n++;}
  return n?s.map(v=>v/n):[0,0,0];
}
const dist=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function hue([r,g,b]:number[]){
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;if(!d)return 0;
  const h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;return(h*60+360)%360;
}
const saturation=([r,g,b]:number[])=>{const max=Math.max(r,g,b);return max?(max-Math.min(r,g,b))/max:0;};
const opaqueCount=(p:Px)=>{let n=0;for(let i=3;i<p.length;i+=4)if(p[i]===255)n++;return n;};
const topRow=(p:Px)=>{for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++)if(alphaOf(p,x,y))return y;return TILE;};
const same=(a:Px,b:Px)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

describe('block atlas',()=>{
  test('every tile has its own painter and none falls back to the placeholder',()=>{
    expect(TILE_NAMES.length).toBe(199);
    const missing=TILE_NAMES.filter(name=>!PAINTERS[name]);
    expect(missing).toEqual([]);
    for(const name of TILE_NAMES)expect(same(px(name),paintTile(name,placeholder(name))),name).toBe(false);
  });
  test('the atlas holds every tile in its grid cell and is deterministic',()=>{
    expect(ATLAS_WIDTH).toBe(TILE*ATLAS_COLUMNS);expect(ATLAS_HEIGHT).toBe(TILE*ATLAS_ROWS);
    const atlas=atlasPixels();expect(atlas.length).toBe(ATLAS_WIDTH*ATLAS_HEIGHT*4);
    expect(same(paintAtlas(),atlas)).toBe(true);
    TILE_NAMES.forEach((name,tile)=>{
      const p=px(name),ox=(tile%ATLAS_COLUMNS)*TILE,oy=Math.floor(tile/ATLAS_COLUMNS)*TILE;
      for(const [x,y] of [[0,0],[15,0],[7,9],[15,15]]){
        const i=((oy+y)*ATLAS_WIDTH+ox+x)*4;expect(at(p,x,y)).toEqual([atlas[i],atlas[i+1],atlas[i+2],atlas[i+3]]);
      }
      expect(same(paintTile(name),p)).toBe(true);
    });
    expect(px('no_such_tile').every(v=>v===0)).toBe(true);
  });
  test('the GPU texture flips rows for WebGL and filters with nearest pixels',()=>{
    const texture=paintAtlasTexture(),data=texture.image.data as Uint8Array,atlas=atlasPixels(),row=ATLAS_WIDTH*4;
    expect([texture.image.width,texture.image.height]).toEqual([ATLAS_WIDTH,ATLAS_HEIGHT]);
    expect(Array.from(data.subarray(0,row))).toEqual(Array.from(atlas.subarray((ATLAS_HEIGHT-1)*row)));
    texture.dispose();
  });
  test('painting the whole atlas is quick',()=>{
    const start=performance.now();paintAtlas();expect(performance.now()-start).toBeLessThan(400);
  });
  test('every tile is distinct',()=>{
    const seen=new Map<string,string>();
    for(const name of TILE_NAMES){const key=Array.from(px(name)).join(',');expect(seen.get(key),`${name} duplicates ${seen.get(key)}`).toBeUndefined();seen.set(key,name);}
  });
});

describe('transparency follows TILE_ALPHA',()=>{
  test('opaque tiles are fully opaque',()=>{
    for(const name of TILE_NAMES)if(TILE_ALPHA.get(name)==='opaque')expect(opaqueCount(px(name)),name).toBe(N);
  });
  test('cutout tiles use only alpha 0 and 255, with a transparent background and a painted shape',()=>{
    for(const name of TILE_NAMES){
      if(TILE_ALPHA.get(name)!=='cutout')continue;
      const p=px(name),alphas=new Set<number>();for(let i=3;i<p.length;i+=4)alphas.add(p[i]);
      expect([...alphas].filter(a=>a!==0&&a!==255),name).toEqual([]);
      expect(alphas.has(0),`${name} has transparency`).toBe(true);expect(alphas.has(255),`${name} has a shape`).toBe(true);
    }
  });
  test('translucent tiles are semi-transparent everywhere',()=>{
    for(const name of TILE_NAMES){
      if(TILE_ALPHA.get(name)!=='translucent')continue;
      const p=px(name);let sum=0;
      for(let i=3;i<p.length;i+=4){expect(p[i],name).toBeGreaterThanOrEqual(64);expect(p[i],name).toBeLessThanOrEqual(240);sum+=p[i];}
      expect(sum/N).toBeGreaterThan(120);expect(sum/N).toBeLessThan(225);
    }
  });
});

describe('biome tinting',()=>{
  test('tinted tiles are painted grey and bright enough to carry the tint',()=>{
    expect([...TINTED_TILES].sort()).toEqual(['acacia_leaves','dark_oak_leaves','fern','grass_block_side_overlay','grass_block_top','jungle_leaves',
      'lily_pad','oak_leaves','short_grass','sugar_cane','water_flow','water_still']);
    for(const name of TINTED_TILES){
      const p=px(name);
      for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){const c=at(p,x,y);if(c[3])expect(saturation(c),`${name} ${x},${y}`).toBeLessThanOrEqual(.08);}
      expect(luma(...mean(p) as [number,number,number]),name).toBeGreaterThan(95);
    }
  });
  test('birch, spruce and cherry leaves, moss and the grass block side are pre-coloured',()=>{
    for(const name of ['birch_leaves','spruce_leaves','moss_block']){const c=mean(px(name));expect(c[1],name).toBeGreaterThan(c[0]);expect(saturation(c),name).toBeGreaterThan(.2);}
    const cherry=mean(px('cherry_leaves'));expect(cherry[0]).toBeGreaterThan(cherry[1]+30);expect(cherry[2]).toBeGreaterThan(cherry[1]);
    const side=px('grass_block_side'),band=mean(side,(x,y)=>y<2),soil=mean(side,(x,y)=>y>8);
    expect(band[1]).toBeGreaterThan(band[0]+20);expect(soil[0]).toBeGreaterThan(soil[1]);expect(soil[1]).toBeGreaterThan(soil[2]);
  });
  test('the grass side overlay covers exactly the green band of the grass block side',()=>{
    const side=px('grass_block_side'),overlay=px('grass_block_side_overlay');
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){const c=at(side,x,y),green=c[1]>c[0]+8;expect(alphaOf(overlay,x,y)===255,`${x},${y}`).toBe(green);}
    expect(opaqueCount(overlay)).toBeGreaterThan(40);
    const snow=px('grass_block_snow'),top=mean(snow,(x,y)=>y<2);expect(Math.min(...top)).toBeGreaterThan(200);
  });
});

describe('tile groups',()=>{
  test('ores carry distinct colours on their stone or deepslate base',()=>{
    const ores=['coal','iron','copper','gold','redstone','lapis','diamond','emerald'];
    const oreColour=(name:string,base:string)=>{const p=px(name),b=px(base);return mean(p,(x,y)=>{const i=(y*TILE+x)*4;return Math.abs(p[i]-b[i])+Math.abs(p[i+1]-b[i+1])+Math.abs(p[i+2]-b[i+2])>30;});};
    const stoneOres=ores.map(o=>oreColour(`${o}_ore`,'stone')),deepOres=ores.filter(o=>o!=='emerald').map(o=>oreColour(`deepslate_${o}_ore`,'deepslate'));
    for(const set of [stoneOres,deepOres])for(let i=0;i<set.length;i++)for(let j=i+1;j<set.length;j++)expect(dist(set[i],set[j]),`${i} vs ${j}`).toBeGreaterThan(40);
    // The ore base is the plain stone tile, so ores sit seamlessly next to stone.
    for(const o of ores){
      const p=px(`${o}_ore`),s=px('stone');let shared=0;for(let i=0;i<p.length;i+=4)if(p[i]===s[i]&&p[i+1]===s[i+1]&&p[i+2]===s[i+2])shared++;
      expect(shared/N,o).toBeGreaterThan(.55);expect(shared/N,o).toBeLessThan(.9);
    }
  });
  test('deepslate is dark with vertical grain and a distinct top',()=>{
    const deep=px('deepslate'),stone=px('stone');
    expect(luma(...mean(deep) as [number,number,number])).toBeLessThan(.8*luma(...mean(stone) as [number,number,number]));
    let vertical=0,horizontal=0;
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){const c=at(deep,x,y),r=at(deep,(x+1)%TILE,y),d=at(deep,x,(y+1)%TILE);horizontal+=Math.abs(c[0]-r[0]);vertical+=Math.abs(c[0]-d[0]);}
    expect(vertical).toBeLessThan(horizontal*.75);
    expect(dist(mean(px('deepslate_top')),mean(deep))).toBeLessThan(30);expect(same(px('deepslate_top'),deep)).toBe(false);
  });
  test('wool comes in 16 distinct colours',()=>{
    const colours=WOOL_COLOURS.map(c=>mean(px(`${c}_wool`)));
    for(let i=0;i<colours.length;i++)for(let j=i+1;j<colours.length;j++)expect(dist(colours[i],colours[j]),`${WOOL_COLOURS[i]} vs ${WOOL_COLOURS[j]}`).toBeGreaterThan(25);
    expect(luma(...colours[0] as [number,number,number])).toBeGreaterThan(200);expect(luma(...colours[15] as [number,number,number])).toBeLessThan(45);
  });
  test('copper oxidises from orange to teal',()=>{
    const stages=['copper_block','exposed_copper','weathered_copper','oxidized_copper'].map(n=>mean(px(n)));
    expect(hue(stages[0])).toBeLessThan(35);expect(hue(stages[3])).toBeGreaterThan(145);expect(hue(stages[3])).toBeLessThan(190);
    for(let i=1;i<4;i++)expect(stages[i][1]-stages[i][0]).toBeGreaterThan(stages[i-1][1]-stages[i-1][0]);
  });
  test('every wood type has its own bark, rings, planks and sapling',()=>{
    for(const part of ['log','log_top','planks','sapling']){
      const colours=WOOD_TYPES.map(w=>mean(px(`${w}_${part}`)));
      for(let i=0;i<colours.length;i++)for(let j=i+1;j<colours.length;j++)expect(dist(colours[i],colours[j]),`${part} ${WOOD_TYPES[i]} vs ${WOOD_TYPES[j]}`).toBeGreaterThan(8);
    }
    const ring=px('oak_log_top');expect(dist(at(ring,0,8),at(ring,8,8))).toBeGreaterThan(20);
    const cherry=mean(px('cherry_planks'));expect(cherry[0]).toBeGreaterThan(cherry[1]);expect(cherry[2]).toBeGreaterThan(cherry[1]*.8);
  });
  test('water is grey and semi-transparent; lava is bright orange with darker veins',()=>{
    for(const name of ['water_still','water_flow']){const p=px(name);expect(TILE_ALPHA.get(name)).toBe('translucent');expect(saturation(mean(p))).toBeLessThan(.05);}
    for(const name of ['lava_still','lava_flow']){
      const p=px(name),c=mean(p);expect(c[0]).toBeGreaterThan(200);expect(c[1]).toBeGreaterThan(70);expect(c[1]).toBeLessThan(170);expect(c[2]).toBeLessThan(80);
      let dark=0;for(let i=0;i<p.length;i+=4)if(luma(p[i],p[i+1],p[i+2])<.7*luma(c[0],c[1],c[2]))dark++;
      expect(dark,name).toBeGreaterThan(8);
    }
  });
  test('glass has a solid frame and a clear centre',()=>{
    const p=px('glass');
    for(let i=0;i<TILE;i++)for(const [x,y] of [[i,0],[i,15],[0,i],[15,i]])expect(alphaOf(p,x,y),`${x},${y}`).toBe(255);
    let clear=0;for(let y=2;y<14;y++)for(let x=2;x<14;x++)if(!alphaOf(p,x,y))clear++;
    expect(clear/144).toBeGreaterThan(.8);
  });
  test('the furnace front lights up when burning',()=>{
    const warm=(p:Px)=>{let n=0;for(let i=0;i<p.length;i+=4)if(p[i]>200&&p[i+1]>100&&p[i+2]<90)n++;return n;};
    expect(warm(px('furnace_front'))).toBe(0);expect(warm(px('furnace_front_on'))).toBeGreaterThan(12);
  });
  test('crops grow taller with each stage and wheat ripens to gold',()=>{
    for(const [crop,stages] of [['wheat',8],['carrots',4],['potatoes',4]] as const){
      const tops=Array.from({length:stages},(_,s)=>topRow(px(`${crop}_stage${s}`)));
      for(let s=1;s<stages;s++)expect(tops[s],`${crop} ${s}`).toBeLessThan(tops[s-1]);
      expect(tops[0]).toBeGreaterThanOrEqual(10);expect(tops[stages-1]).toBeLessThanOrEqual(3);
    }
    const ripe=mean(px('wheat_stage7')),young=mean(px('wheat_stage3'));
    expect(ripe[0]).toBeGreaterThan(ripe[1]*.9);expect(young[1]).toBeGreaterThan(young[0]*1.2);
    const carrot=px('carrots_stage3');let orange=0;for(let i=0;i<carrot.length;i+=4)if(carrot[i+3]&&carrot[i]>180&&carrot[i+1]<150&&carrot[i+2]<80)orange++;
    expect(orange).toBeGreaterThan(3);
  });
  test('destroy stages are crack overlays that only grow',()=>{
    let previous:Px|null=null,previousCount=0;
    for(let s=0;s<10;s++){
      const p=px(`destroy_stage_${s}`),count=opaqueCount(p);
      expect(count,`stage ${s}`).toBeGreaterThan(previousCount);
      for(let i=0;i<N;i++){
        if(p[i*4+3])expect(luma(p[i*4],p[i*4+1],p[i*4+2])).toBeLessThan(100);
        if(previous&&previous[i*4+3])expect(p[i*4+3],`stage ${s} keeps crack pixel ${i}`).toBe(255);
      }
      previous=p;previousCount=count;
    }
    expect(opaqueCount(px('destroy_stage_0'))).toBeLessThan(20);expect(previousCount).toBeGreaterThan(70);expect(previousCount).toBeLessThan(N*.6);
  });
});

describe('shaped tiles',()=>{
  test('the torch is a 2×10 px stick with a glowing tip',()=>{
    const p=px('torch');
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++)expect(alphaOf(p,x,y)===255,`${x},${y}`).toBe(x>=7&&x<=8&&y>=6);
    expect(luma(...at(p,7,6).slice(0,3) as [number,number,number])).toBeGreaterThan(luma(...at(p,7,13).slice(0,3) as [number,number,number])+60);
  });
  test('the lantern follows the lantern model layout: body, top, cap and handle',()=>{
    const p=px('lantern'),filled=(x0:number,y0:number,x1:number,y1:number)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(alphaOf(p,x,y)!==255)return false;return true;};
    expect(filled(0,2,6,9)).toBe(true);expect(filled(0,9,6,15)).toBe(true);expect(filled(1,0,5,2)).toBe(true);
    expect(alphaOf(p,12,1)+alphaOf(p,12,10)).toBeGreaterThan(0);
    expect(alphaOf(p,8,6)).toBe(0);expect(alphaOf(p,15,15)).toBe(0);
    const glow=mean(p,(x,y)=>x>=1&&x<=4&&y>=3&&y<=7);expect(glow[0]).toBeGreaterThan(200);expect(glow[2]).toBeLessThan(150);
  });
  test('fire is a cutout of flames rising from the base',()=>{
    const p=px('fire');let low=0,high=0;
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++)if(alphaOf(p,x,y))y>=8?low++:high++;
    expect(low).toBeGreaterThan(high);expect(low).toBeGreaterThan(80);expect(high).toBeGreaterThan(10);
  });
  test('the ladder has continuous rails and gaps between rungs',()=>{
    const p=px('ladder');let rails=0;
    for(let x=0;x<TILE;x++){let full=true;for(let y=0;y<TILE;y++)if(!alphaOf(p,x,y))full=false;if(full)rails++;}
    expect(rails).toBeGreaterThanOrEqual(4);let clear=0;for(let y=0;y<TILE;y++)if(!alphaOf(p,8,y))clear++;expect(clear).toBeGreaterThan(6);
  });
  test('door halves have a solid frame and window panes',()=>{
    for(const name of ['oak_door_top','oak_door_bottom']){
      const p=px(name);for(let y=0;y<TILE;y++){expect(alphaOf(p,0,y)).toBe(255);expect(alphaOf(p,15,y)).toBe(255);}
      let windows=0;for(let y=1;y<15;y++)for(let x=2;x<14;x++)if(!alphaOf(p,x,y))windows++;
      expect(windows,name).toBeGreaterThan(name.endsWith('top')?30:4);
    }
  });
  test('plants and saplings stand on the bottom row',()=>{
    for(const name of ['oak_sapling','dandelion','poppy','short_grass','fern','dead_bush','brown_mushroom','red_mushroom','blue_orchid','allium','cornflower','oxeye_daisy']){
      const p=px(name);let base=0;for(let x=0;x<TILE;x++)if(alphaOf(p,x,15))base++;
      expect(base,name).toBeGreaterThan(0);expect(alphaOf(p,0,0)+alphaOf(p,15,0),name).toBe(0);
    }
  });
});

describe('clouds',()=>{
  test('the cloud mask is binary, tiles and covers part of the sky',()=>{
    for(const size of [32,64]){
      const c=paintClouds(size);expect(c.length).toBe(size*size*4);
      let cover=0;const alphas=new Set<number>();
      for(let i=0;i<size*size;i++){alphas.add(c[i*4+3]);if(c[i*4+3])cover++;expect(c[i*4]).toBe(255);}
      expect(alphas.size).toBe(2);expect(cover/(size*size)).toBeGreaterThan(.2);expect(cover/(size*size)).toBeLessThan(.6);
    }
  });
});
