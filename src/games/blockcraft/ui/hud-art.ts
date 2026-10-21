// HUD pixel art, drawn here as hand-written palette grids and small procedural painters, rendered to crisp SVG
// data URLs. Everything is original art made to read like the vanilla Java HUD at a glance: red hearts with a
// black outline and a white highlight, golden absorption hearts, brown hunger shanks with a bone, a grey
// chestplate for armour, blue air bubbles, the grey hotbar with a white selection frame, the green experience
// bar and blocky digits. With the colour-blind setting, absorption, poison and hunger icons gain shape patterns.
export type Grid=readonly string[];
export type Palette=Readonly<Record<string,string>>;

// ---- Shapes (one character per pixel, '.' transparent) ------------------------------------------------
// K outline, r body, h highlight, d shade.
const HEART:Grid=[
  '.KKK.KKK.',
  'KrhrKrrrK',
  'KhrrrrrrK',
  'KrrrrrrdK',
  '.KrrrrdK.',
  '..KrrdK..',
  '...KdK...',
  '....K....',
  '.........'];
// m meat, h highlight, d shade, b bone.
const SHANK:Grid=[
  '.....KKK.',
  '....KmhhK',
  '...KmmmhK',
  '...KmmmmK',
  '..KdmmmK.',
  '.KbKddK..',
  'KbbbKK...',
  'KbbK.....',
  '.KK......'];
// a plate, h highlight, d shade.
const CHESTPLATE:Grid=[
  '.KKK.KKK.',
  'KahaKaaaK',
  'KhaaaaadK',
  'KKaaaaaKK',
  '.KaaaadK.',
  '.KaaaadK.',
  '.KaaaadK.',
  '.KKKKKKK.',
  '.........'];
// l water, w shine, s shade.
const BUBBLE:Grid=[
  '..KKKKK..',
  '.KwwlllK.',
  'KwwllllsK',
  'KwlllllsK',
  'KlllllllK',
  'KlllllssK',
  '.KllsssK.',
  '..KKKKK..',
  '.........'];
const BURST:Grid=[
  '...K.K...',
  '.Kw...sK.',
  '.........',
  'K.......K',
  '.........',
  'K.......K',
  '.........',
  '.K.....K.',
  '...K.K...'];

const map=(grid:Grid,fn:(ch:string,x:number,y:number)=>string):string[]=>grid.map((row,y)=>[...row].map((ch,x)=>ch==='.'?'.':fn(ch,x,y)).join(''));
/** The interior of a shape (everything but the outline) as one character. */
const container=(grid:Grid,inner='i')=>map(grid,ch=>ch==='K'?'K':inner);
/** The fill layer: the shape without its outline (drawn over a container). */
const fill=(grid:Grid)=>map(grid,ch=>ch==='K'?'.':ch);
const half=(grid:Grid,keep:(x:number)=>boolean)=>grid.map(row=>[...row].map((ch,x)=>keep(x)?ch:'.').join(''));
const leftHalf=(x:number)=>x<=4,rightHalf=(x:number)=>x>=4;

// ---- Colour-blind shape cues ---------------------------------------------------------------------------
/** Absorption: a darker plus in the middle of the heart. */
const plus=(grid:Grid)=>map(grid,(ch,x,y)=>(x===4&&y>=2&&y<=4)||(y===3&&x>=3&&x<=5)?'p':ch);
/** Poison: diagonal stripes. */
const stripes=(grid:Grid,dir:1|-1,on:string)=>map(grid,(ch,x,y)=>ch===on&&((x*dir+y)%3+3)%3===0?'p':ch);

// ---- Palettes ----------------------------------------------------------------------------------------
const OUTLINE='#000000',EMPTY='#2e2e2e';
const HEARTS={
  normal:{r:'#f22121',h:'#ffd2d2',d:'#a80c0c'},
  normalBlink:{r:'#ffdede',h:'#ffffff',d:'#e9a6a6'},
  absorb:{r:'#f2c418',h:'#fff6ad',d:'#b8860b',p:'#7f5900'},
  poison:{r:'#93a31b',h:'#d9e47a',d:'#566313',p:'#323c06'},
  poisonBlink:{r:'#e4eeb4',h:'#ffffff',d:'#b6c47e',p:'#8e9a52'}};
