// Vanilla-look GUI art for the inventory-like screens, drawn here as palette grids (one character per GUI pixel, '.'
// transparent) and rendered to crisp SVG data URLs. All of it is original pixel art made to read like the vanilla Java
// container GUI at a glance: the light grey panel with its black outline and 2 px white / dark grey bevel, sunken
// slots, the crafting arrow, the furnace flame and progress arrow, creative tabs and the scrollbar knob, the armour and
// offhand slot silhouettes, the player preview figure and small tool icons. Text uses the HUD's pixel font
// (ui/hud-art.ts) so the screens and the HUD share one GUI font. screens.css scales a GUI pixel to --bc-u.
import {itemDef,type ItemStack} from '../data/items';
import {FONT_GLYPHS,gridSvg,hasGlyphs,shadowColour,svgUrl,textWidth,type Grid,type Palette} from './hud-art';

/** Vanilla GUI colours. */
export const GUI_COLOURS={panel:'#c6c6c6',hi:'#ffffff',lo:'#555555',outline:'#000000',slot:'#8b8b8b',slotLo:'#373737',
  title:'#404040',tooltip:'#100010',white:'#ffffff'} as const;

const open=(w:number,h:number)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`;
/** A whole grid as one SVG image. */
export function gridImage(grid:Grid,palette:Palette):string{return`${open(grid[0].length,grid.length)}${gridSvg(grid,palette)}</svg>`;}
const urls=new Map<string,string>(),URL_LIMIT=512;
/** Cached data URL (bounded: pixel text is open-ended). Apostrophes are escaped so the URL fits url('…'). */
export function artUrl(key:string,make:()=>string):string{
  let u=urls.get(key);
  if(!u){if(urls.size>=URL_LIMIT)urls.clear();u=svgUrl(make()).replace(/'/g,'%27');urls.set(key,u);}
  return u;
}

// ---- Frames (9-slice sources for CSS border-image) -----------------------------------------------------------
/** The container panel, sliced 4 px: black outline with cut corners, 2 px white top-left and 2 px dark bottom-right
 *  bevel, light grey inside. The top-right and bottom-left corners turn from light to dark through a grey pixel. */
export const PANEL_GRID:Grid=[
  '..KKKKK..',
  '.KWWWWWK.',
  'KWWWWWGSK',
  'KWWWGGSSK',
  'KWWGGGSSK',
  'KWWGGSSSK',
  'KWGSSSSSK',
  '.KSSSSSK.',
  '..KKKKK..'];
export const PANEL_PALETTE:Palette={K:GUI_COLOURS.outline,W:GUI_COLOURS.hi,G:GUI_COLOURS.panel,S:GUI_COLOURS.lo};
/** A sunken slot, sliced 1 px: dark top and left edge, white bottom and right edge, grey corners between them. */
export const SLOT_GRID:Grid=['DDG','DGW','GWW'];
export const SLOT_PALETTE:Palette={D:GUI_COLOURS.slotLo,G:GUI_COLOURS.slot,W:GUI_COLOURS.hi};
/** One whole 18×18 sunken slot (the same edges as SLOT_GRID), tiled under the creative picker so all of its 9×5 slots
 *  and the rest of a partly filled last row show their frames like vanilla, whatever the tab holds. */
export const SLOT_TILE_GRID:Grid=Array.from({length:18},(_,y)=>y===0?'D'.repeat(17)+'G':y===17?'G'+'W'.repeat(17):'D'+'G'.repeat(16)+'W');
/** A raised button, sliced 2 px: outline, light top-left edge, face, dark bottom-right edge. */
export const BUTTON_GRID:Grid=['KKKKK','KHHHK','KHBDK','KDDDK','KKKKK'];
export const BUTTON_PALETTES={
  normal:{K:'#000000',H:'#aaaaaa',B:'#6f6f6f',D:'#4c4c4c'},
  hover:{K:'#ffffff',H:'#c2c2c2',B:'#8c8c8c',D:'#5e5e5e'},
  pressed:{K:'#000000',H:'#3a3a3a',B:'#5a5a5a',D:'#8a8a8a'}
} as const satisfies Record<string,Palette>;

// ---- Creative tabs ---------------------------------------------------------------------------------------------
export const TAB_WIDTH=26,TAB_HEIGHT=32;
/** How far a tab reaches into the panel (it covers the panel's border there). */
export const TAB_OVERLAP=4;
const row=(left:string,fill:string,right:string)=>left+fill.repeat(TAB_WIDTH-left.length-right.length)+right;
/** A 26×32 creative tab. Top tabs sit above the panel with their last 4 rows over its top border; bottom tabs mirror
 *  that below. A selected tab is panel grey and its bevel flows into the panel's (straight down at the panel's side
 *  when `edge` puts it in the left or right column); an unselected tab is darker and drawn behind the panel. */
export function tabGrid(top:boolean,selected:boolean,edge:'left'|'right'|null=null):Grid{
  const body=row('KWWG','G','GSSK');
  const rows:string[]=[];
  if(top){
    rows.push(row('..','K','..'),row('.K','W','K.'),row('K','W','GSK'),row('KWWW','G','SSK'));
    while(rows.length<TAB_HEIGHT-TAB_OVERLAP)rows.push(body);
    if(!selected){while(rows.length<TAB_HEIGHT)rows.push(body);}
    else{
      const l=edge==='left',r=edge==='right';
      rows.push(body);
      rows.push(row(l?'KWWG':'WWWG','G',r?'GSSK':'GSWW'));
      rows.push(row(l?'KWWG':'WWWG','G',r?'GSSK':'GWWW'));
      rows.push(row(l?'KWWG':'GGGG','G',r?'GSSK':'GGGG'));
    }
  }else{
    const l=edge==='left',r=edge==='right';
    if(!selected)for(let i=0;i<TAB_OVERLAP;i++)rows.push(body);
    else rows.push(row(l?'KWWG':'GGGG','G',r?'GSSK':'GGGG'),row(l?'KWWG':'SSWG','G',r?'GSSK':'GSSS'),
      row(l?'KWWG':'SSWG','G',r?'GSSK':'GSSS'),body);
    while(rows.length<TAB_HEIGHT-4)rows.push(body);
    rows.push(row('KWWG','G','SSSK'),row('KWGS','S','SSSK'),row('.KSS','S','SK.'),row('..KK','K','KK..'));
  }
  return rows;
}
export const TAB_PALETTES={
  selected:PANEL_PALETTE,
  unselected:{K:GUI_COLOURS.outline,W:'#dcdcdc',G:'#a4a4a4',S:'#4f4f4f'}
} as const satisfies Record<string,Palette>;

// ---- Gauges ------------------------------------------------------------------------------------------------------
/** A right-pointing arrow: a shaft rows [shaftTop, shaftBottom] wide up to the head, then a head narrowing by one pixel
 *  per column down to a single-pixel tip. */
export function arrowGrid(width:number,height:number,shaftTop:number,shaftBottom:number):Grid{
  const head=(height+1)>>1,start=width-head;
  return Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>{
    if(x<start)return y>=shaftTop&&y<=shaftBottom?'#':'.';
    const k=x-start;return y>=k&&y<=height-1-k?'#':'.';
  }).join(''));
}
/** The crafting table and furnace arrow (22×15) and the survival inventory's smaller one (16×13). */
export const ARROW_GRID=arrowGrid(22,15,5,9);
export const SMALL_ARROW_GRID=arrowGrid(16,13,4,8);
/** The furnace flame (14×14): dark red edge, red, orange and yellow towards a pale core. Unlit, the same shape is grey. */
export const FLAME_GRID:Grid=[
  '......K.......',
  '......KK......',
  '.....KrK......',
  '.....KrrK.....',
  '....KrorK..K..',
  '.K..KrooK.KrK.',
  '.KK.KrooorKrK.',
  '.KrKKroyoorrK.',
  'KroKroyyoorroK',
  'KrooroyyyoorrK',
  'KrooyyywyyoorK',
  'KroyyywwwyyorK',
  '.KroyywwwyyoK.',
  '..KKrrooorrKK.'];
export const FLAME_PALETTE:Palette={K:'#7a1f04',r:'#c8360c',o:'#f2711c',y:'#ffc93c',w:'#fff3b0'};
/** One colour for every pixel of a grid (unlit flame, empty arrow). */
export const flat=(grid:Grid,colour:string):Palette=>Object.fromEntries([...new Set(grid.join(''))].filter(c=>c!=='.').map(c=>[c,colour]));

// ---- Creative scrollbar ------------------------------------------------------------------------------------------
export const KNOB_WIDTH=12,KNOB_HEIGHT=15;
export const KNOB_GRID:Grid=['KKKKKKKKKKKK','KWWWWWWWWWGK',...Array.from({length:11},()=>'KWGGGGGGGGSK'),'KGSSSSSSSSSK','KKKKKKKKKKKK'];
export const KNOB_PALETTES={
  enabled:{K:'#000000',W:'#ffffff',G:'#c6c6c6',S:'#555555'},
  disabled:{K:'#000000',W:'#a9a9a9',G:'#8b8b8b',S:'#555555'}
} as const satisfies Record<string,Palette>;
/** Knob offset (GUI px from the top of its travel) for a scroll position, like vanilla's scrollOffs × travel. */
export function knobOffset(scrollTop:number,scrollHeight:number,clientHeight:number,travel:number):number{
  const room=scrollHeight-clientHeight;
  if(!(room>0)||!(travel>0))return 0;
  return Math.max(0,Math.min(travel,scrollTop/room*travel));
}
/** Scroll position for a knob dragged to `offset` (inverse of knobOffset). */
export function scrollForKnob(offset:number,scrollHeight:number,clientHeight:number,travel:number):number{
  const room=scrollHeight-clientHeight;
  if(!(room>0)||!(travel>0))return 0;
  return Math.max(0,Math.min(1,offset/travel))*room;
}

// ---- Empty slot silhouettes ----------------------------------------------------------------------------------------
/** Pale outlines of what fits in an empty armour or offhand slot (o outline, i inside). */
export const EMPTY_SLOT_GRIDS:Readonly<Record<'head'|'chest'|'legs'|'feet'|'offhand',Grid>>={
  head:[
    '................','................','................','................',
    '....oooooooo....','...oiiiiiiiio...','..oiiiiiiiiiio..','..oiiiiiiiiiio..','..oiiiiiiiiiio..',
    '..oiiiooooiiio..','..oiio....oiio..','..oooo....oooo..',
    '................','................','................','................'],
  chest:[
    '................','................',
    '..oooo....oooo..','.oiiiio..oiiiio.','.oiiiiiooiiiiio.','.oiiiiiiiiiiiio.','..ooiiiiiiiioo..',
    '...oiiiiiiiio...','...oiiiiiiiio...','...oiiiiiiiio...','...oiiiiiiiio...','...oiiiiiiiio...','...oooooooooo...',
    '................','................','................'],
  legs:[
    '................','................',
    '...oooooooooo...','...oiiiiiiiio...','...oiiiiiiiio...',
    '...oiiiooiiio...','...oiiiooiiio...','...oiiiooiiio...','...oiiiooiiio...','...oiiiooiiio...','...oiiiooiiio...',
    '...oiiiooiiio...','...oooooooooo...',
    '................','................','................'],
  feet:[
    '................','................','................','................','................',
    '...oooo....oooo.','...oiio....oiio.','...oiio....oiio.','...oiio....oiio.',
    '.ooiiio..ooiiio.','.oiiiio..oiiiio.','.oooooo..oooooo.',
    '................','................','................','................'],
  offhand:[
    '................','................',
    '...oooooooooo...','...oiiiiiiiio...','...oiiiiiiiio...','...oiiiiiiiio...','...oiiiiiiiio...',
    '...oiiiiiiiio...','...oiiiiiiiio...','...oiiiiiiiio...','....oiiiiiio....','.....oiiiio.....','......oooo......',
    '................','................','................']
};
export const EMPTY_SLOT_PALETTE:Palette={o:'#b3b3b3',i:'#999999'};
/** The creative Destroy Item slot's red cross. */
export const DESTROY_GRID:Grid=Array.from({length:16},(_,y)=>Array.from({length:16},(_,x)=>{
  if(x<3||x>12||y<3||y>12)return '.';
  const a=x-y,b=x+y-15;
  if(a===0||a===1||b===0||b===-1)return 'r';
  if(a===2||b===1)return 's';
  return '.';
}).join(''));
export const DESTROY_PALETTE:Palette={r:'#b01c1c',s:'#5a0c0c'};

// ---- Tool icons (12×12, white with the GUI shadow) -------------------------------------------------------------------
const shadowed=(shape:readonly string[]):Grid=>{
  // '#' pixels in white, each casting a shadow pixel 1 right and down where nothing else is drawn.
  const h=shape.length+1,w=shape[0].length+1;
  return Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>{
    if(shape[y]?.[x]==='#')return '#';
    return shape[y-1]?.[x-1]==='#'?'s':'.';
  }).join(''));
};
export const TOOL_ICON_GRIDS:Readonly<Record<'close'|'quick'|'book',Grid>>={
  close:shadowed(['##......##.','###....###.','.###..###..','..######...','...####....','...####....','..######...','.###..###..','###....###.','##......##.','...........']),
  quick:shadowed(['.....#.....','.....##....','######.#...','######..#..','......###..','.....###...','#####.#....','#####......','...........','##########.','##########.']),
  book:['.KKKKKKKKK..','.KrrrrrrrPK.','.KrRRRRRrPK.','.KrRrrrRrPK.','.KrRRRRRrPK.','.KrrrrrrrPK.','.KrrrrrrrPK.','.KrrrrrrrPK.',
    '.KrrrrrrrPK.','.KKKKKKKKPK.','..KPPPPPPPK.','...KKKKKKKK.']
};
export const TOOL_ICON_PALETTES:Readonly<Record<'close'|'quick'|'book',Palette>>={
  close:{'#':'#ffffff',s:'#3f3f3f'},quick:{'#':'#ffffff',s:'#3f3f3f'},
  book:{K:'#2a1708',r:'#7a4a24',R:'#c99a52',P:'#f1e6c8'}
};

// ---- Player preview --------------------------------------------------------------------------------------------
/** An original blocky player seen from the front (16×32: head, shirt with sleeves, arms, trousers, shoes), coloured like
 *  the default player skin of the vanilla preview: dark hair, warm skin, teal shirt, blue trousers. */
export const FIGURE_GRID:Grid=[
  '....HHHHHHHH....','....HHHHHHHH....','....HhSSSShH....','....SSSSSSSS....',
  '....SEISSIES....','....SSSnnSSS....','....SSmmmmSS....','....sSSSSSSs....',
  'TTTTTTTttTTTTTTT','TTTTTTTTTTTTTTTT','TTTtTTTTTTTTtTTT','tTTtTTTTTTTTtTTt',
  'SSSsTTTTTTTTsSSS','SSSsTTTTTTTTsSSS','SSSstTTTTTTtsSSS','SSSsTTTTTTTTsSSS',
  'SSSstTTTTTTtsSSS','SSSsTTTTTTTTsSSS','sSSsPPPPPPPPsSSs','ssssPPPPPPPPssss',
  '....PPPppPPP....','....PPPppPPP....','....PPPppPPP....','....PPPppPPP....',
  '....PPPppPPP....','....PPPppPPP....','....PPPppPPP....','....PPPppPPP....',
  '....pPPppPPp....','....GGGggGGG....','....GGGggGGG....','....gggggggg....'];
export const FIGURE_PALETTE:Palette={H:'#2e1f0f',h:'#3f2b16',S:'#b98a6e',s:'#9e6f56',E:'#ffffff',I:'#4b3d8f',n:'#8c5a43',m:'#6a3c2b',
  T:'#00a2a6',t:'#008589',P:'#3b3591',p:'#2c2774',G:'#6e6e6e',g:'#555555'};
const MATERIAL_COLOUR:Record<string,string>={leather:'#8d5a34',golden:'#f4c638',iron:'#d8d8d8',diamond:'#47d6cf',chainmail:'#9a9a9a',netherite:'#4a4244'};
/** The preview figure wearing `armor` (head, chest, legs, feet): each worn piece is drawn over it in its material colour. */
export function figureSvg(armor:readonly (ItemStack|null)[]):string{
  const colour=(i:number)=>{const m=armor[i]&&itemDef(armor[i]!.id)?.armor?.material;return m?MATERIAL_COLOUR[m]??null:null;};
  const r=(x:number,y:number,w:number,h:number,fill:string)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  // A worn piece: its colour with a darker band along the bottom and the right, like the lit-from-the-left armour.
  const piece=(x:number,y:number,w:number,h:number,c:string)=>{const d=shade(c,.72);return r(x,y,w,h,c)+r(x,y+h-1,w,1,d)+r(x+w-1,y,1,h,d);};
  let out=gridSvg(FIGURE_GRID,FIGURE_PALETTE);
  const head=colour(0),chest=colour(1),legs=colour(2),feet=colour(3);
  if(head)out+=piece(3.5,-.5,9,3,head)+piece(3.5,2,1,4.5,head)+piece(11.5,2,1,4.5,head);
  if(chest)out+=piece(3.5,7.5,9,10.5,chest)+piece(-.5,7.5,4.5,4.5,chest)+piece(12,7.5,4.5,4.5,chest);
  if(legs)out+=piece(3.5,17.5,9,3,legs)+piece(3.5,20,4.5,8,legs)+piece(8,20,4.5,8,legs);
  if(feet)out+=piece(3.5,28.5,4.5,4,feet)+piece(8,28.5,4.5,4,feet);
  return`<svg viewBox="-1 -1 18 34" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${out}</svg>`;
}
/** A colour scaled towards black by `f` (0..1). */
export function shade(hex:string,f:number):string{
  const n=parseInt(hex.slice(1,7),16),c=(s:number)=>Math.max(0,Math.min(255,Math.round(((n>>s)&255)*f))).toString(16).padStart(2,'0');
  return`#${c(16)}${c(8)}${c(0)}`;
}

