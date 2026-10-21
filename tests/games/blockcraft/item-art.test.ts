import {inflateSync} from 'node:zlib';
import {describe,expect,test} from 'vitest';
import {ITEMS,ITEM_SPRITES,MOB_KINDS,itemDef} from '../../../src/games/blockcraft/data/items';
import {BLOCK_BY_NAME,TILE,WOOL_COLOURS,type BlockDef} from '../../../src/games/blockcraft/data/blocks';
import {BIOME_BY_NAME} from '../../../src/games/blockcraft/data/biomes';
import {tilePixels} from '../../../src/games/blockcraft/art/atlas';
import {ICON_SIZE,SPRITE_NAMES,SPRITE_PAINTERS,hasSprite,spritePixels,iconPixels,iconUrl} from '../../../src/games/blockcraft/art/items';
import {renderBlockIcon,FACE_SHADE,ICON_TINTS} from '../../../src/games/blockcraft/art/sprites-blocks';
import {encodePng,pngDataUrl} from '../../../src/games/blockcraft/art/sprites-png';
import {SPAWN_EGG_COLOURS} from '../../../src/games/blockcraft/art/sprites-misc';
import {DYE_COLOURS} from '../../../src/games/blockcraft/art/sprites-materials';

type Px=Uint8ClampedArray;
const S=TILE;
const luma=(c:ArrayLike<number>)=>.299*c[0]+.587*c[1]+.114*c[2];
const rgbAt=(p:Px,size:number,x:number,y:number)=>{const i=(y*size+x)*4;return[p[i],p[i+1],p[i+2],p[i+3]];};
const hex=(n:number)=>[n>>16&255,n>>8&255,n&255];
const hexOf=(c:ArrayLike<number>)=>(c[0]<<16|c[1]<<8|c[2]);
const opaque=(p:Px)=>{let n=0;for(let i=3;i<p.length;i+=4)if(p[i])n++;return n;};
const mask=(p:Px)=>Array.from({length:p.length/4},(_,i)=>p[i*4+3]?1:0).join('');
const colours=(p:Px)=>{const set=new Set<number>();for(let i=0;i<p.length;i+=4)if(p[i+3])set.add(hexOf(p.subarray(i,i+3)));return set;};
const key=(p:Px)=>Array.from(p).join(',');
/** Mean colour of the opaque pixels that pass `keep`. */
function mean(p:Px,size:number,keep:(x:number,y:number)=>boolean=()=>true){
  const s=[0,0,0];let n=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const c=rgbAt(p,size,x,y);if(!c[3]||!keep(x,y))continue;s[0]+=c[0];s[1]+=c[1];s[2]+=c[2];n++;}
  return n?s.map(v=>v/n):[0,0,0];
}
/** Opaque pixels touching a transparent pixel or the border (the outline) and the rest (the interior). */
function rings(p:Px){
  const edge:number[][]=[],inner:number[][]=[],a=(x:number,y:number)=>x<0||y<0||x>=S||y>=S?0:p[(y*S+x)*4+3];
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    if(!a(x,y))continue;const c=rgbAt(p,S,x,y);
    (a(x-1,y)&&a(x+1,y)&&a(x,y-1)&&a(x,y+1)?inner:edge).push(c);
  }
  return{edge,inner};
}
const avgLuma=(list:number[][])=>list.reduce((s,c)=>s+luma(c),0)/Math.max(1,list.length);

