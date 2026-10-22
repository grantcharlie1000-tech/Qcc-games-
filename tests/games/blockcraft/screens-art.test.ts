import {describe,expect,test} from 'vitest';
import {createFakeGame} from './helpers/fake-game';
import {createInventory} from '../../../src/games/blockcraft/items/inventory';
import {ScreenController,type ScreenView} from '../../../src/games/blockcraft/ui/screen-controller';
import type {ScreenBuild} from '../../../src/games/blockcraft/ui/screen-common';
import {stateFor} from '../../../src/games/blockcraft/data/blocks';
import type {BlockEntity,FurnaceEntity} from '../../../src/games/blockcraft/engine/contracts';
import {ARROW_GRID,BUTTON_GRID,DESTROY_GRID,EMPTY_SLOT_GRIDS,FIGURE_GRID,FIGURE_PALETTE,FLAME_GRID,GUI_COLOURS,KNOB_GRID,PANEL_GRID,PANEL_PALETTE,
  SLOT_GRID,SLOT_PALETTE,SMALL_ARROW_GRID,TAB_HEIGHT,TAB_WIDTH,TOOL_ICON_GRIDS,arrowGrid,figureSvg,guiArtProperties,knobOffset,pixelTextHtml,pixelTextSvg,
  scrollForKnob,shade,tabGrid} from '../../../src/games/blockcraft/ui/screen-art';
import {textWidth} from '../../../src/games/blockcraft/ui/hud-art';
import {INVENTORY_LAYOUT} from '../../../src/games/blockcraft/ui/screen-inventory';
import {CRAFTING_LAYOUT} from '../../../src/games/blockcraft/ui/screen-crafting';
import {FURNACE_LAYOUT,furnaceGauges} from '../../../src/games/blockcraft/ui/screen-furnace';
import {chestLayout} from '../../../src/games/blockcraft/ui/screen-chest';
import {CREATIVE_LAYOUT,tabPosition} from '../../../src/games/blockcraft/ui/screen-creative';
import {CREATIVE_TABS} from '../../../src/games/blockcraft/ui/screen-catalog';
import {tooltipColour} from '../../../src/games/blockcraft/ui/screen-tooltip';
import {setCount} from '../../../src/games/blockcraft/ui/screens';

const dims=(grid:readonly string[])=>[grid[0].length,grid.length];
const rotate=(grid:readonly string[],swap:Record<string,string>)=>[...grid].reverse().map(r=>[...r].reverse().map(c=>swap[c]??c).join(''));

