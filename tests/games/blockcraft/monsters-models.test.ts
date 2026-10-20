import {describe,expect,test} from 'vitest';
import {blockId,B} from '../../../src/games/blockcraft/data/blocks';
import {HOLDABLE_BLOCKS} from '../../../src/games/blockcraft/entity/monsters-enderman';
import {CARRIED_COLOURS,SLIME_OUTER_ALPHA,carriedAppearance,createEndermanModel,createSlimeModel,slimeAppearance}
  from '../../../src/games/blockcraft/entity/monsters-models';
import type {AnimationState,Entity,EntityModel,ModelBox,PartPose} from '../../../src/games/blockcraft/engine/contracts';

/** Face rectangles of a box's standard cuboid unwrap (contract layout). */
function faces(b:ModelBox){
  const [w,h,d]=b.size,[u,v]=b.uv;
  return[{x:u+d,y:v,w,h:d},{x:u+d+w,y:v,w,h:d},{x:u,y:v+d,w:d,h},{x:u+d,y:v+d,w,h},{x:u+d+w,y:v+d,w:d,h},{x:u+2*d+w,y:v+d,w,h}];
}
function painted(model:EntityModel){
  const px=new Uint8ClampedArray(model.textureWidth*model.textureHeight*4);
  model.paint(px,model.textureWidth,model.textureHeight);
  return(x:number,y:number)=>{const i=(y*model.textureWidth+x)*4;return[px[i],px[i+1],px[i+2],px[i+3]];};
}
function entity(data:Record<string,unknown>={}):Entity{
  return{id:3,kind:'enderman',category:'hostile',x:0,y:0,z:0,vx:0,vy:0,vz:0,yaw:0,pitch:0,headYaw:0,moveX:0,moveZ:0,jump:false,width:.6,height:2.9,
    onGround:true,inWater:false,inLava:false,collidedH:false,collidedV:false,health:40,maxHealth:40,age:0,hurtTime:0,deathTime:0,removed:false,fire:0,baby:false,data};
}
const state=(o:Partial<AnimationState>={}):AnimationState=>({time:1.234,partial:0,limbSwing:0,limbAmount:0,headYaw:.3,headPitch:-.2,attack:0,reducedMotion:false,...o});

describe.each([['enderman',createEndermanModel()],['slime',createSlimeModel()]])('%s model',(_name,model)=>{
  test('every box unwrap lies inside the texture and is fully painted',()=>{
    const at=painted(model);
    for(const part of model.parts)for(const box of part.boxes)for(const f of faces(box)){
      expect(f.x).toBeGreaterThanOrEqual(0);expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x+f.w).toBeLessThanOrEqual(model.textureWidth);expect(f.y+f.h).toBeLessThanOrEqual(model.textureHeight);
      for(let y=f.y;y<f.y+f.h;y++)for(let x=f.x;x<f.x+f.w;x++)expect(at(x,y)[3]).toBeGreaterThan(0);
    }
  });
  test('part names are unique and parts are top-level',()=>{
    const names=model.parts.map(p=>p.name);
    expect(new Set(names).size).toBe(names.length);
    for(const p of model.parts)expect(p.children).toBeUndefined();
  });
});