describe('item sprites',()=>{
  test('every ITEM_SPRITES name has its own painter (no placeholder fallback)',()=>{
    expect(ITEM_SPRITES.length).toBeGreaterThanOrEqual(148);
    for(const name of ['shield','compass','clock','oak_door','red_bed',...MOB_KINDS.map(m=>`${m}_spawn_egg`)])expect(ITEM_SPRITES).toContain(name);
    expect(SPRITE_NAMES).toBe(ITEM_SPRITES);
    for(const name of ITEM_SPRITES){expect(hasSprite(name),name).toBe(true);expect(typeof SPRITE_PAINTERS[name],name).toBe('function');}
    expect(hasSprite('no_such_item')).toBe(false);
  });
  test('sprites are 16×16 pixel art: hard alpha, transparent background, several colours',()=>{
    for(const name of ITEM_SPRITES){
      const p=spritePixels(name),n=opaque(p);
      expect(p.length,name).toBe(S*S*4);
      for(let i=3;i<p.length;i+=4)expect(p[i]===0||p[i]===255,`${name} alpha`).toBe(true);
      for(let i=0;i<p.length;i+=4)if(!p[i+3])expect(p[i]+p[i+1]+p[i+2],`${name} transparent pixels are cleared`).toBe(0);
      expect(n,`${name} has a body`).toBeGreaterThanOrEqual(14);
      expect(n,`${name} has a transparent background`).toBeLessThanOrEqual(S*S-40);
      expect(colours(p).size,`${name} is shaded`).toBeGreaterThanOrEqual(3);
      // The stub placeholder was a flat diamond: |x-7.5|+|y-7.5|<7.
      const diamond=Array.from({length:S*S},(_,i)=>Math.abs(i%S-7.5)+Math.abs((i/S|0)-7.5)<7?1:0).join('');
      expect(mask(p)===diamond,`${name} is not the placeholder`).toBe(false);
    }
  });
  test('sprites carry a vanilla-like outline darker than their interior',()=>{
    for(const name of ITEM_SPRITES){
      const {edge,inner}=rings(spritePixels(name));
      if(inner.length<6)continue;
      expect(avgLuma(edge),name).toBeLessThan(avgLuma(inner));
    }
  });
  test('every sprite is a distinct image',()=>{
    const seen=new Map<string,string>();
    for(const name of ITEM_SPRITES){const k=key(spritePixels(name));expect(seen.get(k),`${name} duplicates ${seen.get(k)}`).toBeUndefined();seen.set(k,name);}
  });
  test('sprite pixels are cached and unknown names are transparent',()=>{
    expect(spritePixels('diamond_sword')).toBe(spritePixels('diamond_sword'));
    const none=spritePixels('no_such_item');expect(none.length).toBe(S*S*4);expect(opaque(none)).toBe(0);
  });
  test('tools share one silhouette per kind and use the tier palettes',()=>{
    const tierHue:Record<string,(c:number[])=>boolean>={
      diamond:([r,g,b])=>b>r+40&&g>r+40,golden:([r,g,b])=>r>b+60&&g>b+40,iron:([r,g,b])=>Math.abs(r-g)<16&&Math.abs(g-b)<16&&r>150,
      stone:([r,g,b])=>Math.abs(r-g)<16&&Math.abs(g-b)<16&&r>70&&r<170,wooden:([r,g,b])=>r>g&&g>b&&r-b>40};
    for(const kind of ['sword','pickaxe','axe','shovel','hoe']){
      const masks=new Set(['wooden','stone','iron','golden','diamond'].map(t=>mask(spritePixels(`${t}_${kind}`))));
      expect(masks.size,kind).toBe(1);
      for(const [tier,ok] of Object.entries(tierHue)){
        const p=spritePixels(`${tier}_${kind}`);
        // The head (top-right quarter) is the tier material; the handle (bottom-left) is wood.
        let head=0;for(let y=0;y<8;y++)for(let x=8;x<S;x++){const c=rgbAt(p,S,x,y);if(c[3]&&ok(c))head++;}
        expect(head,`${tier}_${kind} head colour`).toBeGreaterThanOrEqual(6);
        const handle=mean(p,S,(x,y)=>x<6&&y>=10);
        if(tier!=='wooden')expect(handle[0]>handle[2]+20,`${tier}_${kind} wooden handle`).toBe(true);
      }
    }
  });
  test('armour pieces share a silhouette per piece across materials',()=>{
    for(const piece of ['helmet','chestplate','leggings','boots']){
      const masks=new Set(['leather','golden','iron','diamond'].map(m=>mask(spritePixels(`${m}_${piece}`))));
      expect(masks.size,piece).toBe(1);
    }
    const [r,g,b]=mean(spritePixels('leather_chestplate'),S);expect(r>g&&g>b,'leather is brown').toBe(true);
    const d=mean(spritePixels('diamond_chestplate'),S);expect(d[2]>d[0]+40,'diamond is cyan').toBe(true);
  });
  test('16 dyes share one shape and show their vanilla dye colours',()=>{
    expect(Object.keys(DYE_COLOURS)).toEqual([...WOOL_COLOURS]);
    expect(new Set(WOOL_COLOURS.map(c=>mask(spritePixels(`${c}_dye`)))).size).toBe(1);
    for(const c of WOOL_COLOURS)expect(colours(spritePixels(`${c}_dye`)).has(DYE_COLOURS[c]),c).toBe(true);
  });
  test('a spawn egg for every mob kind: one egg shape speckled in the vanilla colour pair',()=>{
    expect(Object.keys(SPAWN_EGG_COLOURS).sort()).toEqual([...MOB_KINDS].sort());
    expect(SPAWN_EGG_COLOURS.creeper).toEqual([0x0da70b,0x000000]);expect(SPAWN_EGG_COLOURS.pig).toEqual([0xf0a5a2,0xdb635f]);
    const masks=new Set(MOB_KINDS.map(m=>mask(spritePixels(`${m}_spawn_egg`))));expect(masks.size).toBe(1);
    for(const mob of MOB_KINDS){
      const p=spritePixels(`${mob}_spawn_egg`),set=colours(p),[base,spots]=SPAWN_EGG_COLOURS[mob];
      expect(itemDef(`${mob}_spawn_egg`)?.spawns).toBe(mob);
      expect(set.has(base),`${mob} base`).toBe(true);expect(set.has(spots),`${mob} spots`).toBe(true);
      let spotCount=0;for(let i=0;i<p.length;i+=4)if(p[i+3]&&hexOf(p.subarray(i,i+3))===spots)spotCount++;
      expect(spotCount,`${mob} speckles`).toBeGreaterThanOrEqual(6);
    }
  });
  test('buckets share the pail and show their contents',()=>{
    const pail=mask(spritePixels('bucket'));
    for(const id of ['water_bucket','lava_bucket','milk_bucket'])expect(mask(spritePixels(id)),id).toBe(pail);
    const inside=(id:string)=>mean(spritePixels(id),S,(x,y)=>y>=2&&y<=5&&x>=4&&x<=11);
    const [wr,,wb]=inside('water_bucket');expect(wb).toBeGreaterThan(wr+60);
    const [lr,lg,lb]=inside('lava_bucket');expect(lr).toBeGreaterThan(lb+100);expect(lr).toBeGreaterThan(lg);
    expect(luma(inside('milk_bucket'))).toBeGreaterThan(luma(inside('bucket'))+30);
  });
  test('colour cues match the vanilla items',()=>{
    const m=(id:string)=>mean(spritePixels(id),S);
    const isRed=([r,g,b]:number[])=>r>g+50&&r>b+50,isGreen=([r,g,b]:number[])=>g>r+20&&g>b+10;
    expect(isRed(m('apple')),'apple').toBe(true);expect(isRed(m('redstone')),'redstone').toBe(true);
    expect(isGreen(m('emerald')),'emerald').toBe(true);expect(isGreen(m('slime_ball')),'slime').toBe(true);
    const [dr,dg,db]=m('diamond');expect(db>dr+50&&dg>dr+50,'diamond cyan').toBe(true);
    const [lr,lg,lb]=m('lapis_lazuli');expect(lb>lr+40&&lb>lg+20,'lapis blue').toBe(true);
    const [gr,gg,gb]=m('gold_ingot');expect(gr>gb+80&&gg>gb+50,'gold yellow').toBe(true);
    expect(luma(m('coal'))).toBeLessThan(80);expect(luma(m('snowball'))).toBeGreaterThan(200);
    const [cr,cg,cb]=m('carrot');expect(cr>cb+80&&cr>cg,'carrot orange').toBe(true);
  });
});

