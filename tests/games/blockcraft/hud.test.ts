import {describe,expect,test} from 'vitest';
import {heartIcons,foodIcons,armorIcons,airBubbles,xpFill,durabilityBar,attackIndicator,heldNameFade,heldNameOpacity,HealthTracker,
  regenIndex,compassAngle,sunAngle,clockText,hudLayout,facingInfo,debugLines,debugRightLines,heldName,hsvToRgb,tickRandom,barsView,stackHeights,
  type HeartInput,type BarsOptions} from '../../../src/games/blockcraft/ui/hud-model';
import {ICON_NAMES,iconGrid,iconSvg,iconPalette,digitsSvg,DIGIT_GLYPHS,hotbarSvg,xpBarSvg,compassGrid,clockGrid,dialFrame,COMPASS_FRAMES,CLOCK_FRAMES,
  selectionFrameSvg,offhandSvg,FONT_GLYPHS,hasGlyphs,textWidth,textSvg,shadowColour} from '../../../src/games/blockcraft/ui/hud-art';
import {optionLabel,nextDifficulty,keyLabel,controlRows,fovLabel,sensitivityFromSlider,sensitivityToSlider} from '../../../src/games/blockcraft/ui/menus-options';
import {ITEMS} from '../../../src/games/blockcraft/data/items';
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import type {InputBinding} from '../../../src/games/blockcraft/engine/contracts';

const hearts=(o:Partial<HeartInput>={})=>heartIcons({health:20,maxHealth:20,absorption:0,lagHealth:20,blinking:false,regenIndex:-1,poisoned:false,random:null,...o});

