// Tools, weapons and utilities: the five tool shapes in each tier palette (vanilla two-tone tiers on a wooden
// stick handle), shears, flint and steel, bow, arrow, buckets, shield, compass and clock.
// Role letters: O outline, D dark, M mid, L light, H highlight (head material); a/b/c handle outline/dark/light.
import {type Palette,type Sprite,sprite,edgesOf} from './sprites-core';
import {shieldSprite} from './sprites-shield';

/** Head colours of each tool tier: wood is planks-tan, stone grey, iron near-white, gold yellow, diamond cyan. */
export const TIER_COLOURS:Record<'wooden'|'stone'|'iron'|'golden'|'diamond',{O:number;D:number;M:number;L:number;H:number}>={
  wooden:{O:0x3b2a12,D:0x7a5e33,M:0xa0824b,L:0xb8975c,H:0xcdb07a},
  stone:{O:0x2c2c2c,D:0x5c5c5c,M:0x7b7b7b,L:0x969696,H:0xababab},
  iron:{O:0x3d3d3d,D:0x9c9c9c,M:0xc8c8c8,L:0xe2e2e2,H:0xffffff},
  golden:{O:0x5e4206,D:0xc08a10,M:0xedc22e,L:0xfbe65a,H:0xfffdb0},
  diamond:{O:0x0e3b35,D:0x1e9c8c,M:0x33e0c8,L:0x8ef5e4,H:0xd8fff8}
};
/** The stick every tool is mounted on. */
export const HANDLE={a:0x2e1f0d,b:0x5a4220,c:0x87652f};
const TOOL_EDGES={H:'O',L:'O',M:'O',D:'O',c:'a',b:'a'};

const SHAPES:Record<'sword'|'pickaxe'|'axe'|'shovel'|'hoe',string[]>={
  sword:[
    '................',
    '.............HM.',
    '............HM..',
    '...........HM...',
    '..........HM....',
    '.........HM.....',
    '........HM......',
    '...DD..HM.......',
    '....DDHM........',
    '.....DD.........',
    '....cbDD........',
    '...cb..DD.......',
    '..cb............',
    '.bb.............',
    '................',
    '................'],
  pickaxe:[
    '................',
    '..LLLL..........',
    '..MMMMMLL.......',
    '.....DDDML......',
    '........DML.....',
    '.........DML....',
    '.........cDML...',
    '........cb.DML..',
    '.......cb...DL..',
    '......cb....DM..',
    '.....cb.....DML.',
    '....cb.......ML.',
    '...cb........ML.',
    '..cb.........ML.',
    '................',
    '................'],
  axe:[
    '................',
    '...LLL..........',
    '..HLLMM......c..',
    '..HMMMMM....cb..',
    '..HMMMMMMMDcb...',
    '..HMMMMMMDDb....',
    '..HMMMMDDcb.....',
    '..LDDDD.cb......',
    '.......cb.......',
    '......cb........',
    '.....cb.........',
    '....cb..........',
    '...cb...........',
    '..cb............',
    '................',
    '................'],
  shovel:[
    '................',
    '................',
    '...........LLL..',
    '..........LLMMD.',
    '.........LMMMDD.',
    '.........MMMDD..',
    '.........cMDD...',
    '........cb......',
    '.......cb.......',
    '......cb........',
    '.....cb.........',
    '....cb..........',
    '...cb...........',
    '..cb............',
    '................',
    '................'],
  hoe:[
    '................',
    '.....LLLLLL.....',
    '....LMMMMMMDcb..',
    '....MD.....cb...',
    '....D.....cb....',
    '.........cb.....',
    '........cb......',
    '.......cb.......',
    '......cb........',
    '.....cb.........',
    '....cb..........',
    '...cb...........',
    '..cb............',
    '.cb.............',
    '................',
    '................']
};

const IRON={O:0x3d3d3d,D:0x8c8c8c,M:0xb4b4b4,L:0xd8d8d8,H:0xffffff};
const GOLD=TIER_COLOURS.golden;

export const TOOL_SPRITES:Record<string,Sprite>={};
for(const [tier,colours] of Object.entries(TIER_COLOURS)){
  // Wooden tools: the head is planks-coloured, the handle the usual stick.
  const palette:Palette={...colours,...HANDLE};
  for(const [kind,rows] of Object.entries(SHAPES))TOOL_SPRITES[`${tier}_${kind}`]=sprite(rows,palette,TOOL_EDGES);
}

