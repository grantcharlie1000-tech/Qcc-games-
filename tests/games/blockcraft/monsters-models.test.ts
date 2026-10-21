import {describe,expect,test} from 'vitest';
import {blockId,B} from '../../../src/games/blockcraft/data/blocks';
import {HOLDABLE_BLOCKS} from '../../../src/games/blockcraft/entity/monsters-enderman';
import {CARRIED_BLOCKS,ENDERMAN_HEAD_PX,EYE_MAGENTA,SLIME_OUTER_ALPHA,SLIME_RIM_ALPHA,carriedPart,createEndermanModel,createSlimeModel,slimeAppearance}
  from '../../../src/games/blockcraft/entity/monsters-models';
import type {AnimationState,Entity,EntityModel,ModelBox,PartPose} from '../../../src/games/blockcraft/engine/contracts';

type Rect={x:number;y:number;w:number;h:number};
/** Texture rectangles of the faces a box actually draws (contract unwrap; zero-area faces and the second face of a
 *  zero-thickness pair are skipped, as the entity renderer does). */
function faces(b:ModelBox):Rect[]{
  const [w,h,d]=b.size,[u,v]=b.uv;
  const all=[{x:u+d,y:v,w,h:d},{x:u+d+w,y:v,w,h:d},{x:u,y:v+d,w:d,h},{x:u+d,y:v+d,w,h},{x:u+d+w,y:v+d,w:d,h},{x:u+2*d+w,y:v+d,w,h}];
  const drop=[false,h===0,false,false,w===0,d===0];
  return all.filter((f,i)=>f.w*f.h>0&&!drop[i]);
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
const PLANTS=new Set(['dandelion','poppy','blue_orchid','allium','cornflower','oxeye_daisy','brown_mushroom','red_mushroom']);
const isPlantPart=(name:string)=>PLANTS.has(name.replace(/^carried_/,''));
/** Average colour of a texture rectangle (opaque pixels only). */
function average(at:(x:number,y:number)=>number[],r:Rect){
  let n=0;const sum=[0,0,0];
  for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const c=at(x,y);if(c[3]===0)continue;n++;sum[0]+=c[0];sum[1]+=c[1];sum[2]+=c[2];}
  return sum.map(s=>s/Math.max(1,n));
}

describe.each([['enderman',createEndermanModel()],['slime',createSlimeModel()]])('%s model',(_name,model)=>{
  test('every drawn face lies inside the texture and is painted (plants: a sprite on a transparent ground)',()=>{
    const at=painted(model);
    for(const part of model.parts)for(const box of part.boxes)for(const f of faces(box)){
      expect(f.x).toBeGreaterThanOrEqual(0);expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x+f.w).toBeLessThanOrEqual(model.textureWidth);expect(f.y+f.h).toBeLessThanOrEqual(model.textureHeight);
      let opaque=0,clear=0;
      for(let y=f.y;y<f.y+f.h;y++)for(let x=f.x;x<f.x+f.w;x++)if(at(x,y)[3]>0)opaque++;else clear++;
      if(isPlantPart(part.name)){expect(opaque).toBeGreaterThan(6);expect(clear).toBeGreaterThan(20);}
      else expect(clear).toBe(0);
    }
  });
  test('part names are unique and parts are top-level',()=>{
    const names=model.parts.map(p=>p.name);
    expect(new Set(names).size).toBe(names.length);
    for(const p of model.parts)expect(p.children).toBeUndefined();
  });
  test('the skin uses the vanilla 64-wide layout',()=>{
    expect(model.textureWidth).toBe(64);
    const uv=(name:string)=>model.parts.find(p=>p.name===name)!.boxes[0].uv;
    if(_name==='enderman'){
      expect(uv('head')).toEqual([0,0]);expect(uv('jaw')).toEqual([0,16]);expect(uv('body')).toEqual([32,16]);
      for(const limb of ['right_arm','left_arm','right_leg','left_leg'])expect(uv(limb)).toEqual([56,0]);
    }else{
      expect(model.textureHeight).toBe(32);
      expect(uv('outer')).toEqual([0,0]);expect(uv('core')).toEqual([0,16]);
      expect(uv('right_eye')).toEqual([32,0]);expect(uv('left_eye')).toEqual([32,4]);expect(uv('mouth')).toEqual([32,8]);
    }
  });
});

