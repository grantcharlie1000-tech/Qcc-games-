import {describe,expect,test} from 'vitest';
import * as THREE from 'three';
import {createFakeGame} from './helpers/fake-game';
import {applyDisplay,armPose,bowPose,createHand,createViewMotion,eatPose,heldDisplay,hurtBob,itemSwingPose,viewBob,DEATH_TICKS,HURT_TICKS,SWING_TICKS} from '../../../src/games/blockcraft/render/hand';
import {HandBuffer,addArm,addSprite,paintArmSkin,HAND_SLOT} from '../../../src/games/blockcraft/render/hand-art';
import type {ChunkMesh} from '../../../src/games/blockcraft/engine/contracts';

const at=(m:THREE.Matrix4,x:number,y:number,z:number)=>new THREE.Vector3(x,y,z).applyMatrix4(m);
const atlas=()=>new THREE.DataTexture(new Uint8Array(4),1,1);

describe('vanilla first-person poses',()=>{
  test('the bare right arm reaches from the lower right corner toward the middle of the view',()=>{
    const m=armPose(new THREE.Matrix4(),1,0,0);
    const hand=at(m,-1,10,0),shoulder=at(m,-1,-2,0);
    expect(hand.x).toBeGreaterThan(0);expect(hand.y).toBeLessThan(0);expect(hand.z).toBeLessThan(-.8);
    // The fist is further in front and higher on screen than the shoulder end.
    expect(hand.z).toBeLessThan(shoulder.z);expect(hand.y/-hand.z).toBeGreaterThan(shoulder.y/-shoulder.z);
    // Lowered while (re)equipping, and swung toward the centre mid-swing.
    expect(at(armPose(new THREE.Matrix4(),1,0,1),-1,10,0).y).toBeCloseTo(hand.y-.6,5);
    const swung=at(armPose(new THREE.Matrix4(),1,.5,0),-1,10,0);
    expect(Math.hypot(swung.x-hand.x,swung.y-hand.y,swung.z-hand.z)).toBeGreaterThan(.1);
  });
  test('a held block is a 0.4 block cube turned 45° at (0.56, -0.52, -0.72), like block/block.json',()=>{
    const m=applyDisplay(itemSwingPose(new THREE.Matrix4(),1,0,0),'block',false);
    const centre=at(m,.5,.5,.5);
    expect(centre.x).toBeCloseTo(.56,5);expect(centre.y).toBeCloseTo(-.52,5);expect(centre.z).toBeCloseTo(-.72,5);
    expect(at(m,0,0,0).distanceTo(at(m,1,0,0))).toBeCloseTo(.4,5);
    expect(at(m,1,1,1).y-at(m,0,0,0).y).toBeCloseTo(.4,5);
  });
  test('items use the item/generated transform and the offhand mirrors the main hand',()=>{
    const right=applyDisplay(itemSwingPose(new THREE.Matrix4(),1,0,0),'item',false),left=applyDisplay(itemSwingPose(new THREE.Matrix4(),-1,0,0),'item',true);
    const c=at(right,.5,.5,.5),d=at(left,.5,.5,.5);
    expect(c.x).toBeCloseTo(.56+1.13/16,5);expect(c.y).toBeCloseTo(-.52+3.2/16,5);expect(d.x).toBeCloseTo(-c.x,5);expect(d.y).toBeCloseTo(c.y,5);
    expect(at(right,0,0,.5).distanceTo(at(right,1,0,.5))).toBeCloseTo(.68,5);
    // The sprite's face turns toward the left (-x) so the camera sees it.
    const n=at(right,.5,.5,1).sub(c);expect(n.x).toBeCloseTo(-.34,5);
  });
  test('eating lifts the food toward the mouth and chews; drawing a bow pulls the bow back',()=>{
    const rest=at(eatPose(new THREE.Matrix4(),1,0),0,0,0),mid=at(eatPose(new THREE.Matrix4(),1,16),0,0,0);
    expect(rest.length()).toBeCloseTo(0,5);expect(mid.x).toBeGreaterThan(.5);expect(mid.y).toBeLessThan(-.3);
    const a=at(eatPose(new THREE.Matrix4(),1,14),0,0,0).y,b=at(eatPose(new THREE.Matrix4(),1,16),0,0,0).y;expect(a).not.toBeCloseTo(b,3);
    const loose=bowPose(new THREE.Matrix4(),1,0),drawn=bowPose(new THREE.Matrix4(),1,20);
    expect(loose.determinant()).toBeCloseTo(1,5);expect(drawn.determinant()).toBeCloseTo(1.2,5);
  });
  test('view bob sways while walking and the hurt tilt rolls the view',()=>{
    expect(viewBob(new THREE.Matrix4(),3.2,0).equals(new THREE.Matrix4())).toBe(true);
    const p=new THREE.Vector3().setFromMatrixPosition(viewBob(new THREE.Matrix4(),.5,.1));
    expect(Math.abs(p.x)).toBeLessThanOrEqual(.05+1e-9);expect(p.y).toBeLessThanOrEqual(0);expect(p.y).toBeGreaterThanOrEqual(-.1);
    const roll=new THREE.Euler().setFromRotationMatrix(hurtBob(new THREE.Matrix4(),.84,0));
    expect(Math.abs(roll.z)).toBeGreaterThan(5*Math.PI/180);
    expect(hurtBob(new THREE.Matrix4(),0,0).equals(new THREE.Matrix4())).toBe(true);
  });
  test('held items are drawn as blocks, extruded sprites or the shield',()=>{
    expect(heldDisplay({id:'cobblestone',count:1})?.display).toBe('block');
    expect(heldDisplay({id:'diamond_sword',count:1})?.display).toBe('item');
    expect(heldDisplay({id:'torch',count:1})).toMatchObject({display:'item',icon:{kind:'tile'}});
    expect(heldDisplay({id:'shield',count:1})?.display).toBe('shield');
    expect(heldDisplay(null)).toBeNull();expect(heldDisplay({id:'nope',count:1})).toBeNull();
  });
});

