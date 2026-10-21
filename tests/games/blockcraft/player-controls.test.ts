// Input mapping: bindings, keyboard rules (single consumer edges, double-tap sprint, Ctrl+Q, F1/F3, hotbar,
// screens), wheel, touch stick, look/hold/tap gestures and the gamepad mapping. DOM-free.
import {describe,expect,test} from 'vitest';
import {BINDINGS,KEY_ACTIONS,MOUSE_ACTIONS} from '../../../src/games/blockcraft/player/controls-bindings';
import {ControlState,DOUBLE_TAP_MS,MAX_PENDING_PRESSES} from '../../../src/games/blockcraft/player/controls-core';
import {LookGesture,HOLD_MS} from '../../../src/games/blockcraft/player/controls-gesture';
import {PAD,PadMapper,readPad,type PadFrame} from '../../../src/games/blockcraft/player/controls-gamepad';
import type {InputAction} from '../../../src/games/blockcraft/engine/contracts';

const ALL:InputAction[]=['forward','back','left','right','jump','sneak','sprint','attack','use','pick','drop','dropStack','swapHands','inventory','advancements'];
const key=(code:string,mods:{ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;repeat?:boolean}={})=>({code,...mods});

describe('bindings',()=>{
  test('every action is listed once with keys and a label',()=>{
    expect(BINDINGS.map(b=>b.action).sort()).toEqual([...ALL].sort());
    for(const b of BINDINGS){expect(b.keys.length).toBeGreaterThan(0);expect(b.label.length).toBeGreaterThan(2);}
  });
  test('vanilla keys: WASD and arrows, Space, Shift, Ctrl/R sprint, E, Q, Ctrl+Q, F, L and the mouse buttons',()=>{
    const keys=(a:InputAction)=>BINDINGS.find(b=>b.action===a)!.keys;
    expect(keys('forward')).toEqual(['KeyW','ArrowUp']);expect(keys('back')).toEqual(['KeyS','ArrowDown']);
    expect(keys('left')).toEqual(['KeyA','ArrowLeft']);expect(keys('right')).toEqual(['KeyD','ArrowRight']);
    expect(keys('jump')).toEqual(['Space']);expect(keys('sneak')).toEqual(['ShiftLeft','ShiftRight']);
    expect(keys('sprint')).toEqual(['ControlLeft','ControlRight','KeyR']);
    expect(keys('inventory')).toEqual(['KeyE']);expect(keys('drop')).toEqual(['KeyQ']);expect(keys('dropStack')).toEqual(['ControlLeft+KeyQ','ControlRight+KeyQ']);
    expect(keys('swapHands')).toEqual(['KeyF']);expect(keys('advancements')).toEqual(['KeyL']);
    expect(keys('attack')).toEqual(['Mouse0']);expect(keys('use')).toEqual(['Mouse2']);expect(keys('pick')).toEqual(['Mouse1']);
    expect(MOUSE_ACTIONS).toEqual(['attack','pick','use']);
  });
  test('Escape is never bound',()=>{
    expect(Object.keys(KEY_ACTIONS)).not.toContain('Escape');
    for(const b of BINDINGS)for(const k of b.keys)expect(k).not.toMatch(/Escape/);
    const c=new ControlState();expect(c.keyDown(key('Escape'),'playing',0).handled).toBe(false);
  });
});