// Shears: two light blades crossing at the pivot (P) and opening toward the top right, two loop handles (k, with
// a lighter K top edge) at the bottom left. The handle holes are ' ' so they stay see-through instead of outlined.
TOOL_SPRITES.shears=sprite([
  '................',
  '................',
  '............HM..',
  '...........HM...',
  '..........HM..L.',
  '.........HM..LD.',
  '........HM.LLD..',
  '.......HMLLDD...',
  '......PPDD......',
  '....KkPkk.......',
  '..KKkk..k.......',
  '..K  k.KKkk.....',
  '..k  k.K  k.....',
  '..kkkk.k  k.....',
  '.......kkkk.....',
  '................'],{...IRON,P:0x4a4a4a,k:0x8e8e8e,K:0xb8b8b8},edgesOf('HMLDPkK','O'));

TOOL_SPRITES.flint_and_steel=sprite([
  '................',
  '..........LLLL..',
  '.........LMMMMD.',
  '.........MD..MD.',
  '.............MD.',
  '...........DMMD.',
  '......ff...DDD..',
  '.....fggf.......',
  '....fghggf......',
  '...fgggggf......',
  '...fggggf.......',
  '...ffggf........',
  '....fff.........',
  '................',
  '................',
  '................'],{...IRON,f:0x2a2a2a,g:0x4d4d4d,h:0x7a7a7a},{...edgesOf('LMD','O'),g:'f'});

TOOL_SPRITES.bow=sprite([
  '................',
  '..........LLMM..',
  '.......LLMMMs...',
  '.....LLMMD.s....',
  '....LMMD..s.....',
  '...gggg..s......',
  '...LMD..s.......',
  '..LMD..s........',
  '..LMD.s.........',
  '..LM.s..........',
  '.LMMs...........',
  '.LMs............',
  '.Ms.............',
  '.M..............',
  '................',
  '................'],{L:0xa27a42,M:0x7a5a2e,D:0x5c4321,g:0x4a3417,s:0xdcdcdc,O:0x2a1b0b},edgesOf('LMDg','O'));

// ---- Bow pull stages: what a held bow shows while drawn (vanilla bow_pulling_0, _1, _2). They are sprites, not
// items. The string is pulled back into a V toward the bottom-right, the limb tips bend toward it and the nocked
// arrow lies on the other diagonal with its head at the upper left, sliding back by one pixel per stage.
const BOW_LIMBS=[
  '................',
  '..........LLMM..',
  '.......LLMMM....',
  '.....LLMMD......',
  '....LMMD........',
  '...gggg.........',
  '...LMD..........',
  '..LMD...........',
  '..LMD...........',
  '..LM............',
  '.LMM............',
  '.LM.............',
  '.M..............',
  '.M..............',
  '................',
  '................'];
/** The nocked arrow: head (x y z) at the top-left, shaft (a light, A dark), fletching (w); the nock is at (9,9). */
const NOCKED_ARROW=[
  'xy.........',
  'yyz........',
  '.za........',
  '..Aa.......',
  '...Aa......',
  '....Aa.....',
  '.....Aa....',
  '......Aaw..',
  '.......Aaw.',
  '.......wAaw',
  '........ww.'];
function pulledBow(stage:number):Sprite{
  const g=BOW_LIMBS.map(r=>[...r]);
  const set=(x:number,y:number,c:string)=>{if(x>=0&&y>=0&&x<16&&y<16)g[y][x]=c;};
  // Limb tips bend toward the string: one tip pixel per stage moves a pixel toward the archer.
  const tips:[number,number,number,number][]=[[13,1,13,2],[1,13,2,13],[12,1,12,2],[1,12,2,12]];
  for(let i=0;i<stage*2;i++){const [x,y,nx,ny]=tips[i];const c=g[y][x];set(x,y,'.');set(nx,ny,c);}
  // The string runs from each tip to the nock (Bresenham lines over empty pixels only).
  const nock=9+stage,line=(x0:number,y0:number,x1:number,y1:number)=>{
    const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx-dy,x=x0,y=y0;
    for(;;){if(g[y][x]==='.')g[y][x]='s';if(x===x1&&y===y1)break;const e2=2*e;if(e2>-dy){e-=dy;x+=sx;}if(e2<dx){e+=dx;y+=sy;}}
  };
  const top=stage?[12,3]:[12,2],bottom=stage?[3,12]:[2,12];
  line(top[0],top[1],nock,nock);line(bottom[0],bottom[1],nock,nock);
  NOCKED_ARROW.forEach((row,y)=>[...row].forEach((c,x)=>{if(c!=='.')set(x+stage,y+stage,c);}));
  return sprite(g.map(r=>r.join('')),{L:0xa27a42,M:0x7a5a2e,D:0x5c4321,g:0x4a3417,s:0xdcdcdc,O:0x2a1b0b,
    x:0xe0e0e0,y:0xb4b4b4,z:0x5a5a5a,a:0x8a6a3a,A:0x5c4422,w:0xf0f0f0,F:0x8c8c8c},{...edgesOf('LMDgxyz','O'),w:'F'});
}
for(let stage=0;stage<3;stage++)TOOL_SPRITES[`bow_pulling_${stage}`]=pulledBow(stage);

