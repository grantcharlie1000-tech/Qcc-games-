import {describe,expect,it} from 'vitest';
import type {AnimationState,Entity,EntityModel,ModelPart,PartPose} from '../../../src/games/blockcraft/engine/contracts';
import {SQUID_TENTACLES,WOLF_VARIANTS,bodyRoll,faceRects,newWolfLook,posedTransforms,squidModel,squidTentacle,transformPoint,wolfModel,wolfNames,
  type SquidLook,type WolfLook} from '../../../src/games/blockcraft/entity/companions-art';

const anim=(o:Partial<AnimationState>={}):AnimationState=>({time:0,partial:1,limbSwing:0,limbAmount:0,headYaw:0,headPitch:0,attack:0,reducedMotion:false,...o});
const entity={kind:'wolf',data:{}} as unknown as Entity;
function paint(m:EntityModel){const px=new Uint8ClampedArray(m.textureWidth*m.textureHeight*4);m.paint(px,m.textureWidth,m.textureHeight);return px;}
function* boxes(parts:readonly ModelPart[]):Generator<[ModelPart,ModelPart['boxes'][number]]>{
  for(const p of parts){for(const b of p.boxes)yield[p,b];if(p.children)yield*boxes(p.children);}
}
/** Every texel of every drawn face region of the model. */
function faceTexels(m:EntityModel):[number,number,string][]{
  const out:[number,number,string][]=[];
  for(const [p,b] of boxes(m.parts)){
    const [w,h,d]=b.size,drop=[false,h===0,false,false,w===0,d===0];
    faceRects(b.uv,b.size,!!b.mirror).forEach(([x,y,rw,rh],f)=>{
      if(drop[f])return;
      for(let j=0;j<rh;j++)for(let i=0;i<rw;i++)out.push([x+i,y+j,p.name]);
    });
  }
  return out;
}
function bounds(parts:readonly ModelPart[],pose:Record<string,PartPose>){
  const t=posedTransforms(parts,pose),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const walk=(list:readonly ModelPart[])=>{for(const p of list){
    const m=t.get(p.name);if(!m)continue;
    for(const b of p.boxes)for(let k=0;k<8;k++){
      const c=transformPoint(m,k&1?b.from[0]+b.size[0]:b.from[0],k&2?b.from[1]+b.size[1]:b.from[1],k&4?b.from[2]+b.size[2]:b.from[2]);
      for(let a=0;a<3;a++){min[a]=Math.min(min[a],c[a]);max[a]=Math.max(max[a],c[a]);}
    }
    if(p.children)walk(p.children);
  }};
  walk(parts);
  return{min,max};
}
function wolfWith(look:Partial<WolfLook>){
  const model=wolfModel((_e,_p,out)=>{Object.assign(out,newWolfLook(),look);});
  return model;
}
function pose(model:EntityModel,s=anim()){const p:Record<string,PartPose>={};model.animate!(entity,p,s);return p;}

describe('companion textures',()=>{
  it('paint every face texel of the wolf skins and collar opaque, with vanilla 64×32 skins',()=>{
    const m=wolfWith({});
    expect(m.textureWidth).toBe(64);expect(m.textureHeight).toBe(32*3+16);
    const px=paint(m);
    for(const [x,y,part] of faceTexels(m))expect(px[(y*m.textureWidth+x)*4+3],`${part} ${x},${y}`).toBe(255);
  });
  it('gives each wolf variant its own coat and a greyscale collar for tinting',()=>{
    const m=wolfWith({}),px=paint(m),w=m.textureWidth;
    const at=(x:number,y:number)=>[px[(y*w+x)*4],px[(y*w+x)*4+1],px[(y*w+x)*4+2]];
    // Body side texels of each skin (the region at 18..24, 20..29 of each 64×32 skin).
    const avg=(v:number)=>{let r=0,g=0,b=0;for(let y=20;y<29;y++)for(let x=18;x<24;x++){const c=at(x,y+v*32);r+=c[0];g+=c[1];b+=c[2];}return[r,g,b].map(c=>c/54);};
    const [pale,woods,ashen]=[0,1,2].map(avg);
    expect(pale[0]).toBeGreaterThan(woods[0]);
    expect(woods[0]-woods[2]).toBeGreaterThan(30);// brown
    expect(Math.abs(ashen[0]-ashen[2])).toBeLessThan(20);// grey
    for(let y=96;y<105;y++)for(let x=0;x<30;x++){const [r,g,b]=at(x,y);expect(r).toBe(g);expect(g).toBe(b);}
  });
  it('paints the squid skin fully, dark blue with a pale beak underneath',()=>{
    const m=squidModel(()=>{}),px=paint(m);
    expect([m.textureWidth,m.textureHeight]).toEqual([64,32]);
    for(const [x,y,part] of faceTexels(m))expect(px[(y*64+x)*4+3],`${part} ${x},${y}`).toBe(255);
    const front=(x:number,y:number)=>{const o=(y*64+x)*4;return[px[o],px[o+1],px[o+2]];};
    const [r,g,b]=front(18,16);
    expect(b).toBeGreaterThan(r);expect(b).toBeGreaterThan(60);
    // Bottom face (24..36, 0..12) centre: the beak.
    const beak=front(29,5);
    expect(beak[0]).toBeGreaterThan(150);
    void g;
  });
});