describe('hearts from survival state',()=>{
  test('full health shows ten full hearts in one row',()=>{
    const {icons,rows,rowHeight}=hearts();
    expect(icons).toHaveLength(10);expect(rows).toBe(1);expect(rowHeight).toBe(10);
    expect(icons.every(h=>h.fill==='full'&&h.absorb===null&&h.lost===null&&!h.blinkContainer&&h.type==='normal')).toBe(true);
    expect(icons.map(h=>h.x)).toEqual([0,8,16,24,32,40,48,56,64,72]);
    expect(icons.every(h=>h.up===0)).toBe(true);
  });
  test('7 health: three full hearts, one half heart and six empty containers',()=>{
    const fills=hearts({health:7,lagHealth:7}).icons.map(h=>h.fill);
    expect(fills).toEqual(['full','full','full','half',null,null,null,null,null,null]);
  });
  test('fractional health rounds up like vanilla',()=>{
    expect(hearts({health:6.2,lagHealth:7}).icons.map(h=>h.fill).slice(0,4)).toEqual(['full','full','full','half']);
  });
  test('absorption adds golden hearts on a second row',()=>{
    const {icons,rows,rowHeight}=hearts({absorption:3});
    expect(icons).toHaveLength(12);expect(rows).toBe(2);expect(rowHeight).toBe(10);
    expect(icons[10]).toMatchObject({absorb:'full',fill:null,row:1,col:0,x:0,up:10});
    expect(icons[11]).toMatchObject({absorb:'half',row:1,col:1,x:8});
    expect(icons.slice(0,10).every(h=>h.absorb===null)).toBe(true);
  });
  test('many rows compress the row height (minimum 3)',()=>{
    expect(hearts({maxHealth:40,health:40,lagHealth:40,absorption:20})).toMatchObject({rows:3,rowHeight:9});
    expect(hearts({maxHealth:200,health:200,lagHealth:200}).rowHeight).toBe(3);
  });
  test('while blinking, health lost since the last change shows as a whitened layer under the current hearts',()=>{
    const {icons}=hearts({health:8,lagHealth:13,blinking:true});
    expect(icons.every(h=>h.blinkContainer)).toBe(true);
    expect(icons.map(h=>h.lost)).toEqual(['full','full','full','full','full','full','half',null,null,null]);
    expect(icons.map(h=>h.fill)).toEqual(['full','full','full','full',null,null,null,null,null,null]);
    // Not blinking: the lost layer is hidden even when the lagging value differs.
    expect(hearts({health:8,lagHealth:13}).icons.every(h=>h.lost===null&&!h.blinkContainer)).toBe(true);
  });
  test('hearts shake by 0 or 1 pixel at 4 health or less, never with reduced motion (no random)',()=>{
    let n=0;const random=()=>(n++%2)*.9;
    const low=hearts({health:4,lagHealth:4,random}).icons;
    expect(low.map(h=>h.up)).toEqual([0,-1,0,-1,0,-1,0,-1,0,-1]);
    expect(hearts({health:4,lagHealth:4,random:null}).icons.every(h=>h.up===0)).toBe(true);
    // Absorption counts toward the threshold.
    expect(hearts({health:4,lagHealth:4,absorption:2,random:()=>.9}).icons.every(h=>h.up>=0)).toBe(true);
    expect(hearts({health:5,lagHealth:5,random:()=>.9}).icons.every(h=>h.up===0)).toBe(true);
  });
  test('the regeneration wave lifts one heart by two pixels',()=>{
    const {icons}=hearts({regenIndex:3});
    expect(icons.map(h=>h.up)).toEqual([0,0,0,2,0,0,0,0,0,0]);
    expect(regenIndex(0,20)).toBe(0);expect(regenIndex(26,20)).toBe(1);
  });
  test('poison changes the heart type, absorption hearts stay golden',()=>{
    const {icons}=hearts({poisoned:true,absorption:2});
    expect(icons.slice(0,10).every(h=>h.type==='poison')).toBe(true);
    expect(icons[10].absorb).toBe('full');
  });
  test('the health tracker blinks for 20 ticks after damage and lags the shown health by one second',()=>{
    const t=new HealthTracker();t.reset(20);
    t.update(20,100,false);expect(t.blinking(100)).toBe(false);
    t.update(14,101,true);
    expect(t.renderHealth).toBe(14);expect(t.lagHealth).toBe(20);
    const phases=[];for(let k=101;k<=122;k++)phases.push(t.blinking(k));
    expect(phases.filter(Boolean).length).toBeGreaterThan(5);expect(t.blinking(121)).toBe(false);
    // Blink phase toggles every 3 ticks: (blinkUntil - tick) / 3 % 2 == 1, as in Gui.renderPlayerHealth.
    expect([t.blinking(102),t.blinking(103),t.blinking(104),t.blinking(105),t.blinking(106),t.blinking(107)]).toEqual([false,false,true,true,true,false]);
    for(let k=102;k<=121;k++)t.update(14,k,false);
    expect(t.lagHealth).toBe(20);
    t.update(14,122,false);expect(t.lagHealth).toBe(14);
    // Healing does not blink unless hurt recently.
    t.update(16,130,false);expect(t.blinking(131)).toBe(false);
    t.update(18,131,true);expect(t.blinkUntil).toBe(141);
  });
});

