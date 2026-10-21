// Placeables drawn as items (oak door, red bed, lantern) and the spawn eggs: one speckled egg painted in each
// mob's vanilla colour pair (base and spots).
import {MOB_KINDS} from '../data/items';
import {type Sprite,sprite,ramp,edgesOf} from './sprites-core';

/** Spawn egg [base, spots] colours of every mob kind, as in vanilla. */
export const SPAWN_EGG_COLOURS:Record<typeof MOB_KINDS[number],[number,number]>={
  cow:[0x443626,0xa1a1a1],pig:[0xf0a5a2,0xdb635f],sheep:[0xe7e7e7,0xffb5b5],chicken:[0xa1a1a1,0xff0000],
  rabbit:[0x995f40,0x734831],wolf:[0xd7d3d3,0xceaf96],squid:[0x223b4d,0x708899],zombie:[0x00afaf,0x799c65],
  husk:[0x797061,0xe6cc94],drowned:[0x8ff1d7,0x799c65],skeleton:[0xc1c1c1,0x494949],stray:[0x617677,0xddeaea],
  creeper:[0x0da70b,0x000000],spider:[0x342d27,0xa80e0e],enderman:[0x161616,0x000000],slime:[0x51a03e,0x7ebf6e]
};
/** Egg shading in the base colour (O D M L H) with spots in the spot colour (s, t darker). */
const EGG=[
  '................',
  '.......LL.......',
  '......LHHM......',
  '.....LHLssM.....',
  '.....LHLstM.....',
  '....LHLLMMMM....',
  '....LLMMMMsD....',
  '...LssMMMMMtD...',
  '...LstMMMMMMD...',
  '...LMMMMMssMD...',
  '...LMMMMMstDD...',
  '....MMssMMMD....',
  '....MMstMMDD....',
  '.....MMMMDD.....',
  '......DDDD......',
  '................'];

export const MISC_SPRITES:Record<string,Sprite>={
  oak_door:sprite([
    '................',
    '....LLLLLLLL....',
    '....LwwLLwwM....',
    '....LwwLLwwM....',
    '....LLLLLLLM....',
    '....LwwLLwwM....',
    '....LwwLLwwM....',
    '....LLLLLLLM....',
    '....LPPPPPPM....',
    '....LppppppM....',
    '....LPPPPhPM....',
    '....LppppppM....',
    '....LPPPPPPM....',
    '....LppppppM....',
    '....LMMMMMMD....',
    '................'],{L:0xc09c62,M:0x8f6f3b,D:0x6a5028,P:0xa8844e,p:0x7c5c30,w:0x4a3418,h:0x2e2e2e,O:0x2e1f0d},edgesOf('LMDPpwh','O')),
  red_bed:sprite([
    '................',
    '................',
    '................',
    '................',
    '..WWWQQQQQQQQQ..',
    '..WHWRRRRRRRRR..',
    '..WWWRRRRRRRRR..',
    '..rrrrrrrrrrrr..',
    '..PPPPPPPPPPPP..',
    '..pp........pp..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'],{W:0xeaeaea,H:0xffffff,Q:0xd04a40,R:0xb02e26,r:0x7e1e1a,P:0xa8844e,p:0x6a5028,O:0x2a120a},edgesOf('WHQRrPp','O')),
  lantern:sprite([
    '................',
    '.......kk.......',
    '......k..k......',
    '.....kkkkkk.....',
    '....kKKKKKKk....',
    '....kyYYYYyk....',
    '....kYyWWyYk....',
    '....kYWWWWYk....',
    '....kYyWWyYk....',
    '....kyYYYYyk....',
    '....kKKKKKKk....',
    '.....kkkkkk.....',
    '................',
    '................',
    '................',
    '................'],{k:0x3a3a46,K:0x5c5c6a,y:0xe8a030,Y:0xf8c850,W:0xfff4c0,O:0x14141a},edgesOf('kKyYW','O'))
};
for(const mob of MOB_KINDS){
  const [base,spots]=SPAWN_EGG_COLOURS[mob],b=ramp(base,{outline:.45,dark:.75,light:.25,highlight:.5}),s=ramp(spots,{dark:.7});
  MISC_SPRITES[`${mob}_spawn_egg`]=sprite(EGG,{O:b.o,D:b.d,M:b.m,L:b.l,H:b.h,s:s.m,t:s.d},edgesOf('HLMDst','O'));
}