describe('keyboard',()=>{
  test('movement keys combine into axes; two keys for one action release cleanly',()=>{
    const c=new ControlState();
    c.keyDown(key('KeyW'),'playing',0);c.keyDown(key('ArrowUp'),'playing',1000);c.keyDown(key('KeyA'),'playing',1000);
    expect(c.move()).toEqual({forward:1,strafe:-1});
    c.keyUp('KeyW');expect(c.down('forward')).toBe(true);c.keyUp('ArrowUp');expect(c.down('forward')).toBe(false);
    c.keyDown(key('KeyS'),'playing',2000);c.keyDown(key('KeyD'),'playing',2000);expect(c.move()).toEqual({forward:-1,strafe:0});
  });
  test('pressed() is true once per press; key repeat adds no edge',()=>{
    const c=new ControlState();
    expect(c.keyDown(key('KeyQ'),'playing',0).handled).toBe(true);
    expect(c.pressed('drop')).toBe(true);expect(c.pressed('drop')).toBe(false);
    for(const [code,action] of [['KeyF','swapHands'],['KeyE','inventory'],['Space','jump'],['KeyL','advancements']] as const){
      c.keyDown(key(code),'playing',10);expect(c.pressed(action)).toBe(true);
      c.keyDown(key(code,{repeat:true}),'playing',50);expect(c.pressed(action)).toBe(false);expect(c.down(action)).toBe(true);c.keyUp(code);
    }
    c.keyUp('KeyQ');c.keyDown(key('KeyQ'),'playing',100);expect(c.pressed('drop')).toBe(true);
  });
  test('two presses before a read count twice (a double tap within one slow frame); unread presses are capped',()=>{
    const c=new ControlState();
    c.keyDown(key('Space'),'playing',0);c.keyUp('Space');c.keyDown(key('Space'),'playing',120);c.keyUp('Space');
    expect(c.pressed('jump')).toBe(true);expect(c.pressed('jump')).toBe(true);expect(c.pressed('jump')).toBe(false);
    for(let i=0;i<5;i++){c.keyDown(key('KeyE'),'playing',200+i);c.keyUp('KeyE');}
    let n=0;while(c.pressed('inventory'))n++;
    expect(n).toBe(MAX_PENDING_PRESSES);
    c.tap('attack');c.tap('attack');c.clear();expect(c.pressed('attack')).toBe(false);
  });
  test('holding Q keeps dropping on every key repeat (vanilla), Ctrl+Q whole stacks; not with a screen open',()=>{
    const c=new ControlState();c.keyDown(key('KeyQ'),'playing',0);expect(c.pressed('drop')).toBe(true);
    let drops=0;for(let i=1;i<=3;i++){c.keyDown(key('KeyQ',{repeat:true}),'playing',500+i*33);if(c.pressed('drop'))drops++;}
    expect(drops).toBe(3);
    c.keyDown(key('KeyQ',{ctrlKey:true,repeat:true}),'playing',700);expect(c.pressed('dropStack')).toBe(true);expect(c.pressed('drop')).toBe(false);
    c.keyDown(key('KeyQ',{repeat:true}),'screen',800);expect(c.pressed('drop')).toBe(false);
  });
  test(`double-tapping forward within ${DOUBLE_TAP_MS} ms holds sprint until forward is released`,()=>{
    const c=new ControlState();
    c.keyDown(key('KeyW'),'playing',0);c.keyUp('KeyW');c.keyDown(key('KeyW'),'playing',200);
    expect(c.down('sprint')).toBe(true);c.keyUp('KeyW');expect(c.down('sprint')).toBe(false);
    const slow=new ControlState();slow.keyDown(key('KeyW'),'playing',0);slow.keyUp('KeyW');slow.keyDown(key('KeyW'),'playing',DOUBLE_TAP_MS+50);
    expect(slow.down('sprint')).toBe(false);
  });
  test('Ctrl and R hold sprint; Ctrl+Q drops the stack instead of one item',()=>{
    const c=new ControlState();
    c.keyDown(key('ControlLeft',{ctrlKey:true}),'playing',0);expect(c.down('sprint')).toBe(true);
    c.keyDown(key('KeyQ',{ctrlKey:true}),'playing',10);expect(c.pressed('dropStack')).toBe(true);expect(c.pressed('drop')).toBe(false);
    c.keyDown(key('KeyW',{ctrlKey:true}),'playing',20);expect(c.down('forward')).toBe(true);
    c.keyUp('ControlLeft');expect(c.down('sprint')).toBe(false);
    c.keyDown(key('KeyR'),'playing',30);expect(c.down('sprint')).toBe(true);
  });
  test('browser shortcuts with Meta or Alt are left alone',()=>{
    const c=new ControlState();
    expect(c.keyDown(key('KeyQ',{metaKey:true}),'playing',0).handled).toBe(false);
    expect(c.keyDown(key('KeyD',{altKey:true}),'playing',0).handled).toBe(false);
    expect(c.pressed('drop')).toBe(false);expect(c.down('right')).toBe(false);
  });
  test('digits select the hotbar and F1/F3 toggle the HUD and debug flags',()=>{
    const c=new ControlState();
    expect(c.keyDown(key('Digit1'),'playing',0)).toEqual({handled:true,hotbar:0});
    expect(c.keyDown(key('Digit9'),'playing',0)).toEqual({handled:true,hotbar:8});
    expect(c.keyDown(key('Digit0'),'playing',0).handled).toBe(false);
    expect(c.keyDown(key('Digit3',{ctrlKey:true}),'playing',0).handled).toBe(false);
    expect(c.keyDown(key('F1'),'playing',0)).toEqual({handled:true,flag:'hudHidden'});
    expect(c.keyDown(key('F3'),'screen',0)).toEqual({handled:true,flag:'debug'});
    expect(c.keyDown(key('F3'),'other',0).handled).toBe(false);
  });
  test('with a screen open only E and L pass (for the ui); outside play nothing is taken',()=>{
    const c=new ControlState();
    expect(c.keyDown(key('KeyW'),'screen',0).handled).toBe(false);expect(c.down('forward')).toBe(false);
    expect(c.keyDown(key('Digit2'),'screen',0).handled).toBe(false);
    expect(c.keyDown(key('KeyE'),'screen',0).handled).toBe(true);expect(c.pressed('inventory')).toBe(true);
    expect(c.keyDown(key('KeyL'),'screen',0).handled).toBe(true);expect(c.pressed('advancements')).toBe(true);
    for(const code of ['KeyW','Space','KeyE','Digit1'])expect(c.keyDown(key(code),'other',0).handled).toBe(false);
  });
  test('clear() drops every held action and pending edge',()=>{
    const c=new ControlState();c.keyDown(key('KeyW'),'playing',0);c.keyDown(key('KeyE'),'playing',0);c.setStick(1,0);
    c.clear();expect(c.down('forward')).toBe(false);expect(c.pressed('inventory')).toBe(false);expect(c.move()).toEqual({forward:0,strafe:0});
    // A key still physically held after clear() (a screen closed) is held again by its auto-repeat, without a new edge.
    c.keyDown(key('KeyF',{repeat:true}),'playing',10);expect(c.down('swapHands')).toBe(true);expect(c.pressed('swapHands')).toBe(false);
    c.keyDown(key('KeyW',{repeat:true}),'playing',10);expect(c.down('forward')).toBe(true);expect(c.down('sprint')).toBe(false);
  });
  test('wheel: one slot per notch, trackpad deltas accumulate, line mode counts events',()=>{
    const c=new ControlState();
    expect(c.wheel(100,0,0)).toBe(1);expect(c.wheel(-120,0,500)).toBe(-1);
    expect(c.wheel(20,0,1000)).toBe(0);expect(c.wheel(20,0,1010)).toBe(0);expect(c.wheel(20,0,1020)).toBe(1);
    expect(c.wheel(3,1,2000)).toBe(1);expect(c.wheel(0,0,3000)).toBe(0);
  });
});