describe('vanilla GUI art',()=>{
  test('the panel has a black outline with cut corners, 2 px white top-left and 2 px dark bottom-right, light grey inside',()=>{
    expect(dims(PANEL_GRID)).toEqual([9,9]);
    expect(PANEL_GRID.every(r=>r.length===9)).toBe(true);
    // Outline: the outermost ring is black or transparent (the cut corners).
    expect(PANEL_GRID[0]).toBe('..KKKKK..');expect(PANEL_GRID[8]).toBe('..KKKKK..');
    expect(PANEL_GRID.map(r=>r[0]).join('')).toBe('..KKKKK..');
    // The edge rows and columns the 9-slice stretches: K, W, W, G from the top and left; G, S, S, K at the bottom and right.
    expect(PANEL_GRID.map(r=>r[4]).join('')).toBe('KWWGGGSSK');
    expect(PANEL_GRID[4]).toBe('KWWGGGSSK');
    // Turned half a turn the panel is itself with light and dark swapped.
    expect(rotate(PANEL_GRID,{W:'S',S:'W'})).toEqual([...PANEL_GRID]);
    expect(PANEL_PALETTE).toEqual({K:'#000000',W:'#ffffff',G:'#c6c6c6',S:'#555555'});
  });
  test('slots are sunken: dark top and left, white bottom and right, grey corners between',()=>{
    expect([...SLOT_GRID]).toEqual(['DDG','DGW','GWW']);
    expect(SLOT_PALETTE).toEqual({D:'#373737',G:'#8b8b8b',W:'#ffffff'});
    expect(dims(BUTTON_GRID)).toEqual([5,5]);
  });
  test('creative tabs are 26×32; a selected tab flows into the panel, straight down at its sides in the edge columns',()=>{
    for(const top of [true,false])for(const selected of [true,false])for(const edge of [null,'left','right'] as const){
      const g=tabGrid(top,selected,edge);
      expect(dims(g)).toEqual([TAB_WIDTH,TAB_HEIGHT]);
      expect(g.every(r=>r.length===TAB_WIDTH&&/^[.KWGS]+$/.test(r))).toBe(true);
    }
    const top=tabGrid(true,true),bottom=tabGrid(false,true);
    // The rounded outer end: transparent corners, black outline across.
    expect(top[0]).toBe(`..${'K'.repeat(22)}..`);expect(bottom[31]).toBe(`..${'K'.repeat(22)}..`);
    // Where it covers the panel's border the selected tab is open: no outline across the panel side.
    expect(top[31]).not.toContain('K');expect(bottom[0]).not.toContain('K');
    // In the left column the tab continues the panel's left border; in a middle column it turns into the panel's top edge.
    expect(tabGrid(true,true,'left')[30].slice(0,4)).toBe('KWWG');expect(top[30].slice(0,4)).toBe('WWWG');
    expect(tabGrid(true,true,'right')[30].slice(-4)).toBe('GSSK');
    expect(tabGrid(false,true,'right')[1].slice(-4)).toBe('GSSK');
  });
  test('arrows narrow to a one-pixel tip; the furnace flame and knob have vanilla sizes',()=>{
    expect(dims(ARROW_GRID)).toEqual([22,15]);expect(dims(SMALL_ARROW_GRID)).toEqual([16,13]);
    for(const g of [ARROW_GRID,SMALL_ARROW_GRID]){
      const tip=g.map(r=>r[r.length-1]).join('');
      expect(tip.replace(/\./g,'')).toBe('#');expect(tip.indexOf('#')).toBe((g.length-1)/2);
      expect([...g].reverse()).toEqual([...g]);// mirror image top to bottom
      expect(g[(g.length-1)/2][0]).toBe('#');expect(g[0][0]).toBe('.');
    }
    expect(arrowGrid(22,15,5,9)).toEqual(ARROW_GRID);
    expect(dims(FLAME_GRID)).toEqual([14,14]);expect(FLAME_GRID.every(r=>r.length===14)).toBe(true);
    expect(dims(KNOB_GRID)).toEqual([12,15]);
  });
  test('empty slot silhouettes, the destroy cross, tool icons and the figure fit their grids',()=>{
    for(const [name,g] of Object.entries(EMPTY_SLOT_GRIDS)){
      expect(dims(g),name).toEqual([16,16]);expect(g.every(r=>r.length===16&&/^[.oi]+$/.test(r)),name).toBe(true);
      if(name!=='feet')expect(g.map(r=>[...r].reverse().join('')),name).toEqual([...g]);
    }
    expect(dims(DESTROY_GRID)).toEqual([16,16]);
    for(const g of Object.values(TOOL_ICON_GRIDS)){expect(dims(g)).toEqual([12,12]);expect(g.every(r=>r.length===12)).toBe(true);}
    expect(dims(FIGURE_GRID)).toEqual([16,32]);
    expect(FIGURE_GRID.every(r=>r.length===16&&[...r].every(c=>c==='.'||FIGURE_PALETTE[c]))).toBe(true);
  });
  test('the preview figure wears each armour piece in its material colour, shaded darker at the bottom and right',()=>{
    const bare=figureSvg([null,null,null,null]);
    expect(bare).toContain('<svg');expect(bare).not.toContain('#d8d8d8');
    const dressed=figureSvg([{id:'diamond_helmet',count:1},{id:'iron_chestplate',count:1},null,{id:'leather_boots',count:1}]);
    expect(dressed).toContain('fill="#47d6cf"');expect(dressed).toContain('fill="#d8d8d8"');expect(dressed).toContain('fill="#8d5a34"');
    expect(dressed).toContain(`fill="${shade('#d8d8d8',.72)}"`);
    expect(shade('#ffffff',.5)).toBe('#808080');expect(shade('#123456',1)).toBe('#123456');
  });
  test('the stylesheet gets every piece of art as a url(...) that fits a single-quoted CSS string',()=>{
    const props=guiArtProperties();
    for(const name of ['--bc-art-panel','--bc-art-slot','--bc-art-arrow','--bc-art-arrow-on','--bc-art-flame','--bc-art-flame-on','--bc-art-knob','--bc-art-knob-off',
      '--bc-art-empty-head','--bc-art-empty-offhand','--bc-art-destroy','--bc-art-icon-close','--bc-art-icon-book','--bc-art-tab-top','--bc-art-tab-top-on-left',
      '--bc-art-tab-bottom-on-right','--bc-art-button-hover'])expect(props[name],name).toMatch(/^url\('data:image\/svg\+xml,[^']+'\)$/);
    expect(Object.keys(props).length).toBeGreaterThanOrEqual(29);
  });
});

describe('pixel text',()=>{
  test('titles are 9 px tall in the GUI font, without a shadow; tooltips and counts drop a quarter-brightness shadow',()=>{
    const plain=pixelTextSvg('Chest',GUI_COLOURS.title,false),shadowed=pixelTextSvg('Chest','#ffffff',true);
    expect(plain).toContain(`width="${textWidth('Chest')}" height="9"`);
    expect(plain).toContain('fill="#404040"');expect(plain).not.toContain('fill="#101010"');
    expect(shadowed).toContain('fill="#3f3f3f"');expect(shadowed).toContain('fill="#ffffff"');
  });
  test('the text stays in the DOM over its art; characters outside the font fall back to the CSS pixel-style font',()=>{
    const html=pixelTextHtml('Large Chest',GUI_COLOURS.title);
    expect(html).toContain('>Large Chest</span>');expect(html).toContain(`--tw:${textWidth('Large Chest')}`);expect(html).toMatch(/url\('data:image\/svg\+xml,/);
    const odd=pixelTextHtml('Café <b>',GUI_COLOURS.title);
    expect(odd).toContain('bc-px-css');expect(odd).toContain('Café &lt;b&gt;');expect(odd).not.toContain('url(');
  });
  test('tooltip lines take vanilla colours: white name, blue armour, dark green attack, grey notes',()=>{
    expect(tooltipColour('Iron Chestplate',0).colour).toBe('#ffffff');
    expect(tooltipColour(' +6 Armor',2).colour).toBe('#5555ff');
    expect(tooltipColour(' 7 Attack Damage',2).colour).toBe('#00aa00');
    expect(tooltipColour('When in Main Hand:',1)).toEqual({colour:'#aaaaaa',cls:'bc-tip-info'});
  });
  test('stack counts are pixel digits sized by their length; one item shows no count',()=>{
    const props=new Map<string,string>();
    const el={textContent:'',style:{backgroundImage:'',setProperty:(k:string,v:string)=>props.set(k,v),removeProperty:(k:string)=>props.delete(k)}};
    setCount(el as unknown as HTMLElement,64);
    expect(el.textContent).toBe('64');expect(props.get('--n')).toBe('2');expect(el.style.backgroundImage).toMatch(/^url\("data:image\/svg\+xml,/);
    setCount(el as unknown as HTMLElement,1);
    expect(el.textContent).toBe('');expect(props.has('--n')).toBe(false);expect(el.style.backgroundImage).toBe('');
  });
});

describe('gauges and scrollbar',()=>{
  test('the furnace flame and arrow move in whole GUI pixels like vanilla',()=>{
    expect(furnaceGauges(0,0)).toEqual({flameRows:0,arrowColumns:0});
    expect(furnaceGauges(1,1)).toEqual({flameRows:14,arrowColumns:22});
    expect(furnaceGauges(.75,.4)).toEqual({flameRows:11,arrowColumns:9});
    expect(furnaceGauges(.01,.01)).toEqual({flameRows:2,arrowColumns:1});
    expect(furnaceGauges(Number.NaN,-1)).toEqual({flameRows:0,arrowColumns:0});
    expect(furnaceGauges(5,5)).toEqual({flameRows:14,arrowColumns:22});
  });
  test('the scrollbar knob maps the picker scroll onto its 97 px travel and back',()=>{
    const travel=CREATIVE_LAYOUT.scroll.travel;
    expect(travel).toBe(97);
    expect(knobOffset(0,900,300,travel)).toBe(0);
    expect(knobOffset(600,900,300,travel)).toBe(97);
    expect(knobOffset(300,900,300,travel)).toBeCloseTo(48.5);
    expect(knobOffset(5000,900,300,travel)).toBe(97);
    expect(knobOffset(0,300,300,travel)).toBe(0);// nothing to scroll
    expect(scrollForKnob(48.5,900,300,travel)).toBeCloseTo(300);
    expect(scrollForKnob(-20,900,300,travel)).toBe(0);expect(scrollForKnob(500,900,300,travel)).toBe(600);
    expect(scrollForKnob(10,300,300,travel)).toBe(0);
  });
});

/** GUI positions of the slot buttons and grids in a build's HTML, by their aria-label. */
function positions(html:string):Map<string,[number,number]>{
  const out=new Map<string,[number,number]>();
  for(const m of html.matchAll(/<(?:button|div)[^>]*class="[^"]*bc-at[^"]*"[^>]*>/g)){
    const tag=m[0],xy=/--x:(-?\d+);--y:(-?\d+)/.exec(tag),label=/aria-label="([^"]*)"/.exec(tag);
    if(xy&&label)out.set(label[1],[Number(xy[1]),Number(xy[2])]);
  }
  return out;
}
function setup(mode:'survival'|'creative'='survival'){
  const game=createFakeGame({mode});
  game.inventory=createInventory(game);game.inventory.init?.();
  game.screenChanged=open=>{if(open&&game.state==='playing')game.setState('screen');else if(!open&&game.state==='screen')game.setState('playing');};
  const shown:ScreenBuild[]=[];
  const view={show(b:ScreenBuild){shown.push(b);},hide(){},draw(){},toast(){},dispose(){}};
  const ui=new ScreenController(game,view as ScreenView);ui.init();game.ui=ui;
  return{game,ui,last:()=>shown[shown.length-1]};
}

describe('vanilla screen layouts',()=>{
  test('survival inventory: 176×166 with armour, preview, offhand, the 2×2 grid, result and book button at vanilla positions',()=>{
    const {ui,last}=setup();ui.open('inventory');
    const b=last(),p=positions(b.html);
    expect(b.gui).toEqual({width:176,height:166});expect(b.titleAt).toBe('hidden');expect(b.book).toEqual({x:104,y:61});
    expect(p.get('Armor')).toEqual([7,7]);expect(p.get('Offhand slot')).toEqual([76,61]);
    expect(p.get('Crafting grid')).toEqual([97,17]);expect(p.get('Crafting result')).toEqual([153,27]);
    expect(p.get('Inventory')).toEqual([7,83]);expect(p.get('Hotbar')).toEqual([7,141]);
    expect(b.html).toContain('data-figure');expect(b.html).toContain(`--w:${INVENTORY_LAYOUT.preview.width};--h:${INVENTORY_LAYOUT.preview.height}`);
    expect(b.html).toContain('bc-arrow bc-arrow-small');expect(b.html).toContain('>Crafting</span>');
    // No "Inventory" label in the survival inventory, like vanilla.
    expect(b.html).not.toContain('>Inventory</span>');
  });
  test('crafting table and furnace: 176×166, the large output frame, labels where vanilla draws them',()=>{
    const {game,ui,last}=setup();game.flat(60);
    game.world.set(0,61,0,stateFor('crafting_table',{})!.id);game.player.teleport(.5,61,2.5);
    ui.open('crafting_table',{x:0,y:61,z:0});
    let b=last(),p=positions(b.html);
    expect(b.gui).toEqual(CRAFTING_LAYOUT.size);expect(b.titleAt).toEqual({x:29,y:6});expect(b.book).toEqual({x:5,y:34});
    expect(p.get('Crafting grid')).toEqual([29,16]);expect(p.get('Crafting result')).toEqual([119,30]);
    expect(b.html).toMatch(/bc-s-result bc-s-big|bc-s-big/);expect(b.html).toContain('>Inventory</span>');
    const f:FurnaceEntity={kind:'furnace',input:null,fuel:null,output:null,burn:0,burnTotal:0,cook:0,xp:0};
    game.world.set(1,61,0,stateFor('furnace',{facing:'south',lit:false})!.id);
    game.blockEntities={get:()=>f};
    ui.open('furnace',{x:1,y:61,z:0});
    b=last();p=positions(b.html);
    expect(b.gui).toEqual(FURNACE_LAYOUT.size);expect(b.titleAt).toBe('center');expect(b.book).toBeUndefined();
    expect(p.get('Furnace input')).toEqual([55,16]);expect(p.get('Furnace fuel')).toEqual([55,52]);expect(p.get('Furnace output')).toEqual([111,30]);
    expect(b.html).toContain('bc-flame bc-at" style="--x:56;--y:36"');expect(b.html).toContain('bc-arrow bc-progress bc-at" style="--x:80;--y:35"');
  });
  test('chests are 3 rows (176×168) and large chests 6 rows (176×222), the inventory 13 px under the container',()=>{
    expect(chestLayout(3)).toEqual({size:{width:176,height:168},title:{x:8,y:6},container:{x:7,y:17},main:84,label:74});
    expect(chestLayout(6)).toEqual({size:{width:176,height:222},title:{x:8,y:6},container:{x:7,y:17},main:138,label:128});
    const {game,ui,last}=setup();game.flat(60);
    const chests:Record<string,BlockEntity>={};
    for(const x of [0,1]){game.world.set(x,61,0,stateFor('chest',{facing:'south'})!.id);chests[x]={kind:'chest',items:new Array(27).fill(null)};}
    game.blockEntities={get:(x,y,z)=>y===61&&z===0?chests[x]:undefined};game.player.teleport(.5,61,2.5);
    ui.open('chest',{x:0,y:61,z:0});
    const b=last(),p=positions(b.html);
    expect(b.title).toBe('Large Chest');expect(b.gui).toEqual({width:176,height:222});
    expect(p.get('Large Chest')).toEqual([7,17]);expect(p.get('Inventory')).toEqual([7,138]);expect(p.get('Hotbar')).toEqual([7,196]);
    expect(b.html).toContain('style="--x:8;--y:128">');
  });
  test('creative: 195×136 with tabs above and below (Search and Survival Inventory in the right column), picker, scrollbar, hotbar',()=>{
    const pos=Object.fromEntries(CREATIVE_TABS.map(t=>[t.id,tabPosition(t)]));
    expect(pos.building).toEqual({x:0,y:-28,edge:'left'});expect(pos.colored).toEqual({x:27,y:-28,edge:null});
    expect(pos.redstone).toEqual({x:108,y:-28,edge:null});expect(pos.search).toEqual({x:169,y:-28,edge:'right'});
    expect(pos.tools).toEqual({x:0,y:132,edge:'left'});expect(pos.spawn_eggs).toEqual({x:108,y:132,edge:null});expect(pos.inventory).toEqual({x:169,y:132,edge:'right'});
    const {ui,last}=setup('creative');ui.open('creative');
    let b=last(),p=positions(b.html);
    expect(b.gui).toEqual({width:195,height:136,above:28,below:28});expect(b.titleAt).toEqual({x:8,y:6});
    expect(p.get('Building Blocks')).toEqual([8,17]);expect(p.get('Hotbar')).toEqual([8,111]);
    expect(b.html).toContain('class="bc-scroll bc-at" style="--x:174;--y:17" data-scroll');
    expect(b.html).toContain('data-tab="search" data-row="top" data-edge="right"');
    ui.setTab('search');b=last();
    expect(b.html).toContain('class="bc-search bc-at" style="--x:80;--y:4"');
    ui.setTab('inventory');b=last();p=positions(b.html);
    expect(b.titleAt).toBe('hidden');
    expect(p.get('Helmet slot')).toEqual([53,5]);expect(p.get('Chestplate slot')).toEqual([53,32]);
    expect(p.get('Leggings slot')).toEqual([107,5]);expect(p.get('Boots slot')).toEqual([107,32]);
    expect(p.get('Offhand slot')).toEqual([34,19]);expect(p.get('Destroy item slot')).toEqual([172,111]);
    expect(p.get('Inventory')).toEqual([8,53]);expect(p.get('Hotbar')).toEqual([8,111]);
  });
  test('the advancements window keeps a flowing layout inside the same panel',()=>{
    const {ui,last}=setup();ui.open('advancements');
    expect(last().gui).toBeUndefined();expect(last().titleAt).toBeUndefined();
  });
});