describe('item icons',()=>{
  const ids=[...ITEMS.keys()];
  test('every item has an icon with a transparent background',()=>{
    for(const id of ids){
      const p=iconPixels(id);expect(p.length,id).toBe(ICON_SIZE*ICON_SIZE*4);
      expect(opaque(p),id).toBeGreaterThan(40);
      // Flat block tiles (plants, torch, ladder) show the atlas tile as painted by the block art; sprites and cubes
      // always leave the corners and a good share of the slot transparent.
      if(itemDef(id)?.icon.kind==='tile')continue;
      expect(opaque(p),id).toBeLessThan(ICON_SIZE*ICON_SIZE*.9);
      expect(rgbAt(p,ICON_SIZE,0,0)[3],`${id} corner`).toBe(0);
      expect(rgbAt(p,ICON_SIZE,ICON_SIZE-1,ICON_SIZE-1)[3],`${id} corner`).toBe(0);
    }
  });
  test('icon generation produces distinct images',()=>{
    const seen=new Map<string,string>();
    for(const id of ids){const k=key(iconPixels(id));expect(seen.get(k),`${id} duplicates ${seen.get(k)}`).toBeUndefined();seen.set(k,id);}
  });
  test('sprite icons are the sprite scaled up with nearest neighbour',()=>{
    const p=iconPixels('diamond_sword'),s=spritePixels('diamond_sword'),k=ICON_SIZE/S;
    for(let y=0;y<ICON_SIZE;y++)for(let x=0;x<ICON_SIZE;x++)expect(rgbAt(p,ICON_SIZE,x,y)).toEqual(rgbAt(s,S,x/k|0,y/k|0));
  });
  test('flat tile icons use the block tile, tinted by the plains colour when the tile is tinted',()=>{
    const k=ICON_SIZE/S,sap=iconPixels('oak_sapling'),tile=tilePixels('oak_sapling');
    for(let y=0;y<ICON_SIZE;y+=3)for(let x=0;x<ICON_SIZE;x+=3)expect(rgbAt(sap,ICON_SIZE,x,y)).toEqual(rgbAt(tile,S,x/k|0,y/k|0));
    const grass=iconPixels('short_grass'),raw=tilePixels('short_grass'),tint=hex(BIOME_BY_NAME.get('plains')!.grass);
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){
      const t=rgbAt(raw,S,x,y);if(!t[3])continue;
      expect(rgbAt(grass,ICON_SIZE,x*k,y*k).slice(0,3)).toEqual(t.slice(0,3).map((v,i)=>Math.round(v*tint[i]/255)));
    }
  });
  test('the lantern icon is a painted lantern, not the model UV sheet',()=>{
    expect(hasSprite('lantern')).toBe(true);
    const p=iconPixels('lantern'),s=spritePixels('lantern'),k=ICON_SIZE/S;
    expect(rgbAt(p,ICON_SIZE,8*k,8*k)).toEqual(rgbAt(s,S,8,8));
  });
  test('data URLs are PNGs, cached per item, and work without a DOM',()=>{
    const url=iconUrl('stone');
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(iconUrl('stone')).toBe(url);
    expect(iconUrl('no_such_item').startsWith('data:image/png;base64,')).toBe(true);
    expect(iconUrl('stone')).not.toBe(iconUrl('cobblestone'));
  });
});