describe('bars drawn from the game state',()=>{
  type Survival=FakeGame['survival'];
  function gameWith(values:Partial<Survival>,options:{armor?:number;effects?:string[];headInWater?:boolean}={}){
    const game=createFakeGame(),effects=new Set(options.effects??[]);
    game.survival={...game.survival,...values,armorPoints:()=>options.armor??0,hasEffect:name=>effects.has(name)};
    game.player.state.headInWater=!!options.headInWater;
    return game;
  }
  const view=(game:FakeGame,o:Partial<BarsOptions>={})=>barsView(game,{tick:0,lagHealth:game.survival.health,blinking:false,reduced:true,...o});
  test('7 health with 4 absorption, 7 food and 7 armour',()=>{
    const v=view(gameWith({health:7,absorption:4,food:7,saturation:2},{armor:7}));
    expect(v.hearts.map(h=>h.layers.join(' '))).toEqual([...Array(3).fill('heart_full heart_container'),'heart_half heart_container',
      ...Array(6).fill('heart_container'),'heart_absorb_full heart_container','heart_absorb_full heart_container']);
    // Hearts start at the hotbar's left edge (91 px left of centre), 8 px apart, 30 px up; absorption on a second row.
    expect(v.hearts.slice(0,3).map(h=>[h.x,h.bottom])).toEqual([[-91,30],[-83,30],[-75,30]]);
    expect(v.hearts[10]).toMatchObject({x:-91,bottom:40});
    // Armour sits above every heart row; shanks fill from the right edge.
    expect(v.armor).toHaveLength(10);expect(v.armor[3]).toEqual({layers:['armor_half','armor_empty'],x:-67,bottom:50});
    expect(v.armor[4].layers).toEqual(['armor_empty']);
    expect(v.food.map(f=>f.layers[0])).toEqual(['food_full','food_full','food_full','food_half',...Array(6).fill('food_container')]);
    expect(v.food[0]).toMatchObject({x:82,bottom:30});expect(v.food[9].x).toBe(10);
    expect(v.air).toEqual([]);expect(v.top).toBe(59);
    expect(v.label).toBe('Health 3.5 of 10 hearts, 2 absorption, food 3.5 of 10, armour 7, experience level 0');
  });
  test('full health without armour: no armour row, and the stack top is the vanilla 49 px',()=>{
    const v=view(gameWith({}));
    expect(v.hearts.every(h=>h.layers.join(' ')==='heart_full heart_container')).toBe(true);
    expect(v.armor).toEqual([]);expect(v.top).toBe(49);
  });
  test('poison and hunger effects change the icons; the white blink layer shows health just lost',()=>{
    const v=view(gameWith({health:12,food:4},{effects:['poison','hunger']}),{lagHealth:16,blinking:true});
    expect(v.hearts[5].layers).toEqual(['heart_poison_full','heart_poison_full_blink','heart_container_blink']);
    expect(v.hearts[6].layers).toEqual(['heart_poison_full_blink','heart_container_blink']);
    expect(v.food[0].layers).toEqual(['food_hunger_full','food_hunger_container']);expect(v.food[9].layers).toEqual(['food_hunger_container']);
    expect(v.label).toContain('poisoned');expect(v.label).toContain('hunger effect');
  });
  test('hearts shake at 4 health or less and shanks jitter at zero saturation, unless reduced motion',()=>{
    const game=gameWith({health:3,food:6,saturation:0});
    const moving=[0,1,2,3,4,5,6,7].map(tick=>view(game,{tick,reduced:false}));
    expect(moving.some(v=>v.hearts.some(h=>h.bottom!==30))).toBe(true);
    expect(moving.some(v=>v.food.some(f=>f.bottom!==30))).toBe(true);
    for(let tick=0;tick<8;tick++){const v=view(game,{tick});expect(v.hearts.every(h=>h.bottom===30)&&v.food.every(f=>f.bottom===30)).toBe(true);}
  });
  test('air bubbles above the shanks under water, the last one bursting',()=>{
    const v=view(gameWith({air:151},{headInWater:true}));
    expect(v.air.map(a=>a.layers[0])).toEqual(['air','air','air','air','air','air_bursting']);
    expect(v.air[0]).toMatchObject({x:82,bottom:40});expect(v.air[5].x).toBe(42);
    expect(view(gameWith({air:300})).air).toEqual([]);
  });
  test('experience bar and level',()=>{
    const v=view(gameWith({xpLevel:12,xpProgress:.5}));
    expect(v.xp).toBe(91);expect(v.level).toBe(12);
  });
  test('the held name and action bar sit above the bars (lower in creative)',()=>{
    expect(stackHeights(49,false)).toEqual({name:50,action:64});
    expect(stackHeights(59,false)).toEqual({name:60,action:74});
    expect(stackHeights(59,true)).toEqual({name:36,action:64});
  });
});