// ---- Pixel text ----------------------------------------------------------------------------------------------------
/** One line in the GUI pixel font, 9 px tall (the font's cell including the shadow row). Titles have no shadow like
 *  vanilla; tooltips and counts drop a quarter-brightness shadow 1 px right and down. */
export function pixelTextSvg(text:string,colour:string,shadow:boolean):string{
  const sh=shadowColour(colour);
  let x=0,back='',front='';
  for(const ch of text){
    const g=FONT_GLYPHS[ch];if(!g){x+=6;continue;}
    if(shadow)back+=gridSvg(g,{'#':sh},x+1,1);
    front+=gridSvg(g,{'#':colour},x,0);
    x+=g[0].length+1;
  }
  return`${open(Math.max(1,textWidth(text)),9)}${back}${front}</svg>`;
}
export const pixelTextUrl=(text:string,colour:string,shadow:boolean)=>artUrl(`t:${colour}:${shadow?1:0}:${text}`,()=>pixelTextSvg(text,colour,shadow));
const escText=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
/** Inline HTML for pixel-font text: the text stays in the DOM (assistive technology, find in page) drawn transparent
 *  over its pixel art. Text with characters outside the font falls back to the CSS pixel-style font stack. */
export function pixelTextHtml(text:string,colour:string,shadow=false,cls=''):string{
  const c=cls?` ${cls}`:'';
  if(!text||!hasGlyphs(text))return`<span class="bc-px bc-px-css${c}" style="color:${colour}${shadow?`;text-shadow:var(--bc-u) var(--bc-u) 0 ${shadowColour(colour)}`:''}">${escText(text)}</span>`;
  return`<span class="bc-px${c}" style="--tw:${textWidth(text)};background-image:url('${pixelTextUrl(text,colour,shadow)}')">${escText(text)}</span>`;
}