describe('isometric block icons',()=>{
  const N=ICON_SIZE,def=(name:string)=>BLOCK_BY_NAME.get(name)!;
  /** A synthetic tile source: solid colour per tile name, or a hollow frame for 'frame'. */
  const flat=(rgb:number[],hollow=false)=>{const p=new Uint8ClampedArray(S*S*4);for(let i=0;i<S*S;i++){const x=i%S,y=i/S|0,edge=x<2||y<2||x>13||y>13;
    if(hollow&&!edge)continue;p[i*4]=rgb[0];p[i*4+1]=rgb[1];p[i*4+2]=rgb[2];p[i*4+3]=255;}return p;};
  const grey=()=>flat([200,200,200]);
  const firstRow=(p:Px)=>{for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(p[(y*N+x)*4+3])return y;return N;};
  const lastRow=(p:Px)=>{for(let y=N-1;y>=0;y--)for(let x=0;x<N;x++)if(p[(y*N+x)*4+3])return y;return -1;};
  const cols=(p:Px)=>{let a=N,b=-1;for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(p[(y*N+x)*4+3]){a=Math.min(a,x);b=Math.max(b,x);}return[a,b];};
  // Regions: the top rhombus around (N/2, N/4), the left face around (N/4, 0.6N), the right face around (3N/4, 0.6N).
  const top=(x:number,y:number)=>Math.abs(x-N/2)<N/8&&Math.abs(y-N/4)<N/16;
  const left=(x:number,y:number)=>Math.abs(x-N/4)<N/16&&Math.abs(y-.62*N)<N/16;
  const right=(x:number,y:number)=>Math.abs(x-.75*N)<N/16&&Math.abs(y-.62*N)<N/16;

  test('a cube fills the vanilla GUI projection: hexagon, top lit, left 80 %, right 60 %',()=>{
    const p=renderBlockIcon(def('stone'),N,grey);
    expect(firstRow(p)).toBeLessThanOrEqual(1);expect(lastRow(p)).toBeGreaterThanOrEqual(N-2);
    const [x0,x1]=cols(p);expect(x0).toBeGreaterThanOrEqual(2);expect(x1).toBeLessThanOrEqual(N-3);expect(x1-x0).toBeGreaterThan(.84*N);
    expect(rgbAt(p,N,0,0)[3]).toBe(0);expect(rgbAt(p,N,N-1,0)[3]).toBe(0);expect(rgbAt(p,N,N/2,N/2)[3]).toBe(255);
    expect(mean(p,N,top)[0]).toBeCloseTo(200*FACE_SHADE.top,-1);
    expect(mean(p,N,left)[0]).toBeCloseTo(200*FACE_SHADE.left,-1);
    expect(mean(p,N,right)[0]).toBeCloseTo(200*FACE_SHADE.right,-1);
    expect(FACE_SHADE.top).toBeGreaterThan(FACE_SHADE.left);expect(FACE_SHADE.left).toBeGreaterThan(FACE_SHADE.right);
  });
  test('faces show top (+y), left (+z, south) and right (+x, east) tiles: furnace front on the left',()=>{
    const colour:Record<string,number[]>={furnace_top:[250,0,0],furnace_front:[0,250,0],furnace_side:[0,0,250]};
    const p=renderBlockIcon(def('furnace_south'),N,name=>flat(colour[name]??[255,255,255]));
    const t=mean(p,N,top),l=mean(p,N,left),r=mean(p,N,right);
    expect(t[0]).toBeGreaterThan(200);expect(l[1]).toBeGreaterThan(150);expect(l[0]).toBe(0);expect(r[2]).toBeGreaterThan(100);expect(r[1]).toBe(0);
  });
  test('top tiles have north at the back corner and side tiles keep their top row up',()=>{
    // A tile whose top-left pixel quadrant is red, the rest white.
    const quad=()=>{const p=flat([255,255,255]);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=(y*S+x)*4;p[i+1]=0;p[i+2]=0;}return p;};
    const p=renderBlockIcon(def('stone'),N,quad);
    // North-west of the top face is the top vertex of the hexagon: red there.
    const c=rgbAt(p,N,N/2,4);expect(c[0]).toBeGreaterThan(150);expect(c[1]).toBe(0);
    // South face (left): its top-left (west, top) is the hexagon's left corner area at the top of the face.
    const l=rgbAt(p,N,5,N/4+6);expect(l[1]).toBe(0);
    // East face (right): its top-left (south) is next to the front edge.
    const r=rgbAt(p,N,N/2+4,N/2+6);expect(r[1]).toBe(0);
  });
  test('tinted faces get the plains colour: grass block top and oak leaves, but not birch leaves or grass sides',()=>{
    const plains=BIOME_BY_NAME.get('plains')!,g=hex(plains.grass),f=hex(plains.foliage);
    expect(ICON_TINTS).toEqual({grass:plains.grass,foliage:plains.foliage,water:plains.water});
    const grass=renderBlockIcon(def('grass_block'),N,grey);
    const t=mean(grass,N,top);expect(t[0]).toBeCloseTo(200*g[0]/255*FACE_SHADE.top,-1);expect(t[1]).toBeCloseTo(200*g[1]/255*FACE_SHADE.top,-1);
    expect(mean(grass,N,left)[0]).toBeCloseTo(200*FACE_SHADE.left,-1);
    const oak=renderBlockIcon(def('oak_leaves'),N,grey);expect(mean(oak,N,left)[1]).toBeCloseTo(200*f[1]/255*FACE_SHADE.left,-1);
    const birch=renderBlockIcon(def('birch_leaves'),N,grey);expect(mean(birch,N,left)[1]).toBeCloseTo(200*FACE_SHADE.left,-1);
  });
  test('cutout tiles are respected: a glass-like frame shows only its front faces, the slot through its holes',()=>{
    // Vanilla draws block items with back faces culled, so a glass icon is the three front faces' frames only.
    const p=renderBlockIcon(def('glass'),N,()=>flat([180,220,230],true));
    let holes=0,frame=0;
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const c=rgbAt(p,N,x,y),inside=Math.abs(x-N/2)<N/4&&Math.abs(y-N/2)<N/4;
      if(!inside)continue;if(!c[3])holes++;else frame++;
    }
    expect(holes).toBeGreaterThan(N*N/8);expect(frame).toBeGreaterThan(20);
    // Every drawn pixel is a front face (top, left or right shade): no far face shows through.
    const front=[FACE_SHADE.top,FACE_SHADE.left,FACE_SHADE.right].map(s=>Math.round(180*s));
    for(let i=0;i<p.length;i+=4)if(p[i+3])expect(front.some(v=>Math.abs(p[i]-v)<=1),`pixel ${i/4} red ${p[i]}`).toBe(true);
    // The middles of the top, left and right faces are holes (the far edges behind them are culled).
    for(const [x,y] of [[N/2,N/4],[N/4,40],[.75*N,40]])expect(rgbAt(p,N,x,y)[3],`hole at ${x},${y}`).toBe(0);
  });
  test('translucent tiles blend: ice coverage is the tile alpha (one front face, slot shows through)',()=>{
    const p=renderBlockIcon(def('ice'),N,()=>{const t=flat([150,190,255]);for(let i=3;i<t.length;i+=4)t[i]=140;return t;});
    for(const [x,y] of [[N/2,N/4],[N/4,40],[.75*N,40],[N/2,N/2]]){
      const c=rgbAt(p,N,x,y);expect(Math.abs(c[3]-140),`alpha at ${x},${y} is ${c[3]}`).toBeLessThanOrEqual(1);
    }
    // Colour is the face's own shaded tile colour, not a blend with far faces.
    expect(Math.abs(rgbAt(p,N,N/4,40)[2]-Math.round(255*FACE_SHADE.left))).toBeLessThanOrEqual(1);
  });
  test('shapes: bottom slab is half height, snow layer thin, stairs notched, cactus inset',()=>{
    const cube=renderBlockIcon(def('stone'),N,grey),slab=renderBlockIcon(def('stone_slab'),N,grey);
    const drop=firstRow(slab)-firstRow(cube);expect(drop).toBeGreaterThan(.22*N);expect(drop).toBeLessThan(.32*N);
    expect(lastRow(slab)).toBe(lastRow(cube));
    const snow=renderBlockIcon(def('snow'),N,grey);expect(firstRow(snow)-firstRow(cube)).toBeGreaterThan(.45*N);
    const stairs=renderBlockIcon(def('oak_stairs_south'),N,grey);
    expect(opaque(stairs)).toBeLessThan(opaque(cube));expect(firstRow(stairs)).toBe(firstRow(cube));
    const cactus=renderBlockIcon(def('cactus'),N,grey),[c0,c1]=cols(cactus),[k0,k1]=cols(cube);
    expect(c1-c0).toBeLessThan(k1-k0);
  });
  test('block item icons use the south-facing state and real atlas tiles',()=>{
    const furnace=iconPixels('furnace');expect(key(furnace)).toBe(key(renderBlockIcon(def('furnace_south'),N,tilePixels)));
  });
});

