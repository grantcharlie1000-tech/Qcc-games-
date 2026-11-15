export type PixelPalette=Readonly<Record<string,string>>;

/** Each character is one deliberately placed source pixel. */
export function stamp(ctx:CanvasRenderingContext2D,rows:readonly string[],palette:PixelPalette,x:number,y:number,scale=2){
  x=Math.round(x/scale)*scale;y=Math.round(y/scale)*scale;
  for(let row=0;row<rows.length;row++)for(let col=0;col<rows[row]!.length;col++){
    const color=palette[rows[row]![col]!];
    if(color){ctx.fillStyle=color;ctx.fillRect(x+col*scale,y+row*scale,scale,scale);}
  }
}

export const CLOUD=[
 '..............hhhhhhhh......................',
 '............hhHHHHHHHHhh....................',
 '.......hhhhhhHHHHHHHHHHHHh...................',
 '.....hhHHHHHHHHHHHHHHHHHHhhh................',
 '....hHHHHHHHHHHHHHHHHHHHHHHHhh..............',
 '...hHHHHHHHHHHHHHHHHHHHHHHHHHHhhhhh.........',
 '..hHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHhh.......',
 '.hHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHh......',
 'hHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHhhhh..',
 'hmmmmmmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHhh',
 '.hmmmmmmmmmmHHHHHHHHHHHHmmmmmmHHHHHHHhhhhhh.',
 '...hhhhmmmmmmmmmmmmmmmmmmmmmmmmmmhhhhhh.....',
 '.......hhhhhhhhhhhhhhhhhhhhhhhhhh...........',
];

export const WILLOW=[
 '...............ssssss...............',
 '............sssmmmmmmsss............',
 '.........sssmmmlhhlmmmmmss..........',
 '.......ssmmmllhhhhlmmmmmmmss........',
 '.....ssmmllhhhhhhllmmmllmmmsss......',
 '....smmllhhhhllllmmmmllhlmmmmmss....',
 '...smmllhhlllmmmmmmmllhhlmmmmlmms...',
 '..smmllhllmmmsmmmlllhhllmmmlhlmmms..',
 '..smmlllmmmssmmllhhlllmmmmmllhlmmms.',
 '.smmlllmmssmmllhhhhllmmmssmmllhllmms',
 '.smmllmmssmmllhhllmmmssmmmssmmlllmms',
 'smmllmssmmllhlllmmssmmmlmmssmmlllmmms',
 'smmllmssmllhllmmssmmllhlmmssmmllmmms.',
 'smmllmssmllhllmssmmllhhlmmssmmllmmms.',
 '.smlmmssmllhlmmssmmllhlmmssmmllmmms..',
 '.smlmmssmllhlmmssmllhllmmssmllmmms...',
 '.smlmm.smmllmmssmllhllm.ssmmllmms....',
 '..smmm.smmllm.ssmmllmm..ssmmllmms....',
 '..smm..smmllm.ssmmllmm..ssmllmms.....',
 '..smm..smmllm..smmllm...ssmllmms.....',
 '...sm...smlmm..smmllm....smllmms.....',
 '...sm...smlmm..smmllm....smllmm......',
 '........smmm....smlmm.....smlmm......',
 '.........smm....smlmm.....smmm.......',
 '..........sm.....smm......smm........',
 '..................sm.......sm.......',
];

export const FIR=[
 '...........s...........',
 '..........sls..........',
 '..........slms.........',
 '.........sllmms........',
 '........sllmmmms.......',
 '.......slllmmmmmss.....',
 '.........sllmms........',
 '........sllmmmms.......',
 '.......slllmmmmmss.....',
 '......sllllmmmmmmmss...',
 '.....slllllmmmmmmmmss...',
 '.......slllmmmmss......',
 '......sllllmmmmmss.....',
 '.....slllllmmmmmmss....',
 '....sllllllmmmmmmmss...',
 '...slllllllmmmmmmmmmss.',
 '..sllllllllmmmmmmmmmss.',
 '.....slllllmmmmmmss....',
 '....sllllllmmmmmmmss...',
 '...slllllllmmmmmmmmss..',
 '..sllllllllmmmmmmmmmss.',
 '.slllllllllmmmmmmmmmmss',
 'ssssssssssstttsssssssss',
 '..........tttt.........',
 '..........tttt.........',
];

export const SNOW_FIR=[
 '...........w...........',
 '..........www..........',
 '..........wbs..........',
 '.........wwbbbs........',
 '........wwwbbsss.......',
 '.......wwwbbssssss.....',
 '.........wwwbbs........',
 '........wwwwbbss.......',
 '.......wwwwbbbssss.....',
 '......wwwwbbbbsssss....',
 '.....wwwwbbbbssssssss..',
 '.......wwwwbbsss.......',
 '......wwwwwbbbsss......',
 '.....wwwwwbbbbssss.....',
 '....wwwwwbbbbbsssss....',
 '...wwwwwbbbbbbsssssss..',
 '..wwwwwbbbbbbbssssssss.',
 '.....wwwwwwbbbsss......',
 '....wwwwwwbbbbssss.....',
 '...wwwwwwbbbbbsssss....',
 '..wwwwwwbbbbbbsssssss..',
 '.wwwwwwbbbbbbbssssssss.',
 'ssssssssssstttsssssssss',
 '..........tttt.........',
 '..........tttt.........',
];