describe('hunger, armour, air and experience',()=>{
  test('food fills shanks from the right; odd values leave a half shank',()=>{
    const icons=foodIcons(7,2,false,0,null);
    expect(icons).toHaveLength(10);
    expect(icons.map(i=>i.fill)).toEqual(['full','full','full','half',null,null,null,null,null,null]);
    expect(icons.map(i=>i.x)).toEqual([173,165,157,149,141,133,125,117,109,101]);
    expect(foodIcons(20,5,false,0,null).every(i=>i.fill==='full'&&i.up===0&&!i.hunger)).toBe(true);
    expect(foodIcons(20,5,true,0,null).every(i=>i.hunger)).toBe(true);
  });
  test('shanks jitter only when saturation is 0, on ticks where tick % (food*3+1) is 0',()=>{
    const random=()=>0;// nextInt(3)-1 = -1, so the shank moves up 1
    expect(foodIcons(6,0,false,19,random).every(i=>i.up===1)).toBe(true);
    expect(foodIcons(6,0,false,20,random).every(i=>i.up===0)).toBe(true);
    expect(foodIcons(6,.5,false,19,random).every(i=>i.up===0)).toBe(true);
    expect(foodIcons(0,0,false,7,()=>.99).every(i=>i.up===-1)).toBe(true);
    expect(foodIcons(6,0,false,19,null).every(i=>i.up===0)).toBe(true);
  });
  test('armour icons appear only with armour points',()=>{
    expect(armorIcons(0)).toEqual([]);
    expect(armorIcons(7)).toEqual(['full','full','full','half','empty','empty','empty','empty','empty','empty']);
    expect(armorIcons(20).every(a=>a==='full')).toBe(true);
  });
  test('air bubbles show under water or while refilling, with a popping bubble',()=>{
    expect(airBubbles(300,300,false)).toBeNull();
    expect(airBubbles(300,300,true)).toEqual({full:10,popping:0});
    expect(airBubbles(150,300,true)).toEqual({full:5,popping:0});
    expect(airBubbles(151,300,true)).toEqual({full:5,popping:1});
    expect(airBubbles(0,300,true)).toEqual({full:0,popping:0});
    expect(airBubbles(200,300,false)).toEqual({full:7,popping:0});
    expect(airBubbles(-20,300,true)).toEqual({full:0,popping:0});
  });
  test('the experience bar fills (int)(progress*183) pixels, capped at 182',()=>{
    expect(xpFill(0)).toBe(0);expect(xpFill(.5)).toBe(91);expect(xpFill(.999)).toBe(182);expect(xpFill(1)).toBe(182);expect(xpFill(NaN)).toBe(0);
  });
});

describe('hotbar helpers',()=>{
  test('durability bar uses the vanilla step and hue',()=>{
    expect(durabilityBar(null)).toBeNull();
    expect(durabilityBar({id:'diamond_pickaxe',count:1})).toBeNull();
    expect(durabilityBar({id:'diamond_pickaxe',count:1,damage:780})).toEqual({step:7,color:'#feff00'});
    expect(durabilityBar({id:'diamond_pickaxe',count:1,damage:1})).toEqual({step:13,color:'#00ff00'});
    expect(durabilityBar({id:'diamond_pickaxe',count:1,damage:1560})).toEqual({step:0,color:'#ff0000'});
    expect(durabilityBar({id:'stone',count:3,damage:2})).toBeNull();
    expect(hsvToRgb(2/3,1,1)).toBe('#0000ff');
  });
  test('attack indicator: a bar while recharging, the full mark on a target with slow weapons',()=>{
    expect(attackIndicator(.5,false,1.6)).toEqual({kind:'bar',width:8});
    expect(attackIndicator(.999,true,1.6)).toEqual({kind:'bar',width:16});
    expect(attackIndicator(1,true,1.6)).toEqual({kind:'full'});
    expect(attackIndicator(1,true,4)).toBeNull();
    expect(attackIndicator(1,false,1.6)).toBeNull();
  });
  test('held item name shows for 40 ticks after a change and fades over the last 10',()=>{
    const pick={id:'iron_pickaxe',count:1},dirt={id:'dirt',count:5};
    expect(heldNameFade(null,pick,0)).toBe(40);
    expect(heldNameFade(pick,{...pick,damage:3},30)).toBe(29);
    expect(heldNameFade(pick,dirt,12)).toBe(40);
    expect(heldNameFade(pick,null,12)).toBe(0);
    expect(heldNameFade(pick,pick,0)).toBe(0);
    expect(heldNameOpacity(40)).toBe(1);expect(heldNameOpacity(10)).toBe(1);expect(heldNameOpacity(5)).toBeCloseTo(128/255,3);expect(heldNameOpacity(0)).toBe(0);
    expect(heldName({id:'golden_apple',count:1})).toEqual({text:'Golden Apple',rarity:'rare'});
    expect(heldName({id:'dirt',count:1})).toEqual({text:'Dirt',rarity:'common'});
  });
});