describe('PNG encoding',()=>{
  test('encodes RGBA losslessly with a valid header and zlib stream',()=>{
    const w=5,h=3,rgba=new Uint8ClampedArray(w*h*4).map((_,i)=>i*7&255);
    const png=encodePng(w,h,rgba);
    expect(Array.from(png.subarray(0,8))).toEqual([137,80,78,71,13,10,26,10]);
    const view=new DataView(png.buffer,png.byteOffset);expect(view.getUint32(16)).toBe(w);expect(view.getUint32(20)).toBe(h);
    // Collect IDAT and inflate: each row is a filter byte (0) followed by the row's RGBA.
    let at=8;const parts:Uint8Array[]=[];
    while(at<png.length){const len=view.getUint32(at),type=String.fromCharCode(...png.subarray(at+4,at+8));if(type==='IDAT')parts.push(png.subarray(at+8,at+8+len));at+=12+len;}
    const raw=inflateSync(Buffer.concat(parts));expect(raw.length).toBe(h*(1+w*4));
    for(let y=0;y<h;y++){expect(raw[y*(1+w*4)]).toBe(0);expect(Array.from(raw.subarray(y*(1+w*4)+1,(y+1)*(1+w*4)))).toEqual(Array.from(rgba.subarray(y*w*4,(y+1)*w*4)));}
    expect(pngDataUrl(w,h,rgba)).toBe(`data:image/png;base64,${Buffer.from(png).toString('base64')}`);
  });
});

describe('block icon coverage',()=>{
  test('every block item icon state exists',()=>{
    for(const d of ITEMS.values())if(d.icon.kind==='block')expect(BLOCK_BY_NAME.get(d.icon.block) as BlockDef|undefined,d.id).toBeDefined();
  });
});