describe('view motion',()=>{
  const player=(yaw:number,pitch=0,x=0,z=0)=>({x,z,yaw,pitch,onGround:true,swimming:false});
  /** Angle in degrees between the identity and a rotation matrix. */
  const turn=(m:THREE.Matrix4)=>new THREE.Quaternion().setFromRotationMatrix(m).angleTo(new THREE.Quaternion())/Math.PI*180;
  test('the hand lags half way behind a turn each tick and catches up',()=>{
    const v=createViewMotion();
    for(let i=0;i<3;i++)v.tick(player(0),false);
    expect(turn(v.lag(new THREE.Matrix4(),0,0,1,false))).toBeCloseTo(0,6);
    v.tick(player(1),false);
    const lag=[turn(v.lag(new THREE.Matrix4(),1,0,1,false))];
    for(let i=0;i<4;i++){v.tick(player(1),false);lag.push(turn(v.lag(new THREE.Matrix4(),1,0,1,false)));}
    // 0.1 × half of 57.3° after the first tick, then halving.
    expect(lag[0]).toBeCloseTo(57.2958*.5*.1,3);
    for(let i=1;i<lag.length;i++)expect(lag[i]).toBeCloseTo(lag[i-1]/2,3);
    expect(turn(v.lag(new THREE.Matrix4(),1,0,1,true))).toBe(0);
  });
  test('a restart or a load snaps the lag to the new view instead of spinning the hand',()=>{
    // Ten full turns, then reset: the player comes back at yaw 0.
    const v=createViewMotion();
    for(let i=0;i<=100;i++)v.tick(player(i*.2*Math.PI),false);
    v.reset();
    // In the start menu no ticks run: the first frame snaps.
    expect(turn(v.lag(new THREE.Matrix4(),0,0,.5,false))).toBeCloseTo(0,6);
    v.tick(player(0),false);expect(turn(v.lag(new THREE.Matrix4(),0,0,.5,false))).toBeCloseTo(0,6);
    // Loading a save turns the view to yaw 3 after a frame at yaw 0: 'restored' resyncs.
    v.resync();
    expect(turn(v.lag(new THREE.Matrix4(),3,-.4,.5,false))).toBeCloseTo(0,6);
    v.tick(player(3,-.4),false);expect(turn(v.lag(new THREE.Matrix4(),3,-.4,.5,false))).toBeCloseTo(0,6);
    // A jump of more than half a turn (an unwrapped yaw restored without the event) snaps too.
    v.tick(player(3+4*Math.PI,-.4),false);expect(turn(v.lag(new THREE.Matrix4(),3+4*Math.PI,-.4,.5,false))).toBeCloseTo(0,6);
  });
  test('every hit tilts the view for 10 ticks, rising from and falling back to level',()=>{
    const v=createViewMotion(),roll=()=>Math.abs(new THREE.Euler().setFromRotationMatrix(v.camera(new THREE.Matrix4(),0,false)).z)/Math.PI*180;
    expect(roll()).toBeCloseTo(0,6);
    v.hurt();expect(v.hurtTime).toBe(HURT_TICKS);expect(roll()).toBeCloseTo(0,4);
    const seen:number[]=[];
    for(let i=0;i<12;i++){v.frame(.05,false);seen.push(roll());}
    expect(Math.max(...seen)).toBeGreaterThan(13);expect(seen[seen.length-1]).toBeCloseTo(0,6);expect(v.hurtTime).toBe(0);
    // Reduced motion: no tilt.
    v.hurt();v.frame(.025,false);expect(roll()).toBeGreaterThan(1);expect(turn(v.camera(new THREE.Matrix4(),0,true))).toBe(0);
  });
  test('the death roll grows on frame time, since the engine runs no ticks while dead',()=>{
    const v=createViewMotion();
    v.frame(.5,true);expect(v.deathTime).toBeCloseTo(10);
    v.frame(.1,true);v.frame(.1,true);v.frame(.1,true);v.frame(.1,true);v.frame(.1,true);v.frame(.1,true);
    expect(v.deathTime).toBe(DEATH_TICKS);
    const roll=new THREE.Euler().setFromRotationMatrix(v.camera(new THREE.Matrix4(),0,false)).z/Math.PI*180;
    expect(Math.abs(roll)).toBeCloseTo(40-8000/220,3);
    v.frame(.016,false);expect(v.deathTime).toBe(0);
  });
  test('walking bobs the view on the ground only',()=>{
    const v=createViewMotion(),offset=()=>new THREE.Vector3().setFromMatrixPosition(v.camera(new THREE.Matrix4(),1,false)).length();
    for(let i=0;i<10;i++)v.tick({...player(0,0,0,i*.2)},false);
    expect(offset()).toBeGreaterThan(.01);
    for(let i=0;i<30;i++)v.tick({...player(0,0,0,2+i*.2),onGround:false},false);
    expect(offset()).toBeLessThan(.001);
  });
});