describe('touch',()=>{
  test('the stick moves on both axes and a full push sprints',()=>{
    const c=new ControlState();c.setStick(.5,.5);expect(c.move()).toEqual({forward:.5,strafe:.5});expect(c.down('sprint')).toBe(false);
    c.setStick(0,1);expect(c.down('sprint')).toBe(true);c.setStick(0,0);expect(c.down('sprint')).toBe(false);
  });
  test('a quick tap is a tap, a drag looks, a hold turns into the hold action',()=>{
    const g=new LookGesture();
    g.begin(1,100,100,0,'touch',0);expect(g.update(100)).toBeNull();expect(g.end(1,150,false)).toEqual({tap:'use',release:null});
    g.begin(2,100,100,0,'touch',0);expect(g.move(2,130,90)).toEqual({dx:30,dy:-10});expect(g.update(400)).toBeNull();
    expect(g.end(2,500,false)).toEqual({tap:null,release:null});
    g.begin(3,100,100,0,'touch',0);expect(g.progress(HOLD_MS.touch/2)).toBeCloseTo(.5,5);
    expect(g.update(HOLD_MS.touch)).toBe('attack');expect(g.move(3,105,100)).toEqual({dx:5,dy:0});
    expect(g.end(3,900,false)).toEqual({tap:null,release:'attack'});
    expect(g.move(3,0,0)).toBeNull();
  });
  test('mouse buttons map to attack, pick and use; a cancelled pointer never taps',()=>{
    const g=new LookGesture();
    g.begin(1,0,0,0,'mouse',2);expect(g.end(1,50,false).tap).toBe('use');
    g.begin(1,0,0,0,'mouse',1);expect(g.end(1,50,false).tap).toBe('pick');
    g.begin(1,0,0,0,'mouse',0);expect(g.update(HOLD_MS.mouse)).toBe('attack');expect(g.end(1,400,true)).toEqual({tap:null,release:'attack'});
    g.begin(4,0,0,0,'touch',0);expect(g.end(4,50,true)).toEqual({tap:null,release:null});
  });
});