TOOL_SPRITES.arrow=sprite([
  '................',
  '.............LH.',
  '............LMMH',
  '...........sDMD.',
  '..........sS.D..',
  '.........sS.....',
  '........sS......',
  '.......sS.......',
  '......sS........',
  '.....sS.........',
  '..w.sS..........',
  '.wwsS...........',
  '.wsSw...........',
  '..ww............',
  '................',
  '................'],{L:0xb4b4b4,M:0x8a8a8a,H:0xe0e0e0,D:0x5a5a5a,s:0x8a6a3a,S:0x5c4422,w:0xf0f0f0,O:0x2c2c2c,F:0x8c8c8c},{L:'O',M:'O',H:'O',D:'O',w:'F'});

// ---- Buckets: one iron pail; I/J are the contents (or the dark inside of an empty bucket). ----------------
const PAIL=[
  '................',
  '....rRRRRRRr....',
  '...rIIIIIIIIr...',
  '...rIIIIIIIIr...',
  '...rJJJJJJJJr...',
  '...RHRRRRRRRr...',
  '....MLHMMMDD....',
  '....MLHMMMDD....',
  '....MLHMMMDD....',
  '.....LHMMDD.....',
  '.....LHMMDD.....',
  '.....DDDDDD.....',
  '................',
  '................',
  '................',
  '................'];
const PAIL_COLOURS={R:0xd8d8d8,r:0xa8a8a8,H:0xffffff,L:0xd0d0d0,M:0xa8a8a8,D:0x7a7a7a,O:0x343434};
const pail=(I:number,J:number)=>sprite(PAIL,{...PAIL_COLOURS,I,J},edgesOf('RrIJHLMD','O'));
TOOL_SPRITES.bucket=pail(0x5c5c5c,0x484848);
TOOL_SPRITES.water_bucket=pail(0x4a7ee6,0x2f5bc8);
TOOL_SPRITES.lava_bucket=pail(0xfca33c,0xd9561e);
TOOL_SPRITES.milk_bucket=pail(0xffffff,0xe6e6ea);

// ---- Shield: the supplied face inside the existing iron rim. -------------------------------------------
TOOL_SPRITES.shield=shieldSprite;

// ---- Compass and clock: round frames with a dial. ------------------------------------------------------
TOOL_SPRITES.compass=sprite([
  '................',
  '................',
  '.....LLLLLL.....',
  '...LLffffffLD...',
  '...LffffffffD...',
  '..LffffffffnfD..',
  '..LfffffffnffD..',
  '..LffffffPfffD..',
  '..LfffffgffffD..',
  '..LffffgfffffD..',
  '..LfffgffffffD..',
  '...MffffffffD...',
  '...MDffffffDD...',
  '.....DDDDDD.....',
  '................',
  '................'],{L:0xd8d8d8,M:0xa8a8a8,D:0x7a7a7a,f:0x3c3c44,n:0xe03030,g:0xb8b8b8,P:0x1c1c1c,O:0x2a2a2a},edgesOf('LMDfngP','O'));

TOOL_SPRITES.clock=sprite([
  '................',
  '................',
  '.....LLLLLL.....',
  '...LLkkkkkkLD...',
  '...LkkkyykkkD...',
  '..LkkkyYYykkkD..',
  '..LkkkkyykkkkD..',
  '..LggggggggggD..',
  '..LnnnnnnnnnnD..',
  '..LnnnnnnwnnnD..',
  '..LnnnnnwwnnnD..',
  '...MnnnnnnnnD...',
  '...MDnnnnnnDD...',
  '.....DDDDDD.....',
  '................',
  '................'],{L:GOLD.L,M:GOLD.M,D:GOLD.D,O:GOLD.O,k:0x7fb3f0,y:0xf6d84a,Y:0xfff3a0,g:0x5a8f3a,n:0x1d2a54,w:0xe8e8f0},edgesOf('LMDkyYgnw','O'));