describe('hand art',()=>{
  test('the arm skin is opaque skin with a teal sleeve at the shoulder',()=>{
    const px=paintArmSkin(),pixel=(x:number,y:number)=>Array.from(px.subarray((y*HAND_SLOT+x)*4,(y*HAND_SLOT+x)*4+4));
    expect(pixel(0,0)[3]).toBe(0);expect(pixel(5,10)[3]).toBe(255);
    const skin=pixel(5,12),sleeve=pixel(5,5);
    expect(skin[0]).toBeGreaterThan(skin[2]+40);expect(sleeve[2]).toBeGreaterThan(sleeve[0]+80);
  });
  test('sprites extrude into front, back and one-pixel side walls (vanilla ItemModelGenerator)',()=>{
    const one=new Uint8ClampedArray(16*16*4);one[(5*16+7)*4+3]=255;
    const buf=new HandBuffer();expect(addSprite(buf,one,1,0)).toBe(6);
    const full=new Uint8ClampedArray(16*16*4).fill(255);expect(addSprite(new HandBuffer(),full,1,0)).toBe(2+64);
    // Front at z = 8.5/16, back at 7.5/16, in a 0..1 square.
    expect(buf.position[2]).toBeCloseTo(8.5/16);expect(buf.position[12+2]).toBeCloseTo(7.5/16);
    addArm(buf,0);expect(buf.quads).toBe(12);
  });
});