const FOOD={normal:{m:'#b5662a',h:'#eeb070',d:'#743c11',b:'#f2e9da'},hunger:{m:'#71892a',h:'#a7c056',d:'#43561a',b:'#d0d9aa',p:'#28350b'}};
const ARMOR={a:'#c9c9c9',h:'#ffffff',d:'#8a8a8a'};
const AIR={K:'#2c4fa1',l:'#9ccdff',w:'#ffffff',s:'#5c92e4'};

interface Icon{grid:Grid;palette:Palette;patterned?:{grid:Grid;palette?:Palette}}
const heartFill=(pal:Record<string,string>)=>({...pal});
const ICONS:Record<string,Icon>={};
function def(name:string,grid:Grid,palette:Palette,patterned?:Icon['patterned']){ICONS[name]={grid,palette,patterned};}

// Hearts
def('heart_container',container(HEART),{K:OUTLINE,i:EMPTY});
def('heart_container_blink',container(HEART),{K:'#ffffff',i:EMPTY});
for(const [name,pal,pattern] of [['heart',HEARTS.normal,null],['heart_blink',HEARTS.normalBlink,null],['heart_absorb',HEARTS.absorb,plus],
  ['heart_poison',HEARTS.poison,(g:Grid)=>stripes(g,1,'r')],['heart_poison_blink',HEARTS.poisonBlink,(g:Grid)=>stripes(g,1,'r')]] as const){
  const full=fill(HEART),pf=pattern?pattern(full):null;
  const base=name.replace(/_blink$/,''),suffix=name.endsWith('_blink')?'_blink':'';
  def(`${base}_full${suffix}`,full,heartFill(pal),pf?{grid:pf}:undefined);
  def(`${base}_half${suffix}`,half(full,leftHalf),heartFill(pal),pf?{grid:half(pf,leftHalf)}:undefined);
}
// Hunger
def('food_container',container(SHANK),{K:OUTLINE,i:EMPTY});
def('food_hunger_container',container(SHANK),{K:'#1f2a08',i:'#2c3a1a'});
def('food_full',fill(SHANK),FOOD.normal);
def('food_half',half(fill(SHANK),rightHalf),FOOD.normal);
{
  const full=fill(SHANK),pf=stripes(full,-1,'m');
  def('food_hunger_full',full,FOOD.hunger,{grid:pf});
  def('food_hunger_half',half(full,rightHalf),FOOD.hunger,{grid:half(pf,rightHalf)});
}
// Armour
def('armor_empty',container(CHESTPLATE),{K:OUTLINE,i:'#3a3a3a'});
def('armor_full',fill(CHESTPLATE),ARMOR);
def('armor_half',half(fill(CHESTPLATE),leftHalf),ARMOR);
// Air
def('air',BUBBLE,AIR);
def('air_bursting',BURST,AIR);

// Crosshair (inverts what is behind it), attack charge bar and the "full charge" mark.
const blank=(w:number,h:number)=>Array.from({length:h},()=>'.'.repeat(w).split(''));
const join=(g:string[][])=>g.map(r=>r.join(''));
{
  const g=blank(15,15);for(let i=3;i<=11;i++){g[7][i]='W';g[i][7]='W';}
  def('crosshair',join(g),{W:'#ffffff'});
  def('attack_background',['KKKKKKKKKKKKKKKK','KggggggggggggggK','KggggggggggggggK','KKKKKKKKKKKKKKKK'],{K:'#2a2a2a',g:'#6b6b6b'});
  def('attack_progress',['WWWWWWWWWWWWWWWW','WWWWWWWWWWWWWWWW','WWWWWWWWWWWWWWWW','WWWWWWWWWWWWWWWW'],{W:'#ffffff'});
  // A small upward sword: blade, cross-guard and grip.
  const s=blank(16,16);
  for(let y=1;y<=9;y++){s[y][7]='W';s[y][8]='W';}
  s[0][7]='W';s[0][8]='.';s[1][8]='W';
  for(let x=4;x<=11;x++)s[10][x]='W';
  for(let y=11;y<=13;y++){s[y][7]='W';s[y][8]='W';}
  s[14][6]='W';s[14][7]='W';s[14][8]='W';s[14][9]='W';
  def('attack_full',join(s),{W:'#ffffff'});
}
export const ICON_NAMES:readonly string[]=Object.keys(ICONS);

export function iconGrid(name:string,patterns:boolean):Grid{
  const icon=ICONS[name];if(!icon)throw new Error(`Unknown HUD icon ${name}`);
  return patterns&&icon.patterned?icon.patterned.grid:icon.grid;
}
export function iconPalette(name:string,patterns:boolean):Palette{
  const icon=ICONS[name];if(!icon)throw new Error(`Unknown HUD icon ${name}`);
  return patterns&&icon.patterned?.palette?icon.patterned.palette:icon.palette;
}