// ---- Art handed to the stylesheet ------------------------------------------------------------------------------------
const url=(key:string,grid:Grid,palette:Palette)=>`url('${artUrl(key,()=>gridImage(grid,palette))}')`;
/** CSS custom properties (name → url(...)) that screens.css draws the GUI with; set once on the screen layer. */
export function guiArtProperties():Record<string,string>{
  const props:Record<string,string>={
    '--bc-art-panel':url('panel',PANEL_GRID,PANEL_PALETTE),
    '--bc-art-slot':url('slot',SLOT_GRID,SLOT_PALETTE),
    '--bc-art-slot-tile':url('slot-tile',SLOT_TILE_GRID,SLOT_PALETTE),
    '--bc-art-button':url('button',BUTTON_GRID,BUTTON_PALETTES.normal),
    '--bc-art-button-hover':url('button-hover',BUTTON_GRID,BUTTON_PALETTES.hover),
    '--bc-art-button-on':url('button-on',BUTTON_GRID,BUTTON_PALETTES.pressed),
    '--bc-art-arrow':url('arrow',ARROW_GRID,flat(ARROW_GRID,GUI_COLOURS.slot)),
    '--bc-art-arrow-on':url('arrow-on',ARROW_GRID,flat(ARROW_GRID,GUI_COLOURS.white)),
    '--bc-art-arrow-small':url('arrow-small',SMALL_ARROW_GRID,flat(SMALL_ARROW_GRID,GUI_COLOURS.slot)),
    '--bc-art-flame':url('flame',FLAME_GRID,flat(FLAME_GRID,GUI_COLOURS.slot)),
    '--bc-art-flame-on':url('flame-on',FLAME_GRID,FLAME_PALETTE),
    '--bc-art-knob':url('knob',KNOB_GRID,KNOB_PALETTES.enabled),
    '--bc-art-knob-off':url('knob-off',KNOB_GRID,KNOB_PALETTES.disabled),
    '--bc-art-destroy':url('destroy',DESTROY_GRID,DESTROY_PALETTE)
  };
  for(const [k,g] of Object.entries(EMPTY_SLOT_GRIDS))props[`--bc-art-empty-${k}`]=url(`empty-${k}`,g,EMPTY_SLOT_PALETTE);
  for(const [k,g] of Object.entries(TOOL_ICON_GRIDS))props[`--bc-art-icon-${k}`]=url(`icon-${k}`,g,TOOL_ICON_PALETTES[k as keyof typeof TOOL_ICON_GRIDS]);
  for(const top of [true,false])for(const selected of [true,false])for(const edge of [null,'left','right'] as const){
    if(!selected&&edge)continue;
    const name=`--bc-art-tab-${top?'top':'bottom'}${selected?'-on':''}${edge?`-${edge}`:''}`;
    props[name]=url(name,tabGrid(top,selected,edge),selected?TAB_PALETTES.selected:TAB_PALETTES.unselected);
  }
  return props;
}