describe('hand service',()=>{
  function setup(){
    const game=createFakeGame();game.flat(60);
    const mesh:ChunkMesh={opaque:{position:new Uint16Array([0,0,16,240,16,0,16,240,0,16,16,240,16,16,16,240]),uvt:new Uint16Array([0,0,1,255,16,0,1,255,0,16,1,255,16,16,1,255]),
      tint:new Uint8Array(16).fill(255),quads:1},cutout:{position:new Uint16Array(0),uvt:new Uint16Array(0),tint:new Uint8Array(0),quads:0},
      translucent:{position:new Uint16Array(0),uvt:new Uint16Array(0),tint:new Uint8Array(0),quads:0},minY:0,maxY:1};
    game.mesher={meshChunk:()=>mesh,meshBlock:()=>mesh};
    const hand=createHand(game,atlas());
    const update=()=>hand.update(.5,new THREE.Matrix4(),16/9,{r:1,g:1,b:1});
    return{game,hand,update};
  }
  test('an empty main hand shows the arm; a held block or sprite replaces it; the offhand adds its item',()=>{
    const {game,hand,update}=setup();
    for(let i=0;i<6;i++)hand.tick();update();
    expect(hand.mesh.geometry.drawRange.count).toBe(6*6);
    game.inventory.setSlot(0,{id:'cobblestone',count:5});
    for(let i=0;i<10;i++)hand.tick();update();
    expect(hand.state.main).toBe('cobblestone');expect(hand.mesh.geometry.drawRange.count).toBe(6);
    game.inventory.setSlot(0,{id:'stick',count:1});(game.inventory as {offhand:unknown}).offhand={id:'apple',count:1};
    for(let i=0;i<10;i++)hand.tick();update();
    expect(hand.state.off).toBe('apple');expect(hand.mesh.geometry.drawRange.count).toBeGreaterThan(6*4);
  });
  test('switching items dips the hand and raises it with the new item (equip animation)',()=>{
    const {game,hand}=setup();
    game.inventory.setSlot(0,{id:'cobblestone',count:1});
    for(let i=0;i<10;i++)hand.tick();
    expect(hand.state.mainHeight).toBeCloseTo(1);
    game.inventory.setSlot(0,{id:'stick',count:1});
    const heights:number[]=[];
    for(let i=0;i<10;i++){hand.tick();heights.push(hand.state.mainHeight);}
    expect(Math.min(...heights)).toBeLessThan(.1);expect(heights[0]).toBeGreaterThan(.5);expect(hand.state.main).toBe('stick');
    expect(heights[heights.length-1]).toBeCloseTo(1);
    // Count changes of the same item do not re-equip.
    game.inventory.setSlot(0,{id:'stick',count:2});hand.tick();expect(hand.state.mainHeight).toBeCloseTo(1);
  });
  test('the attack cooldown keeps the main hand low until it recharges',()=>{
    const {game,hand}=setup();
    for(let i=0;i<6;i++)hand.tick();
    (game.interaction as {attackCharge:number}).attackCharge=.2;
    for(let i=0;i<3;i++)hand.tick();
    expect(hand.state.mainHeight).toBeLessThan(.05);
  });
  test('swings last 6 ticks and only restart past the half way point',()=>{
    const {hand}=setup();
    hand.swing();
    const seen:number[]=[];
    for(let i=0;i<SWING_TICKS+1;i++){hand.tick();seen.push(hand.state.swing);}
    expect(seen.slice(0,SWING_TICKS)).toEqual([0,1/6,2/6,3/6,4/6,5/6]);expect(seen[SWING_TICKS]).toBe(0);
    hand.swing();hand.tick();hand.tick();hand.swing();hand.tick();expect(hand.state.swing).toBeCloseTo(2/6);
    hand.tick();hand.swing();hand.tick();expect(hand.state.swing).toBe(0);
  });
  test('reset clears the shown items and dispose frees the GPU objects',()=>{
    const {game,hand,update}=setup();
    game.inventory.setSlot(0,{id:'stick',count:1});for(let i=0;i<10;i++)hand.tick();update();
    hand.reset();expect(hand.state.main).toBe('');
    const disposed:string[]=[];
    hand.mesh.geometry.addEventListener('dispose',()=>disposed.push('geometry'));
    (hand.mesh.material as THREE.Material).addEventListener('dispose',()=>disposed.push('material'));
    hand.dispose();expect(disposed.sort()).toEqual(['geometry','material']);
  });
});