describe('gamepad',()=>{
  const pad=(buttons:Record<number,number>={},axes=[0,0,0,0])=>({
    buttons:Array.from({length:17},(_,i)=>({pressed:(buttons[i]??0)>.5,value:buttons[i]??0})),axes});
  test('sticks have a radial dead zone',()=>{
    const f:PadFrame=readPad(pad({},[.1,-.05,0,.9]));
    expect(f.moveX).toBe(0);expect(f.moveY).toBe(0);expect(f.lookY).toBeGreaterThan(.8);
    expect(readPad(null).connected).toBe(false);
  });
  test('A jump, B sneak, X drop, Y inventory, RT attack, LT use, LB/RB hotbar, left stick moves',()=>{
    const c=new ControlState(),m=new PadMapper();
    let out=m.apply(readPad(pad({[PAD.A]:1,[PAD.B]:1,[PAD.RT]:.8,[PAD.LT]:.9},[0,-1,0,0])),c,'playing',1/60,1);
    expect(c.down('jump')).toBe(true);expect(c.down('sneak')).toBe(true);expect(c.down('attack')).toBe(true);expect(c.down('use')).toBe(true);
    expect(c.move().forward).toBeCloseTo(1,5);expect(out.hotbar).toBe(0);
    out=m.apply(readPad(pad({[PAD.X]:1,[PAD.Y]:1,[PAD.RB]:1})),c,'playing',1/60,1);
    expect(c.down('jump')).toBe(false);expect(c.pressed('drop')).toBe(true);expect(c.pressed('inventory')).toBe(true);expect(out.hotbar).toBe(1);
    out=m.apply(readPad(pad({[PAD.RB]:1})),c,'playing',1/60,1);expect(out.hotbar).toBe(0);
    out=m.apply(readPad(pad({[PAD.LB]:1})),c,'playing',1/60,1);expect(out.hotbar).toBe(-1);
  });
  test('the right stick looks (right turns right, up looks up) scaled by sensitivity',()=>{
    const c=new ControlState(),m=new PadMapper();
    const a=m.apply(readPad(pad({},[0,0,1,-1])),c,'playing',.1,1);expect(a.dyaw).toBeLessThan(0);expect(a.dpitch).toBeGreaterThan(0);
    const b=new PadMapper().apply(readPad(pad({},[0,0,1,-1])),new ControlState(),'playing',.1,2);expect(b.dyaw).toBeCloseTo(a.dyaw*2,5);
  });
  test('with a screen open only Y or B (closing it) pass; outside play buttons are released',()=>{
    const c=new ControlState(),m=new PadMapper();
    m.apply(readPad(pad({[PAD.A]:1,[PAD.Y]:1})),c,'screen',1/60,1);expect(c.down('jump')).toBe(false);expect(c.pressed('inventory')).toBe(true);
    m.apply(readPad(pad({[PAD.A]:1})),c,'screen',1/60,1);m.apply(readPad(pad({[PAD.B]:1})),c,'screen',1/60,1);expect(c.pressed('inventory')).toBe(true);
    m.apply(readPad(pad({[PAD.B]:1})),c,'screen',1/60,1);expect(c.pressed('inventory')).toBe(false);
    m.apply(readPad(pad({[PAD.A]:1})),c,'playing',1/60,1);expect(c.down('jump')).toBe(true);
    m.apply(readPad(pad({[PAD.A]:1})),c,'other',1/60,1);expect(c.down('jump')).toBe(false);
  });
});