describe('enderman model',()=>{
  const model=createEndermanModel();
  test('2.9 blocks tall in Java proportions: head crown near the top, feet on the ground',()=>{
    let min=Infinity,max=-Infinity;
    for(const p of model.parts)if(p.name!=='carried')for(const b of p.boxes){min=Math.min(min,p.pivot[1]+b.from[1]);max=Math.max(max,p.pivot[1]+b.from[1]+b.size[1]);}
    expect(min).toBe(0);expect(max/16).toBeGreaterThan(2.8);expect(max/16).toBeLessThanOrEqual(2.9);
  });
  test('only the eyes are emissive, only the carried block is tinted',()=>{
    expect(model.parts.filter(p=>p.emissive).map(p=>p.name)).toEqual(['eyes']);
    expect(model.parts.filter(p=>p.tinted).map(p=>p.name)).toEqual(['carried']);
  });
  test('near-black skin with magenta eyes',()=>{
    const at=painted(model);
    const eye=model.parts.find(p=>p.name==='eyes')!.boxes[0],front=faces(eye)[3];
    const [r,g,b]=at(front.x+1,front.y);// eye box front face, middle pixel
    expect(r).toBeGreaterThan(180);expect(b).toBeGreaterThan(180);expect(g).toBeLessThan(r);
    for(const [x,y] of [[10,10],[12,13],[40,24],[57,10]]){const c=at(x,y);expect(c[0]+c[1]+c[2]).toBeLessThan(150);expect(c[3]).toBe(255);}
  });
  test('every holdable block has a carried colour; appearances are shared objects',()=>{
    for(const name of HOLDABLE_BLOCKS)expect(CARRIED_COLOURS[name]).toBeTypeOf('number');
    const e=entity({carried:B.sand});
    expect(model.appearance!(e)).toBe(model.appearance!(e));
    expect(model.appearance!(e).tint).toBe(CARRIED_COLOURS.sand);
    expect(carriedAppearance(blockId('poppy')).tint).toBe(CARRIED_COLOURS.poppy);
    expect(carriedAppearance(undefined).tint).toBeUndefined();
  });
  test('angry: the head lifts 5 px off the jaw and the body shakes, except with reduced motion',()=>{
    const pose:Record<string,PartPose>={};
    model.animate!(entity({angry:true}),pose,state());
    expect(pose.head.py).toBe(5);expect(pose.eyes.py).toBe(5);expect(pose.jaw.py).toBe(0);
    expect(pose.head.x).toBeCloseTo(-.2);expect(pose.head.y).toBeCloseTo(.3);expect(pose.jaw.y).toBeCloseTo(.3);
    const shaking=Math.abs(pose.body.px??0)+Math.abs(pose.body.pz??0);
    model.animate!(entity({angry:true}),pose,state({time:2.5}));
    expect(shaking+Math.abs(pose.body.px??0)+Math.abs(pose.body.pz??0)).toBeGreaterThan(0);
    model.animate!(entity({angry:true}),pose,state({reducedMotion:true}));
    expect(pose.body.px).toBe(0);expect(pose.body.pz).toBe(0);expect(pose.head.py).toBe(5);
    model.animate!(entity(),pose,state());
    expect(pose.head.py).toBe(0);expect(pose.body.px).toBe(0);
  });
  test('carrying shows the block and holds both arms forward; otherwise the block is hidden',()=>{
    const pose:Record<string,PartPose>={};
    model.animate!(entity({carried:B.dirt}),pose,state({limbAmount:1,limbSwing:2}));
    expect(pose.carried.visible).toBe(true);expect(pose.right_arm.x).toBeCloseTo(.5);expect(pose.left_arm.x).toBeCloseTo(.5);
    const head=pose.head;
    model.animate!(entity(),pose,state({limbAmount:1,limbSwing:2}));
    expect(pose.carried.visible).toBe(false);expect(Math.abs(pose.right_leg.x)).toBeLessThanOrEqual(.4);
    expect(pose.head).toBe(head);// pose objects are reused frame to frame
  });
});

describe('slime model',()=>{
  const model=createSlimeModel();
  test('translucent outer cube around an opaque core with eyes and a mouth',()=>{
    expect(model.parts.map(p=>p.name)).toEqual(['core','right_eye','left_eye','mouth','outer']);
    const at=painted(model),outer=model.parts.find(p=>p.name==='outer')!.boxes[0],core=model.parts.find(p=>p.name==='core')!.boxes[0];
    const front=faces(outer)[3],coreFront=faces(core)[3];
    const alpha=at(front.x+4,front.y+5)[3];
    expect(alpha).toBe(SLIME_OUTER_ALPHA);expect(alpha).toBeGreaterThan(128);expect(alpha).toBeLessThan(255);
    expect(at(coreFront.x+2,coreFront.y+3)[3]).toBe(255);
    // Eyes are drawn in front of the core but inside the outer cube.
    for(const name of ['right_eye','left_eye','mouth']){
      const b=model.parts.find(p=>p.name===name)!.boxes[0];
      expect(b.from[2]).toBeLessThan(core.from[2]);expect(b.from[2]).toBeGreaterThan(outer.from[2]);
    }
  });
  test('appearance scale is the size, from shared objects',()=>{
    for(const size of [1,2,4]){expect(slimeAppearance(size).scale).toBe(size);expect(slimeAppearance(size)).toBe(slimeAppearance(size));}
    expect(slimeAppearance('x').scale).toBe(1);
  });
});