describe('compass, clock and layout',()=>{
  test('the compass arrow points toward spawn relative to where the player looks (clockwise from up)',()=>{
    expect(compassAngle(0,0,0,0,-10)).toBeCloseTo(0);
    expect(compassAngle(0,0,0,10,0)).toBeCloseTo(Math.PI/2);
    expect(compassAngle(0,0,0,-10,0)).toBeCloseTo(-Math.PI/2);
    expect(Math.abs(compassAngle(0,0,0,0,10))).toBeCloseTo(Math.PI);
    // Facing west (yaw +90°), north is to the right.
    expect(compassAngle(0,0,Math.PI/2,0,-10)).toBeCloseTo(Math.PI/2);
  });
  test('the clock dial puts the sun on top at noon and the moon on top at midnight',()=>{
    expect(sunAngle(6000)).toBeCloseTo(0);expect(sunAngle(18000)).toBeCloseTo(Math.PI);expect(sunAngle(0)).toBeCloseTo(-Math.PI/2);
    expect(clockText(0)).toBe('06:00');expect(clockText(6000)).toBe('12:00');expect(clockText(18000)).toBe('00:00');expect(clockText(13500)).toBe('19:30');
  });
  test('gui scale follows the vanilla auto rule on desktop and fits phones without hitting the shell buttons',()=>{
    expect(hudLayout(1366,768,false)).toMatchObject({scale:3,shift:0,bottom:0});
    expect(hudLayout(1920,1080,false)).toMatchObject({scale:4,shift:0});
    for(const [w,h,touch] of [[390,844,true],[320,568,true],[390,844,false],[844,390,true],[1366,768,false],[1024,600,false]] as const){
      const l=hudLayout(w,h,touch),left=w/2+(-91-29+l.shift)*l.scale,right=w/2+(91+l.shift)*l.scale;
      expect(left,`${w}x${h}`).toBeGreaterThanOrEqual(8);expect(right,`${w}x${h}`).toBeLessThanOrEqual(w-8);
      // Bottom-right 150 px is the shell's button zone (about 40 px tall).
      if(right>w-150)expect(l.bottom).toBeGreaterThanOrEqual(40);
      expect(l.top).toBeCloseTo(l.bottom+75*l.scale);
      expect(l.top,`${w}x${h} stack height`).toBeLessThan(h*.45);
      if(touch)expect(l.scale*20).toBeGreaterThanOrEqual(26);
    }
  });
});