describe('enderman model',()=>{
  const model=createEndermanModel(),at=painted(model);
  test('2.9 blocks tall in Java proportions: head crown near the top, feet on the ground',()=>{
    let min=Infinity,max=-Infinity;
    for(const p of model.parts)if(!p.name.startsWith('carried_'))for(const b of p.boxes){min=Math.min(min,p.pivot[1]+b.from[1]);max=Math.max(max,p.pivot[1]+b.from[1]+b.size[1]);}
    expect(min).toBe(0);expect(max/16).toBeGreaterThan(2.8);expect(max/16).toBeLessThanOrEqual(2.9);
    const head=model.parts.find(p=>p.name==='head')!;
    expect(head.pivot[1]).toBe(ENDERMAN_HEAD_PX.bottom);expect(head.pivot[1]+head.boxes[0].size[1]).toBe(ENDERMAN_HEAD_PX.top);
  });
  test('only the eyes are emissive; nothing is tinted',()=>{
    expect(model.parts.filter(p=>p.emissive).map(p=>p.name)).toEqual(['eyes']);
    expect(model.parts.filter(p=>p.tinted)).toEqual([]);
  });
  test('near-black skin; the eye slits are magenta, glowing in front of the face',()=>{
    for(const name of ['head','jaw','body','right_arm']){
      const box=model.parts.find(p=>p.name===name)!.boxes[0];
      for(const f of faces(box)){const [r,g,b]=average(at,f);expect(r+g+b).toBeLessThan(80);}
    }
    const eyes=model.parts.find(p=>p.name==='eyes')!;
    expect(eyes.boxes).toHaveLength(2);
    for(const box of eyes.boxes){
      expect(box.size).toEqual([3,1,0]);expect(box.from[2]).toBeLessThan(-4);// just in front of the face (z = -4)
      for(const f of faces(box))for(let x=f.x;x<f.x+f.w;x++){const [r,g,b]=at(x,f.y);expect(r).toBeGreaterThan(180);expect(b).toBeGreaterThan(220);expect(g).toBeLessThan(r);}
    }
    expect(at(32,0).slice(0,3)).toEqual([EYE_MAGENTA>>16,EYE_MAGENTA>>8&255,EYE_MAGENTA&255]);
    // The face itself has the dark slits at the same row (face row 4: texture row 12).
    const [r,,b]=at(8,12);expect(b).toBeGreaterThan(r*.5);expect(b).toBeGreaterThan(60);
  });
  test('every holdable block has its own carried part, and nothing else does',()=>{
    expect([...CARRIED_BLOCKS].sort()).toEqual([...HOLDABLE_BLOCKS].sort());
    for(const name of HOLDABLE_BLOCKS){
      const part=model.parts.find(p=>p.name===carriedPart(blockId(name)));
      expect(part).toBeDefined();
      expect(part!.boxes.length).toBe(PLANTS.has(name)?2:6);
      // Planes only, each reading one 8×8 tile of the carried-block area (rows 32–63).
      for(const box of part!.boxes){expect(box.size.filter(s=>s===0)).toHaveLength(1);for(const f of faces(box)){expect(f.w).toBe(8);expect(f.h).toBe(8);expect(f.y).toBeGreaterThanOrEqual(32);}}
    }
    expect(carriedPart(B.stone)).toBeUndefined();expect(carriedPart(undefined)).toBeUndefined();expect(carriedPart('dirt')).toBeUndefined();
  });
  test('carried blocks look like their blocks: grass with a green top and fringed dirt sides, red TNT, a red poppy',()=>{
    const tile=(name:string,face:number)=>{
      const part=model.parts.find(p=>p.name===`carried_${name}`)!;
      const f=faces(part.boxes[face])[0];return f;
    };
    const top=average(at,tile('grass_block',0)),bottom=average(at,tile('grass_block',1)),side=tile('grass_block',2);
    expect(top[1]).toBeGreaterThan(top[0]*1.2);expect(top[1]).toBeGreaterThan(top[2]*1.5);
    expect(bottom[0]).toBeGreaterThan(bottom[1]);expect(bottom[1]).toBeGreaterThan(bottom[2]);// brown dirt
    const fringe=average(at,{...side,h:1}),soil=average(at,{...side,y:side.y+4,h:4});
    expect(fringe[1]).toBeGreaterThan(fringe[0]);expect(soil[0]).toBeGreaterThan(soil[1]);
    const tnt=average(at,tile('tnt',2));expect(tnt[0]).toBeGreaterThan(tnt[1]*1.5);
    const poppy=average(at,tile('poppy',0));expect(poppy[0]).toBeGreaterThan(poppy[2]);
    const sand=average(at,tile('sand',0));expect(sand[0]).toBeGreaterThan(180);expect(sand[2]).toBeLessThan(sand[0]);
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
  test('carrying shows only that block, turned 45° (plants square to the body), with both arms forward',()=>{
    const pose:Record<string,PartPose>={};
    const shown=()=>Object.entries(pose).filter(([n,p])=>n.startsWith('carried_')&&p.visible).map(([n])=>n);
    model.animate!(entity({carried:B.dirt}),pose,state({limbAmount:1,limbSwing:2}));
    expect(shown()).toEqual(['carried_dirt']);
    expect(pose.carried_dirt.y).toBeCloseTo(Math.PI/4);
    expect(pose.right_arm.x).toBeCloseTo(.5);expect(pose.left_arm.x).toBeCloseTo(.5);
    model.animate!(entity({carried:blockId('poppy')}),pose,state());
    expect(shown()).toEqual(['carried_poppy']);expect(pose.carried_poppy.y).toBe(0);
    const head=pose.head;
    model.animate!(entity(),pose,state({limbAmount:1,limbSwing:2}));
    expect(shown()).toEqual([]);expect(Math.abs(pose.right_leg.x)).toBeLessThanOrEqual(.4);
    expect(pose.head).toBe(head);// pose objects are reused frame to frame
    // The held block sits in front of the body at the hands, tipped toward the viewer (vanilla CarriedBlockLayer).
    const dirt=model.parts.find(p=>p.name==='carried_dirt')!;
    expect(dirt.pivot).toEqual([0,13,-12]);expect(dirt.rotation![0]).toBeLessThan(0);
  });
});

describe('slime model',()=>{
  const model=createSlimeModel(),at=painted(model);
  test('translucent green outer cube with a lighter rim around an opaque core with dark eyes and mouth',()=>{
    expect(model.parts.map(p=>p.name)).toEqual(['core','right_eye','left_eye','mouth','outer']);
    const outer=model.parts.find(p=>p.name==='outer')!.boxes[0],core=model.parts.find(p=>p.name==='core')!.boxes[0];
    const front=faces(outer)[3],coreFront=faces(core)[3];
    const inner=at(front.x+4,front.y+5),rim=at(front.x,front.y+4);
    expect(inner[3]).toBe(SLIME_OUTER_ALPHA);expect(inner[3]).toBeGreaterThan(128);expect(inner[3]).toBeLessThan(255);
    expect(rim[3]).toBe(SLIME_RIM_ALPHA);expect(rim[1]).toBeGreaterThan(inner[1]);
    for(const c of [inner,rim]){expect(c[1]).toBeGreaterThan(c[0]);expect(c[1]).toBeGreaterThan(c[2]);}
    expect(at(coreFront.x+2,coreFront.y+3)[3]).toBe(255);
    const [r,g,b]=average(at,coreFront);expect(g).toBeGreaterThan(r);expect(g).toBeGreaterThan(b);
    // Eyes are drawn in front of the core but inside the outer cube, near-black.
    for(const name of ['right_eye','left_eye','mouth']){
      const box=model.parts.find(p=>p.name===name)!.boxes[0];
      expect(box.from[2]).toBeLessThan(core.from[2]);expect(box.from[2]).toBeGreaterThan(outer.from[2]);
      const c=average(at,faces(box)[3]);expect(c[0]+c[1]+c[2]).toBeLessThan(150);
    }
  });
  test('appearance scale is the size, from shared objects',()=>{
    for(const size of [1,2,4]){expect(slimeAppearance(size).scale).toBe(size);expect(slimeAppearance(size)).toBe(slimeAppearance(size));}
    expect(slimeAppearance('x').scale).toBe(1);
  });
});