describe('wolf model',()=>{
  it('stands on the ground in vanilla proportions',()=>{
    const m=wolfWith({}),{min,max}=bounds(m.parts,pose(m));
    expect(min[1]).toBeCloseTo(0,5);
    expect(max[1]).toBeCloseTo(15.5,1);// ear tips
    expect(min[2]).toBeCloseTo(-12,1);// snout
    expect(max[0]).toBeLessThanOrEqual(4.6);expect(min[0]).toBeGreaterThanOrEqual(-4.6);
  });
  it('shows one coat and the face, collar and eyes that match the wolf',()=>{
    const wild=pose(wolfWith({variant:1}));
    expect(WOLF_VARIANTS.map(v=>wild[v].visible)).toEqual([false,true,false]);
    const n=wolfNames('woods');
    expect(wild[n.collar].visible).toBe(false);expect(wild[n.eyesTame].visible).toBe(false);expect(wild[n.eyesAngry].visible).toBe(false);
    const angry=pose(wolfWith({variant:1,angry:true}));
    expect(angry[n.eyesAngry].visible).toBe(true);
    const tame=pose(wolfWith({variant:1,tamed:true,angry:true}));
    expect(tame[n.collar].visible).toBe(true);expect(tame[n.eyesTame].visible).toBe(true);expect(tame[n.eyesAngry].visible).toBe(false);
  });
  it('sits with its hind legs folded under and its back sloping',()=>{
    // A tamed wolf at full health (only tamed wolves sit): tail at 0.55π.
    const standing=wolfWith({tamed:true,tail:.55*Math.PI}),sitting=wolfWith({tamed:true,sitting:true,tail:.55*Math.PI});
    const s=bounds(sitting.parts,pose(sitting)),u=bounds(standing.parts,pose(standing));
    // As in vanilla, the rump sinks about a pixel into the ground.
    expect(s.min[1]).toBeGreaterThan(-1.2);expect(s.min[1]).toBeLessThan(.6);
    const n=wolfNames('pale'),rear=(m:EntityModel)=>{
      const t=posedTransforms(m.parts,pose(m)).get(n.body)!;
      return transformPoint(t,0,-7,0)[1];// the body's rear end
    };
    expect(rear(sitting)).toBeLessThan(rear(standing)-3);
    expect(s.max[2]).toBeLessThan(u.max[2]);
  });
  it('swings its legs with the walk and raises its tail to the given angle',()=>{
    const m=wolfWith({tail:1.2}),n=wolfNames('pale');
    const p=pose(m,anim({limbSwing:1,limbAmount:1}));
    expect(p[n.rightHind].x).toBeCloseTo(-Math.cos(.6662)*1.4);
    expect(p[n.leftHind].x).toBeCloseTo(-p[n.rightHind].x);
    const still=pose(m);
    expect(still[n.tail].x).toBeCloseTo(-1.2);
    // A wild wolf wags as it walks; an angry one holds its tail still.
    expect(p[n.tail].y).toBeCloseTo(-Math.cos(.6662)*1.4);
    expect(pose(wolfWith({tail:1.2,angry:true}),anim({limbSwing:1,limbAmount:1}))[n.tail].y).toBe(0);
    const t=posedTransforms(m.parts,still).get(n.realTail)!;
    // The tail tip points back (+z) and up from hanging.
    const tip=transformPoint(t,-1,-8,0),base=transformPoint(t,-1,0,0);
    expect(tip[2]).toBeGreaterThan(base[2]+5);
  });
  it('tilts its head while begging and wobbles while shaking',()=>{
    const n=wolfNames('pale');
    expect(pose(wolfWith({headRoll:.4}))[n.realHead].z).toBeCloseTo(.4);
    expect(bodyRoll(0,0)).toBe(0);
    expect(Math.abs(bodyRoll(.95,0))).toBeGreaterThan(0);
    const p=pose(wolfWith({shake:.95}));
    expect(p[n.body].y).toBeCloseTo(-bodyRoll(.95,-.16));
  });
});

describe('squid model',()=>{
  const squidWith=(look:Partial<SquidLook>)=>squidModel((_e,_p,out)=>{out.pitch=look.pitch??0;out.spin=look.spin??0;out.tentacles=look.tentacles??0;});
  const tip=(m:EntityModel,k:number)=>{
    const t=posedTransforms(m.parts,pose(m)).get(squidTentacle(k))!;
    return transformPoint(t,0,-18,0);
  };
  it('hangs eight tentacles under the mantle that spread as they beat',()=>{
    const rest=squidWith({}),spread=squidWith({tentacles:Math.PI/4});
    const {min,max}=bounds(rest.parts,pose(rest));
    expect(max[1]).toBeCloseTo(12.8,1);expect(min[1]).toBeCloseTo(-20.2,1);
    for(let k=0;k<SQUID_TENTACLES;k++){
      const a=tip(rest,k),b=tip(spread,k);
      expect(Math.hypot(b[0],b[2])).toBeGreaterThan(Math.hypot(a[0],a[2])+5);
      expect(b[1]).toBeGreaterThan(a[1]);
    }
  });
  it('pitches mantle-first: at -90° the top of the mantle leads (-z)',()=>{
    const m=squidWith({pitch:-Math.PI/2});
    const t=posedTransforms(m.parts,pose(m)).get('body')!;
    const top=transformPoint(t,0,8,0),bottom=transformPoint(t,0,-8,0);
    expect(top[2]).toBeLessThan(bottom[2]-10);
    expect(Math.abs(top[1]-bottom[1])).toBeLessThan(.01);
  });
});
