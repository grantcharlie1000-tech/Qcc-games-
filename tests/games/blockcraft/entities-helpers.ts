// Test harness for the entity framework: the fake game with the real entity service, recorded particles, xp and
// survival damage, and a few test kinds. Not a test file itself (vitest only runs *.test.ts).
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {createEntities} from '../../../src/games/blockcraft/entity/entities';
import type {VoxelWorld} from '../../../src/games/blockcraft/world/world';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {biomeId} from '../../../src/games/blockcraft/data/biomes';
import {CHUNK_VOLUME,LAYER} from '../../../src/games/blockcraft/engine/constants';
import type {DamageSource,EntityKind,EntityModel,ParticleKind,ParticleOptions} from '../../../src/games/blockcraft/engine/contracts';

export interface EntityHarness{
  game:FakeGame;
  particles:{kind:ParticleKind;x:number;y:number;z:number;options?:ParticleOptions}[];
  xp:number[];
  playerHits:{amount:number;source:DamageSource}[];
  pushes:[number,number,number][];
  /** Runs only the entity service for n ticks (time advances). */
  tick(n?:number):void;
  sounds():string[];
}
export interface HarnessOptions{seed?:number;height?:number;block?:number;r?:number;kinds?:EntityKind[];biome?:string;spawning?:boolean;
  /** Fill every chunk's light with this packed value (sky<<4|block); default: unknown (null). */
  light?:number;
  /** Extra layers [block, fromY, toY inclusive] written into every chunk before it loads. */
  layers?:[number,number,number][]}

export function harness(options:HarnessOptions={}):EntityHarness{
  const game=createFakeGame({seed:options.seed??7});
  const particles:EntityHarness['particles']=[],xp:number[]=[],playerHits:EntityHarness['playerHits']=[],pushes:[number,number,number][]=[];
  game.render.spawnParticles=(kind,x,y,z,o)=>{particles.push({kind,x,y,z,options:o});};
  game.survival.addXp=n=>{xp.push(n);};
  game.survival.damage=(amount,source)=>{playerHits.push({amount,source});return amount;};
  const push=game.player.push.bind(game.player);
  game.player.push=(x,y,z)=>{pushes.push([x,y,z]);push(x,y,z);};
  game.settings.mobSpawning=options.spawning??false;
  game.settings.daylightCycle=false;
  const service=createEntities(game);
  game.entities=service;
  for(const k of options.kinds??[])service.register(k);
  service.init?.();
  // Chunks are built with their biome and layers before insertion, so chunkLoaded (fresh) sees the final contents.
  const r=options.r??2,height=options.height??60,biome=options.biome!==undefined?biomeId(options.biome):0;
  for(let cz=-r;cz<=r;cz++)for(let cx=-r;cx<=r;cx++){
    const blocks=new Uint8Array(CHUNK_VOLUME);blocks.fill(options.block??B.stone,0,height*LAYER);
    for(const [id,y0,y1] of options.layers??[])blocks.fill(id,y0*LAYER,(y1+1)*LAYER);
    (game.world as VoxelWorld).insert(cx,cz,{blocks,biomes:new Uint8Array(LAYER).fill(biome)});
  }
  if(options.light!==undefined)for(const c of game.world.chunks.values())c.light=new Uint8Array(CHUNK_VOLUME).fill(options.light);
  const p=game.player.state;p.x=.5;p.y=options.height??60;p.z=.5;
  return{game,particles,xp,playerHits,pushes,
    tick(n=1){game.runTicks(n,[service]);},
    sounds:()=>game.sounds.played.map(s=>s.name)};
}

/** A two-box test model (body and head) with painted pixels. */
export function testModel(extra:Partial<EntityModel>={}):EntityModel{
  return{
    textureWidth:64,textureHeight:32,
    paint(px,w,h){for(let i=0;i<w*h;i++){px[i*4]=200;px[i*4+1]=(i*7)&255;px[i*4+2]=90;px[i*4+3]=255;}},
    parts:[
      {name:'body',pivot:[0,12,0],boxes:[{from:[-4,-12,-2],size:[8,12,4],uv:[16,16]}]},
      {name:'head',pivot:[0,12,0],boxes:[{from:[-4,0,-4],size:[8,8,8],uv:[0,0]}]}
    ],
    ...extra
  };
}
export const walker=(extra:Partial<EntityKind>={}):EntityKind=>({kind:'walker',category:'passive',width:.6,height:1.8,maxHealth:20,model:testModel(),...extra});
export const monster=(extra:Partial<EntityKind>={}):EntityKind=>({kind:'monster',category:'hostile',width:.6,height:1.95,maxHealth:20,model:testModel(),...extra});
/** Fills a box of cells (inclusive) with a block. */
export function fill(game:FakeGame,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,id:number){
  for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)game.world.set(x,y,z,id);
}