// ---- SVG rendering ----------------------------------------------------------------------------------
const colour=(c:string)=>c.length===9?`fill="${c.slice(0,7)}" fill-opacity="${(parseInt(c.slice(7),16)/255).toFixed(3)}"`:`fill="${c}"`;
const open=(w:number,h:number)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`;
/** One rect per horizontal run of equal pixels. */
export function gridSvg(grid:Grid,palette:Palette,ox=0,oy=0):string{
  let out='';
  grid.forEach((row,y)=>{
    for(let x=0;x<row.length;){
      const ch=row[x];let end=x+1;while(end<row.length&&row[end]===ch)end++;
      if(ch!=='.'&&palette[ch])out+=`<rect x="${x+ox}" y="${y+oy}" width="${end-x}" height="1" ${colour(palette[ch])}/>`;
      x=end;
    }
  });
  return out;
}
export function iconSvg(name:string,patterns:boolean):string{
  const g=iconGrid(name,patterns);
  return`${open(g[0].length,g.length)}${gridSvg(g,iconPalette(name,patterns))}</svg>`;
}
export const svgUrl=(svg:string)=>`data:image/svg+xml,${encodeURIComponent(svg)}`;
/** Generated data URLs by key. Bounded: names and levels are open-ended, so it starts over past this many entries. */
const urlCache=new Map<string,string>(),URL_CACHE_LIMIT=1024;
function cached(key:string,make:()=>string){
  let u=urlCache.get(key);
  if(!u){if(urlCache.size>=URL_CACHE_LIMIT)urlCache.clear();u=svgUrl(make());urlCache.set(key,u);}
  return u;
}
/** Data URL of a HUD icon (cached). */
export const hudIconUrl=(name:string,patterns:boolean)=>cached(`${name}:${patterns&&ICONS[name]?.patterned?1:0}`,()=>iconSvg(name,patterns));

// ---- Digits ------------------------------------------------------------------------------------------
/** 5×7 blocky digits for stack counts and the experience level. */
export const DIGIT_GLYPHS:Readonly<Record<string,Grid>>={
  0:['.###.','#...#','#..##','#.#.#','##..#','#...#','.###.'],
  1:['..#..','.##..','..#..','..#..','..#..','..#..','#####'],
  2:['.###.','#...#','....#','..##.','.#...','#....','#####'],
  3:['.###.','#...#','....#','..##.','....#','#...#','.###.'],
  4:['...##','..#.#','.#..#','#...#','#####','....#','....#'],
  5:['#####','#....','####.','....#','....#','#...#','.###.'],
  6:['..##.','.#...','#....','####.','#...#','#...#','.###.'],
  7:['#####','#...#','....#','...#.','..#..','..#..','..#..'],
  8:['.###.','#...#','#...#','.###.','#...#','#...#','.###.'],
  9:['.###.','#...#','#...#','.####','....#','...#.','.##..']};
function textRects(text:string,ox:number,oy:number,fillColour:string){
  let out='';
  [...text].forEach((ch,i)=>{const g=DIGIT_GLYPHS[ch];if(g)out+=gridSvg(g,{'#':fillColour},ox+i*6,oy);});
  return out;
}
/** Digits as SVG: 'count' = white with the vanilla 25 % shadow (width 6n, height 8); 'level' = experience green with
 *  a black outline (width 6n+1, height 9). */
export function digitsSvg(text:string,style:'count'|'level'):string{
  const n=text.length;
  if(style==='count')return`${open(n*6,8)}${textRects(text,1,1,'#3f3f3f')}${textRects(text,0,0,'#ffffff')}</svg>`;
  let out=open(n*6+1,9);
  for(const [dx,dy] of [[0,1],[2,1],[1,0],[1,2]])out+=textRects(text,dx,dy,'#000000');
  return`${out}${textRects(text,1,1,'#80ff20')}</svg>`;
}
export const digitsUrl=(text:string,style:'count'|'level')=>cached(`digits:${style}:${text}`,()=>digitsSvg(text,style));

// ---- Pixel font --------------------------------------------------------------------------------------
// Original blocky glyphs in the style of the game's GUI font: capitals and digits 7 px tall on the baseline (row 6),
// lower case 5 px x-height with ascenders, and descenders on row 7. A glyph advances by its width plus 1.
const px=(rows:string)=>rows.split('/');
export const FONT_GLYPHS:Readonly<Record<string,Grid>>={
  A:px('.###./#...#/#...#/#####/#...#/#...#/#...#'),B:px('####./#...#/####./#...#/#...#/#...#/####.'),
  C:px('.###./#...#/#..../#..../#..../#...#/.###.'),D:px('####./#...#/#...#/#...#/#...#/#...#/####.'),
  E:px('#####/#..../###../#..../#..../#..../#####'),F:px('#####/#..../###../#..../#..../#..../#....'),
  G:px('.####/#..../#..##/#...#/#...#/#...#/.###.'),H:px('#...#/#...#/#####/#...#/#...#/#...#/#...#'),
  I:px('###/.#./.#./.#./.#./.#./###'),J:px('....#/....#/....#/....#/....#/#...#/.###.'),
  K:px('#...#/#..#./###../#..#./#...#/#...#/#...#'),L:px('#..../#..../#..../#..../#..../#..../#####'),
  M:px('#...#/##.##/#.#.#/#...#/#...#/#...#/#...#'),N:px('#...#/##..#/#.#.#/#..##/#...#/#...#/#...#'),
  O:px('.###./#...#/#...#/#...#/#...#/#...#/.###.'),P:px('####./#...#/####./#..../#..../#..../#....'),
  Q:px('.###./#...#/#...#/#...#/#...#/#..#./.##.#'),R:px('####./#...#/####./#...#/#...#/#...#/#...#'),
  S:px('.####/#..../.###./....#/....#/#...#/.###.'),T:px('#####/..#../..#../..#../..#../..#../..#..'),
  U:px('#...#/#...#/#...#/#...#/#...#/#...#/.###.'),V:px('#...#/#...#/#...#/#...#/#...#/.#.#./..#..'),
  W:px('#...#/#...#/#...#/#...#/#.#.#/##.##/#...#'),X:px('#...#/.#.#./..#../.#.#./#...#/#...#/#...#'),
  Y:px('#...#/.#.#./..#../..#../..#../..#../..#..'),Z:px('#####/....#/...#./..#../.#.../#..../#####'),
  a:px('...../...../.###./....#/.####/#...#/.####'),b:px('#..../#..../#.##./##..#/#...#/#...#/####.'),
  c:px('...../...../.###./#...#/#..../#...#/.###.'),d:px('....#/....#/.##.#/#..##/#...#/#...#/.####'),
  e:px('...../...../.###./#...#/#####/#..../.####'),f:px('..##/.#../####/.#../.#../.#../.#..'),
  g:px('...../...../.####/#...#/#...#/.####/....#/####.'),h:px('#..../#..../#.##./##..#/#...#/#...#/#...#'),
  i:px('#/./#/#/#/#/#'),j:px('....#/...../....#/....#/....#/....#/#...#/.###.'),
  k:px('#.../#.../#..#/#.#./##../#.#./#..#'),l:px('#./#./#./#./#./#./.#'),
  m:px('...../...../##.#./#.#.#/#.#.#/#...#/#...#'),n:px('...../...../####./#...#/#...#/#...#/#...#'),
  o:px('...../...../.###./#...#/#...#/#...#/.###.'),p:px('...../...../#.##./##..#/#...#/####./#..../#....'),
  q:px('...../...../.##.#/#..##/#...#/.####/....#/....#'),r:px('...../...../#.##./##..#/#..../#..../#....'),
  s:px('...../...../.####/#..../.###./....#/####.'),t:px('.#./.#./###/.#./.#./.#./..#'),
  u:px('...../...../#...#/#...#/#...#/#...#/.####'),v:px('...../...../#...#/#...#/#...#/.#.#./..#..'),
  w:px('...../...../#...#/#...#/#.#.#/#.#.#/.####'),x:px('...../...../#...#/.#.#./..#../.#.#./#...#'),
  y:px('...../...../#...#/#...#/#...#/.####/....#/####.'),z:px('...../...../#####/...#./..#../.#.../#####'),
  ' ':px('.../.../.../.../.../.../...'),'.':px('././././././#'),',':px('././././././#/#'),
  '!':px('#/#/#/#/#/./#'),'?':px('.###./#...#/....#/...#./..#../...../..#..'),"'":px('#/#/././././.'),
  '"':px('#.#/#.#/.../.../.../.../...'),'-':px('...../...../...../#####/...../...../.....'),
  ':':px('./#/./././#/.'),';':px('./#/./././#/#'),'(':px('..#/.#./#../#../#../.#./..#'),')':px('#../.#./..#/..#/..#/.#./#..'),
  '/':px('....#/...#./...#./..#../.#.../.#.../#....'),'+':px('...../..#../..#../#####/..#../..#../.....'),
  '&':px('.#.../#.#../.#.../#.#.#/#..#./#..#./.##.#'),'%':px('#...#/#..#./...#./..#../.#.../.#..#/#...#'),
  '#':px('.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.'),...DIGIT_GLYPHS
};
/** True when every character has a glyph (otherwise the HUD falls back to the CSS font). */
export const hasGlyphs=(text:string)=>[...text].every(ch=>FONT_GLYPHS[ch]!==undefined);
/** Width in GUI pixels: each glyph's width plus 1 (the last column holds the shadow). */
export const textWidth=(text:string)=>[...text].reduce((w,ch)=>w+(FONT_GLYPHS[ch]?.[0].length??5)+1,0);
/** The GUI drop shadow: each channel at a quarter brightness, like the game's text shadow. */
export function shadowColour(colour:string){
  const n=parseInt(colour.slice(1,7),16);
  return`#${(((n&0xfcfcfc)>>2)>>>0).toString(16).padStart(6,'0')}`;
}
/** Text as a 9 px tall SVG in the pixel font with the GUI drop shadow (1 px right and down). */
export function textSvg(text:string,colour='#ffffff'):string{
  const chars=[...text],w=Math.max(1,textWidth(text)),shadow=shadowColour(colour);
  let x=0,back='',front='';
  for(const ch of chars){
    const glyph=FONT_GLYPHS[ch];if(!glyph){x+=6;continue;}
    back+=gridSvg(glyph,{'#':shadow},x+1,1);front+=gridSvg(glyph,{'#':colour},x,0);
    x+=glyph[0].length+1;
  }
  return`${open(w,9)}${back}${front}</svg>`;
}
/** Data URL of pixel-font text (cached). */
export const textUrl=(text:string,colour='#ffffff')=>cached(`text:${colour}:${text}`,()=>textSvg(text,colour));