export const CHALET=[
 '....................ss..................',
 '..................sswwss................',
 '................sswwwwwwss..............',
 '..............sswwwwwwwwwwss............',
 '............sswwwwwwwwwwwwwwss..........',
 '..........sswwwwwbbbbbbbwwwwwwwss.......',
 '........sswwwwwbbrrrrrrrbbwwwwwwwss.....',
 '......sswwwwwbbrrrrrrrrrrrbbwwwwwwwss...',
 '....sswwwwwbbrrrhhhrrrrrrrhhbbwwwwwwwss.',
 '..sswwwwwbbrrrhhrrrhhhhhhhrrhhbbwwwwwwss',
 'sswwwwwbbrrrrrrrrrrrrrrrrrrrrrrbbwwwwwss',
 '..sssssddddddddddddddddddddddddddsssss..',
 '.....shtccccccccccchhtccccccccccths.....',
 '.....shtccccccccccchhtccccccccccths.....',
 '.....shtccsppppsccchhtccsppppscccths....',
 '.....shtccspLLpsccchhtccspLLpscccths....',
 '.....shtccsppppsccchhtccsppppscccths....',
 '.....shtccsppppsccchhtccsppppscccths....',
 '.....shtccccccccccchhtccccccccccths.....',
 '.....shhthhhhhhhhhhhhthhhhhhhhhhths.....',
 '.....shtccccccccccchhtccccccccccths.....',
 '.....shtccsppppsccchhtccsppppscccths....',
 '.....shtccspLLpsccchhtccspLLpscccths....',
 '.....shtccsppppsccchhtccsppppscccths....',
 '.....shtccccccccccchhtccccccccccths.....',
 '.....shhhhhhhsdddddshhhhhhhhhhhhs......',
 '.....shtcccccsdHHddsccccccccccccths.....',
 '.....shtcccccsdHHddsccccccccccccths.....',
 '.....sssssssssssssssssssssssssssss.....',
];

const SWALLOW=[
 '............ooooo.......',
 '..........ooHHBBBo......',
 '.........oHHBBBBBBo.....',
 '........oHHBBBBBBBBo....',
 '........oBBBBBBBCBKBo...',
 '..oo....oBBBBBBBCCBBooo..',
 '.oBBo..ooBBBBBBBCCCBoPPo.',
 'oHBBo.oBBBBBBBBBCCCCooo..',
 '.oBBBooBBBBBBBCCCCCCo....',
 '..oBBBBBBBBBCCCCCCCCo....',
 '.oBBBo.oBBCCCCCCCCCo.....',
 'oBBoo...ooCCCCCCCoo......',
 '.oo.......ooCCCoo.......',
 '............ooo.........',
];
const ROBIN=[
 '...........ooooo........',
 '.........ooHHBBBoo......',
 '........oHHHBBBBBBo.....',
 '.......oHHBBBBBBBBBo....',
 '.......oBBBBBBRRBKBo....',
 '......oBBBBBBRRRRBBo....',
 '..oo..oBBBBBBRRRRRRooo..',
 '.oBBo.oBBBBBRRRRRRRoPPo.',
 'oHBBBooBBBBRRRRRRRRooo..',
 '.oBBBBBBBBBCRRRRRRRo....',
 '..ooBBBBBBCCCCRRRRRo....',
 '....ooBBBCCCCCCCCCCo....',
 '......oBBCCCCCCCCCo.....',
 '.......ooCCCCCCCoo......',
 '.........ooCCCoo........',
 '...........ooo..........',
];
const WING_UP=['....oo','...oHHo','..oHBBBo','.oHBBBBo','oHBBBBo.','oBBBBo..','.oBBo...','..oo....'];
const WING_FOLD=['.oooooo.','oHHHHBBo','oHBBBBBo','.oBBBBo.','..oooo..'];
const WING_DOWN=['.oooo...','oHHHBo..','oHBBBBo.','.oHBBBo.','..oHBBo.','...oBBo.','....oo..'];
const SWALLOW_COLORS={o:'#20384a',H:'#a5dcd0',B:'#3b91a1',C:'#fff0cb',K:'#142b3b',P:'#e7b061'};
const ROBIN_COLORS={o:'#302e3e',H:'#d6b58a',B:'#916c5b',C:'#f3dfbf',K:'#192638',P:'#bca07d',R:'#e98161'};
const frames=new Map<string,HTMLCanvasElement>();

export function flightSprite(frame:number,winter:boolean){
  const key=`${winter}-${frame}`,cached=frames.get(key);if(cached)return cached;
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext('2d')!,palette=winter?ROBIN_COLORS:SWALLOW_COLORS;
  const wing=frame<2?WING_UP:frame===2||frame===5?WING_FOLD:WING_DOWN;
  const wingY=[-28,-18,-2,4,12,-2][frame]!;
  ctx.translate(32,32);
  if(frame<2)stamp(ctx,wing,palette,-10,wingY);
  stamp(ctx,winter?ROBIN:SWALLOW,palette,-24,winter?-16:-14);
  if(frame>=2)stamp(ctx,wing,palette,-10,wingY);
  frames.set(key,canvas);return canvas;
}