describe('debug overlay',()=>{
  test('facing uses vanilla names and yaw degrees',()=>{
    expect(facingInfo(0,0)).toMatchObject({name:'north',towards:'Towards negative Z',yaw:180});
    expect(facingInfo(Math.PI/2,0)).toMatchObject({name:'west',towards:'Towards negative X',yaw:90});
    expect(facingInfo(-Math.PI/2,.5)).toMatchObject({name:'east',towards:'Towards positive X',yaw:-90});
    expect(facingInfo(Math.PI,0).name).toBe('south');
    expect(facingInfo(0,.5).pitch).toBeCloseTo(-28.6,1);
  });
  test('lines include fps, scale, draw calls, position, facing, biome, light, time, weather and counts',()=>{
    const game=createFakeGame();game.flat(60);
    game.player.state.x=12.5;game.player.state.y=60;game.player.state.z=-3.25;
    game.time.dayTime=13000;game.time.day=4;game.weather={...game.weather,state:'rain'};
    const text=debugLines(game,58.4,{passive:3,hostile:2,water:1}).join('\n');
    for(const part of ['58 fps','scale 1.00','Draw calls: 0','XYZ: 12.500 / 60.000 / -3.250','Block: 12 60 -4','Chunk: 0 -1','Facing: north','Biome: Ocean','sky','block',
      'Day 4','13000','Weather: rain','Entities: 0','Mobs: 3 passive, 2 hostile, 1 water'])expect(text).toContain(part);
  });
  test('the right column shows the display, the targeted block and the held item',()=>{
    const game=createFakeGame();game.flat(60);
    game.interaction={...game.interaction,target:{x:3,y:59,z:-2,nx:0,ny:1,nz:0,id:1,distance:2}};
    game.inventory.setSlot(0,{id:'dirt',count:5});
    const text=debugRightLines(game,1366,768,3).join('\n');
    for(const part of ['Display: 1366x768','GUI scale 3.00','Targeted Block: 3, 59, -2','Held: dirt x5'])expect(text).toContain(part);
  });
});