// ---- Hotbar, slots and experience bar ------------------------------------------------------------------
const rect=(x:number,y:number,w:number,h:number,c:string)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${colour(c)}/>`;
/** One bevelled slot cell (20×20 at x,y): a light rim and a dark translucent well for the 16×16 item. */
function slotCell(x:number,y:number){
  return rect(x,y,20,20,'#8b8b8bd9')+rect(x+1,y+1,18,1,'#c6c6c6e6')+rect(x+1,y+1,1,18,'#c6c6c6e6')+rect(x+1,y+18,18,1,'#555555e6')+rect(x+18,y+1,1,18,'#555555e6')
    +rect(x+2,y+2,16,16,'#3b3b3bb3');
}
/** The 182×22 hotbar: a dark outline around nine slot cells. */
export function hotbarSvg():string{
  let out=open(182,22)+rect(0,0,182,22,'#000000b3')+rect(1,1,180,20,'#6f6f6fd9');
  for(let i=0;i<9;i++)out+=slotCell(1+i*20,1);
  return out+'</svg>';
}
/** The offhand slot: a single 22×22 cell like the hotbar's. */
export function offhandSvg():string{return open(22,22)+rect(0,0,22,22,'#000000b3')+slotCell(1,1)+'</svg>';}
/** The 24×24 selection frame: black outline, a thick white ring and a grey inner edge around a clear centre. */
export function selectionFrameSvg():string{
  const edge=(x:number,y:number,w:number,h:number)=>rect(x,y,w,h,'#000000');
  let out=open(24,24)+edge(0,0,24,1)+edge(0,23,24,1)+edge(0,0,1,24)+edge(23,0,1,24);
  out+=rect(1,1,22,2,'#ffffff')+rect(1,21,22,2,'#ffffff')+rect(1,1,2,22,'#ffffff')+rect(21,1,2,22,'#ffffff');
  out+=rect(3,3,18,1,'#a8a8a8')+rect(3,20,18,1,'#a8a8a8')+rect(3,3,1,18,'#a8a8a8')+rect(20,3,1,18,'#a8a8a8');
  return out+'</svg>';
}
/** The 182×5 experience bar: background (dark, notched) or progress (green, notched), cropped by the HUD. */
export function xpBarSvg(progress:boolean):string{
  let out=open(182,5)+rect(0,0,182,5,progress?'#1d4d05':'#000000');
  if(progress)out+=rect(1,1,180,3,'#80ff20')+rect(1,1,180,1,'#bfff8a')+rect(1,3,180,1,'#5fbf18');
  else out+=rect(1,1,180,3,'#3a3a3a')+rect(1,1,180,1,'#4d4d4d');
  for(let x=10;x<181;x+=10)out+=rect(x,1,1,3,progress?'#3a8a0e':'#1e1e1e');
  return out+'</svg>';
}
export const hotbarUrl=()=>cached('hotbar',hotbarSvg);
export const offhandUrl=()=>cached('offhand',offhandSvg);
export const selectionUrl=()=>cached('selection',selectionFrameSvg);
export const xpBarUrl=(progress:boolean)=>cached(`xp:${progress}`,()=>xpBarSvg(progress));

// ---- Compass and clock dials ----------------------------------------------------------------------------
/** Frames per turn, like the animated vanilla textures. */
export const COMPASS_FRAMES=32,CLOCK_FRAMES=64;
const dial=()=>{
  // A round 16×16 dial: outline K, rim R/r, face F.
  const g=blank(16,16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const d=Math.hypot(x-7.5,y-7.5);
    g[y][x]=d<5.6?'F':d<6.7?'R':d<7.6?'K':'.';
    if(g[y][x]==='R'&&x+y>16)g[y][x]='r';
  }
  return g;
};
/** Compass: grey rim, dark face, red needle toward the target and a grey tail. `frame` 0 points up, clockwise. */
export function compassGrid(frame:number):Grid{
  const g=dial(),a=(((frame%COMPASS_FRAMES)+COMPASS_FRAMES)%COMPASS_FRAMES)/COMPASS_FRAMES*Math.PI*2,sx=Math.sin(a),sy=-Math.cos(a);
  for(let t=0;t<=5;t+=.25){const x=Math.round(7.5+sx*t),y=Math.round(7.5+sy*t);if(g[y]?.[x]==='F'||g[y]?.[x]==='N')g[y][x]=t>0?'N':'C';}
  for(let t=.25;t<=3.5;t+=.25){const x=Math.round(7.5-sx*t),y=Math.round(7.5-sy*t);if(g[y]?.[x]==='F')g[y][x]='T';}
  g[8][8]=g[8][8]==='F'?'C':g[8][8];
  return join(g);
}
export const COMPASS_PALETTE:Palette={K:'#1b1b1b',R:'#b9b9b9',r:'#7b7b7b',F:'#3b3b3b',N:'#e32b2b',T:'#d6d6d6',C:'#ffffff'};
/** Clock: gold rim around a day/night disc that turns once a day (sun on top at noon, moon on top at midnight). */
export function clockGrid(frame:number):Grid{
  const g=dial(),turn=(((frame%CLOCK_FRAMES)+CLOCK_FRAMES)%CLOCK_FRAMES)/CLOCK_FRAMES*Math.PI*2,c=Math.cos(-turn),s=Math.sin(-turn);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    if(g[y][x]!=='F')continue;
    const dx=x-7.5,dy=y-7.5,rx=dx*c-dy*s,ry=dx*s+dy*c;// dial coordinates (sun at -y)
    const day=ry<0;
    g[y][x]=Math.abs(rx)<1.2&&Math.abs(ry+3)<1.2?'S':Math.abs(rx)<1.2&&Math.abs(ry-3)<1.2?'M':day?'D':'N';
  }
  g[1][7]='P';g[1][8]='P';
  return join(g);
}
export const CLOCK_PALETTE:Palette={K:'#3a2a05',R:'#f5d33a',r:'#b8860b',D:'#6aa7ff',N:'#1b2347',S:'#ffe25a',M:'#e6e6f2',P:'#ffffff'};
export const compassUrl=(frame:number)=>cached(`compass:${frame}`,()=>open(16,16)+gridSvg(compassGrid(frame),COMPASS_PALETTE)+'</svg>');
export const clockUrl=(frame:number)=>cached(`clock:${frame}`,()=>open(16,16)+gridSvg(clockGrid(frame),CLOCK_PALETTE)+'</svg>');
/** Frame index for an angle in radians clockwise from up. */
export const dialFrame=(angle:number,frames:number)=>((Math.round(angle/(Math.PI*2)*frames)%frames)+frames)%frames;