describe('pixel art',()=>{
  test('every icon is a rectangular palette grid with transparent corners and an SVG rendering',()=>{
    for(const name of ICON_NAMES)for(const patterns of [false,true]){
      const grid=iconGrid(name,patterns),palette=iconPalette(name,patterns);
      expect(grid.length,name).toBeGreaterThan(2);
      expect(new Set(grid.map(r=>r.length)).size,name).toBe(1);
      let opaque=0;
      for(const row of grid)for(const ch of row){if(ch==='.')continue;opaque++;expect(palette[ch],`${name} ${ch}`).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);}
      expect(opaque,name).toBeGreaterThan(2);
      const svg=iconSvg(name,patterns);
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="\d+"/);expect(svg).toContain('shape-rendering="crispEdges"');
    }
  });
  test('fill layers sit inside the container interior so outlines stay visible',()=>{
    for(const [fill,container] of [['heart_full','heart_container'],['heart_absorb_full','heart_container'],['heart_poison_full','heart_container'],
      ['food_full','food_container'],['armor_full','armor_empty']]){
      const f=iconGrid(fill,false),c=iconGrid(container,false),outline=iconPalette(container,false);
      f.forEach((row,y)=>[...row].forEach((ch,x)=>{if(ch!=='.')expect(c[y][x]!=='.'&&outline[c[y][x]]!=='#000000',`${fill} ${x},${y}`).toBe(true);}));
    }
  });
  test('half icons are the left half of hearts and armour and the right half of shanks',()=>{
    const half=(a:string,b:string,keep:(x:number)=>boolean)=>{
      const full=iconGrid(a,false),h=iconGrid(b,false);
      full.forEach((row,y)=>[...row].forEach((ch,x)=>expect(h[y][x],`${b} ${x},${y}`).toBe(keep(x)?ch:'.')));
    };
    half('heart_full','heart_half',x=>x<=4);half('armor_full','armor_half',x=>x<=4);half('food_full','food_half',x=>x>=4);
  });
  test('colour-blind mode adds shape patterns to absorption, poison and hunger icons',()=>{
    for(const name of ['heart_absorb_full','heart_poison_full','food_hunger_full'])expect(iconGrid(name,true).join(),name).not.toBe(iconGrid(name,false).join());
    expect(iconGrid('heart_full',true).join()).toBe(iconGrid('heart_full',false).join());
  });
  test('digits are original 5x7 glyphs rendered with a shadow or an outline',()=>{
    expect(Object.keys(DIGIT_GLYPHS).sort().join('')).toBe('0123456789');
    for(const g of Object.values(DIGIT_GLYPHS)){expect(g).toHaveLength(7);expect(g.every(r=>r.length===5)).toBe(true);}
    expect(new Set(Object.values(DIGIT_GLYPHS).map(g=>g.join())).size).toBe(10);
    expect(digitsSvg('64','count')).toContain('width="12" height="8"');
    expect(digitsSvg('7','level')).toContain('width="7" height="9"');
  });
  test('the pixel font covers every item name, with vanilla advances and a quarter-brightness shadow',()=>{
    for(const def of ITEMS.values())expect(hasGlyphs(def.displayName),def.displayName).toBe(true);
    for(const [ch,glyph] of Object.entries(FONT_GLYPHS)){
      expect(glyph.length===7||glyph.length===8,ch).toBe(true);expect(new Set(glyph.map(r=>r.length)).size,ch).toBe(1);
      expect(glyph.every(r=>/^[#.]+$/.test(r)),ch).toBe(true);
    }
    // Capitals 5 wide (advance 6), i 1 wide, l 2 wide, space advance 4.
    expect(textWidth('A')).toBe(6);expect(textWidth('il')).toBe(5);expect(textWidth('A B')).toBe(16);
    expect(hasGlyphs('Diamond Pickaxe')).toBe(true);expect(hasGlyphs('Épée')).toBe(false);
    expect(shadowColour('#ffffff')).toBe('#3f3f3f');expect(shadowColour('#55ffff')).toBe('#153f3f');
    const svg=textSvg('Dirt');expect(svg).toContain(`width="${textWidth('Dirt')}" height="9"`);expect(svg).toContain('#3f3f3f');
    expect(new Set(Object.values(FONT_GLYPHS).map(gl=>gl.join('/'))).size).toBeGreaterThan(70);
  });
  test('hotbar and experience bar textures have vanilla sizes',()=>{
    expect(hotbarSvg()).toContain('width="182" height="22"');
    expect(xpBarSvg(false)).toContain('width="182" height="5"');expect(xpBarSvg(true)).toContain('width="182" height="5"');
  });
});

describe('compass and clock dials',()=>{
  const find=(grid:readonly string[],ch:string)=>grid.flatMap((row,y)=>[...row].map((c,x)=>c===ch?{x,y}:null)).filter(Boolean) as {x:number;y:number}[];
  test('the compass needle tip turns clockwise with the frame',()=>{
    const tip=(frame:number)=>{const n=find(compassGrid(frame),'N');return n.reduce((a,b)=>Math.hypot(b.x-7.5,b.y-7.5)>Math.hypot(a.x-7.5,a.y-7.5)?b:a);};
    expect(tip(0).y).toBeLessThan(4);expect(Math.abs(tip(0).x-7.5)).toBeLessThan(1.5);
    expect(tip(COMPASS_FRAMES/4).x).toBeGreaterThan(11);
    expect(tip(COMPASS_FRAMES/2).y).toBeGreaterThan(11);
    expect(tip(COMPASS_FRAMES*3/4).x).toBeLessThan(4);
  });
  test('the clock shows the sun on top at noon and the moon on top at midnight',()=>{
    const mean=(pts:{y:number}[])=>pts.reduce((n,p)=>n+p.y,0)/pts.length;
    const noon=clockGrid(dialFrame(sunAngle(6000),CLOCK_FRAMES)),midnight=clockGrid(dialFrame(sunAngle(18000),CLOCK_FRAMES));
    expect(mean(find(noon,'S'))).toBeLessThan(7);expect(mean(find(noon,'M'))).toBeGreaterThan(8);
    expect(mean(find(midnight,'M'))).toBeLessThan(7);expect(mean(find(midnight,'S'))).toBeGreaterThan(8);
    expect(find(noon,'D').filter(p=>p.y<6).length).toBeGreaterThan(find(noon,'N').filter(p=>p.y<6).length);
  });
  test('dial frames wrap around',()=>{
    expect(dialFrame(0,32)).toBe(0);expect(dialFrame(-Math.PI/2,32)).toBe(24);expect(dialFrame(Math.PI*2,32)).toBe(0);expect(dialFrame(Math.PI,64)).toBe(32);
  });
  test('slot art has vanilla sizes and the selection frame leaves the item visible',()=>{
    expect(offhandSvg()).toContain('width="22" height="22"');
    const sel=selectionFrameSvg();expect(sel).toContain('width="24" height="24"');expect(sel).not.toContain('x="4" y="4" width="16" height="16"');
  });
});

describe('per-tick randomness',()=>{
  test('is deterministic per tick, varies between ticks and stays in [0, 1)',()=>{
    const a=tickRandom(42),b=tickRandom(42),c=tickRandom(43);
    const sa=[a(),a(),a()],sb=[b(),b(),b()],sc=[c(),c(),c()];
    expect(sa).toEqual(sb);expect(sa).not.toEqual(sc);
    for(const v of [...sa,...sc])expect(v>=0&&v<1).toBe(true);
  });
});

describe('menu options',()=>{
  test('labels use vanilla wording',()=>{
    const s={mode:'survival',difficulty:'normal',view:1,sensitivity:1,fov:70,volume:0,keepInventory:false,daylightCycle:true,mobSpawning:true,weatherCycle:true} as const;
    expect(optionLabel('mode',s)).toBe('Game Mode: Survival');
    expect(optionLabel('difficulty',s)).toBe('Difficulty: Normal');
    expect(optionLabel('view',s)).toBe('Render Distance: 5 chunks');
    expect(optionLabel('fov',s)).toBe('FOV: Normal');
    expect(fovLabel(110)).toBe('FOV: Quake Pro');expect(fovLabel(85)).toBe('FOV: 85');
    expect(optionLabel('sensitivity',s)).toBe('Sensitivity: 100%');
    expect(optionLabel('volume',s)).toBe('Master Volume: OFF');
    expect(optionLabel('volume',{...s,volume:.55})).toBe('Master Volume: 55%');
    expect(optionLabel('keepInventory',s)).toBe('Keep Inventory: OFF');
    expect(optionLabel('daylightCycle',s)).toBe('Daylight Cycle: ON');
    expect(optionLabel('weatherCycle',s)).toBe('Weather Cycle: ON');
    expect(optionLabel('mobSpawning',s)).toBe('Mob Spawning: ON');
  });
  test('difficulty cycles like the vanilla button and sensitivity maps to a 10..400 % slider',()=>{
    expect(['peaceful','easy','normal','hard'].map(d=>nextDifficulty(d as 'easy'))).toEqual(['easy','normal','hard','peaceful']);
    expect(sensitivityFromSlider(100)).toBe(1);expect(sensitivityFromSlider(5)).toBe(.1);expect(sensitivityFromSlider(999)).toBe(4);
    expect(sensitivityToSlider(2.5)).toBe(250);
  });
  test('controls list every binding with readable key names',()=>{
    expect(['KeyW','ShiftLeft','Space','Mouse0','Mouse2','Mouse1','ArrowUp','ControlLeft','Digit3','F3','Tab'].map(keyLabel))
      .toEqual(['W','Left Shift','Space','Left Click','Right Click','Middle Click','Up Arrow','Left Ctrl','3','F3','Tab']);
    const bindings:InputBinding[]=[{action:'forward',keys:['KeyW','ArrowUp'],label:'Walk forward'},{action:'attack',keys:['Mouse0'],label:'Attack / mine'}];
    const rows=controlRows(bindings);
    expect(rows.slice(0,2)).toEqual([{label:'Walk forward',keys:'W / Up Arrow'},{label:'Attack / mine',keys:'Left Click'}]);
    expect(rows.map(r=>r.label)).toEqual(expect.arrayContaining(['Select hotbar slot','Hide HUD','Debug screen']));
    expect(controlRows([{action:'dropStack',keys:['ControlLeft+KeyQ'],label:'Drop the whole stack'}])[0].keys).toBe('Left Ctrl + Q');
  });
});
