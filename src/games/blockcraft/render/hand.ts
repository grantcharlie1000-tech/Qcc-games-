// First-person hand and held items after vanilla ItemInHandRenderer (1.20): the same pose stack, numbers and order —
// view bob, the hand lagging behind fast turns, the equip dip when the held item changes (and while the attack
// cooldown recharges), the 6-tick swing, eating/drinking, drawing a bow and raising a shield. The main hand shows the
// bare arm when empty; the offhand shows only an item. Blocks come from game.mesher.meshBlock, items are extruded
// sprites from art/items.ts. One draw call with its own 70° projection, drawn in front of the world and last in the
// blended pass, so the translucent faces of a held block (ice) blend over the world like vanilla's translucent item sheet.
import * as THREE from 'three';
import {BLOCK_BY_NAME,TINTED_TILES} from '../data/blocks';
import {itemDef,type ItemIcon} from '../data/items';
import {SPRITE_PAINTERS,spritePixels,spriteTexturePixels,spriteTextureSize} from '../art/items';
import {tilePixels} from '../art/atlas';
import {quadIndices} from '../engine/constants';
import type {Game,ItemStack} from '../engine/contracts';
import {HandBuffer,HAND_SHEET_HEIGHT,HAND_SHEET_WIDTH,HAND_SLOT,MAX_HAND_QUADS,SLOT_ARM,SLOT_MAIN,SLOT_OFF,addArm,addBlockMesh,addSprite,paintArmSkin} from './hand-art';

const DEG=Math.PI/180;
/** Vanilla swing duration in ticks (no Haste / Mining Fatigue). */
export const SWING_TICKS=6;
/** Use durations (ticks) for the eating and drinking animation. */
const EAT_TICKS=32;
/** Vanilla item colours for tinted block items held in hand: GrassColor.get(0.5, 1.0) and FoliageColor default. */
const GRASS_ITEM=0x8eb971,FOLIAGE_ITEM=0x48b518;

type Display='block'|'item'|'shield';
interface ItemTransform{rotation:[number,number,number];translation:[number,number,number];scale:number}
/** Model display transforms (block/block.json, item/generated.json; the shield sprite stands in for the shield model). */
export const DISPLAY:Record<Display,{right:ItemTransform;left:ItemTransform}>={
  block:{right:{rotation:[0,45,0],translation:[0,0,0],scale:.4},left:{rotation:[0,225,0],translation:[0,0,0],scale:.4}},
  item:{right:{rotation:[0,-90,25],translation:[1.13,3.2,1.13],scale:.68},left:{rotation:[0,-90,25],translation:[1.13,3.2,1.13],scale:.68}},
  // The shield sprite faces the camera, mostly below the screen edge until raised.
  shield:{right:{rotation:[0,10,0],translation:[0,-2,0],scale:.9},left:{rotation:[0,10,0],translation:[0,-2,0],scale:.9}}
};
const scratch=new THREE.Matrix4();
const T=(m:THREE.Matrix4,x:number,y:number,z:number)=>m.multiply(scratch.makeTranslation(x,y,z));
const RX=(m:THREE.Matrix4,deg:number)=>m.multiply(scratch.makeRotationX(deg*DEG));
const RY=(m:THREE.Matrix4,deg:number)=>m.multiply(scratch.makeRotationY(deg*DEG));
const RZ=(m:THREE.Matrix4,deg:number)=>m.multiply(scratch.makeRotationZ(deg*DEG));
const S=(m:THREE.Matrix4,x:number,y:number,z:number)=>m.multiply(scratch.makeScale(x,y,z));

/** ItemTransform.apply (left hand mirrors: rotation y and z and translation x negated) then ItemRenderer's -0.5 offset. */
export function applyDisplay(m:THREE.Matrix4,display:Display,left:boolean):THREE.Matrix4{
  const t=left?DISPLAY[display].left:DISPLAY[display].right,i=left?-1:1;
  T(m,i*t.translation[0]/16,t.translation[1]/16,t.translation[2]/16);
  // Quaternionf.rotationXYZ: X, then Y, then Z (intrinsic).
  RX(m,t.rotation[0]);RY(m,left?-t.rotation[1]:t.rotation[1]);RZ(m,left?-t.rotation[2]:t.rotation[2]);
  S(m,t.scale,t.scale,t.scale);
  return T(m,-.5,-.5,-.5);
}
/** renderPlayerArm: the bare right (side 1) or left (-1) arm for swing 0..1 and equip progress 0..1 (1 = lowered). */
export function armPose(m:THREE.Matrix4,side:number,swing:number,equip:number):THREE.Matrix4{
  const f=side,f1=Math.sqrt(swing),f2=-.3*Math.sin(f1*Math.PI),f3=.4*Math.sin(f1*Math.PI*2),f4=-.4*Math.sin(swing*Math.PI);
  T(m,f*(f2+.64000005),f3-.6+equip*-.6,f4-.71999997);
  RY(m,f*45);
  const f5=Math.sin(swing*swing*Math.PI),f6=Math.sin(f1*Math.PI);
  RY(m,f*f6*70);RZ(m,f*f5*-20);
  T(m,f*-1,3.6,3.5);RZ(m,f*120);RX(m,200);RY(m,f*-135);T(m,f*5.6,0,0);
  // PlayerModel arm part: pivot (∓5, 2, 0) pixels, rest roll from bobModelPart at age 0 (±0.1 rad), 1/16 scale.
  T(m,-5*f/16,2/16,0);m.multiply(scratch.makeRotationZ(.1*f));
  return S(m,1/16,1/16,1/16);
}
/** applyItemArmTransform. */
export function itemArmTransform(m:THREE.Matrix4,side:number,equip:number){return T(m,side*.56,-.52+equip*-.6,-.72);}
/** The swing for an item held in hand (translation plus applyItemArmAttackTransform around the arm transform). */
export function itemSwingPose(m:THREE.Matrix4,side:number,swing:number,equip:number):THREE.Matrix4{
  const r=Math.sqrt(swing),f5=-.4*Math.sin(r*Math.PI),f6=.2*Math.sin(r*Math.PI*2),f10=-.2*Math.sin(swing*Math.PI);
  T(m,side*f5,f6,f10);itemArmTransform(m,side,equip);
  const f=Math.sin(swing*swing*Math.PI);RY(m,side*(45+f*-20));
  const f1=Math.sin(r*Math.PI);RZ(m,side*f1*-20);RX(m,f1*-80);RY(m,side*-45);
  return m;
}
/** applyEatTransform for `used` ticks of a `duration`-tick use (EAT and DRINK). */
export function eatPose(m:THREE.Matrix4,side:number,used:number,duration=EAT_TICKS):THREE.Matrix4{
  const f=Math.max(0,duration-used),f1=f/duration;
  if(f1<.8)T(m,0,Math.abs(Math.cos(f/4*Math.PI)*.1),0);
  const f3=1-Math.pow(f1,27);
  T(m,f3*.6*side,f3*-.5,0);RY(m,side*f3*90);RX(m,f3*10);RZ(m,side*f3*30);
  return m;
}
/** The BOW use animation after applyItemArmTransform, `used` ticks drawn. */
export function bowPose(m:THREE.Matrix4,side:number,used:number):THREE.Matrix4{
  T(m,side*-.2785682,.18344387,.15731531);RX(m,-13.935);RY(m,side*35.3);RZ(m,side*-9.785);
  let f12=used/20;f12=(f12*f12+f12*2)/3;if(f12>1)f12=1;
  if(f12>.1){const f20=Math.sin((used-.1)*1.3)*(f12-.1);T(m,0,f20*.004,0);}
  T(m,0,0,f12*.04);S(m,1,1,1+f12*.2);RY(m,-side*45);
  return m;
}
/** GameRenderer.bobView: walk distance and bob amount (vanilla units: 0.6 × blocks walked; 0..0.1). */
export function viewBob(m:THREE.Matrix4,walk:number,bob:number):THREE.Matrix4{
  const f1=-walk;
  T(m,Math.sin(f1*Math.PI)*bob*.5,-Math.abs(Math.cos(f1*Math.PI)*bob),0);
  RZ(m,Math.sin(f1*Math.PI)*bob*3);RX(m,Math.abs(Math.cos(f1*Math.PI-.2)*bob)*5);
  return m;
}
/** GameRenderer.bobHurt: hurt tilt for 1..0 of the hurt time left, and the death roll after `deathTicks`. */
export function hurtBob(m:THREE.Matrix4,hurt:number,deathTicks:number):THREE.Matrix4{
  if(deathTicks>0)RZ(m,40-8000/(Math.min(deathTicks,20)+200));
  if(hurt>0){const f=Math.sin(hurt*hurt*hurt*hurt*Math.PI);RZ(m,-f*14);}
  return m;
}
/** Vanilla hurtDuration: the hurt tilt lasts 10 ticks. */
export const HURT_TICKS=10;
/** The death roll and FOV narrowing reach their end after 20 ticks (vanilla deathTime). */
export const DEATH_TICKS=20;
/** Camera and hand motion (vanilla Player.walkDist / bob, LocalPlayer.xBob / yBob, LivingEntity.hurtTime / deathTime). */
export interface ViewMotion{
  /** 20 Hz: walk distance and bob amount from the player's movement, and the hand lagging half way to the view. */
  tick(p:{x:number;z:number;yaw:number;pitch:number;onGround:boolean;swimming:boolean},dead:boolean):void;
  /** Every frame: the hurt tilt and the death time run on frame time, because the engine runs no ticks once dead. */
  frame(dt:number,dead:boolean):void;
  /** A hit (playerDamaged): restart the hurt tilt, whatever screen overlay shows. */
  hurt():void;
  /** Forget the hand lag so it snaps to the view on the next tick or frame (restart, load, respawn). */
  resync():void;
  reset():void;
  /** Death roll, hurt tilt and view bob for the partial tick, appended to `m` (nothing with reduced motion). */
  camera(m:THREE.Matrix4,partial:number,reduced:boolean):THREE.Matrix4;
  /** The hand's lag behind fast turns (yaw / pitch in radians), appended to `m` (nothing with reduced motion). */
  lag(m:THREE.Matrix4,yaw:number,pitch:number,partial:number,reduced:boolean):THREE.Matrix4;
  /** Ticks since death, 0..20 (0 while alive), and hurt ticks left 0..10. */
  readonly deathTime:number;readonly hurtTime:number;
}
export function createViewMotion():ViewMotion{
  let lastX=NaN,lastZ=NaN,walk=0,oWalk=0,bob=0,oBob=0,xBob=NaN,oXBob=NaN,yBob=NaN,oYBob=NaN,hurtTime=0,deathTime=0;
  /** Snap the lag to the view when it is unset or stale: a jump of more than half a turn is a restore or a teleport of
   *  the view (the yaw is never wrapped), not a turn to ease through, which would spin the hand. */
  const sync=(yaw:number,pitch:number)=>{
    const tx=-pitch/DEG,ty=-yaw/DEG;
    if(!Number.isFinite(xBob)||!Number.isFinite(yBob)||Math.abs(ty-yBob)>180||Math.abs(tx-xBob)>180){xBob=oXBob=tx;yBob=oYBob=ty;return true;}
    return false;
  };
  return{
    get deathTime(){return deathTime;},get hurtTime(){return hurtTime;},
    tick(p,dead){
      const moved=Number.isFinite(lastX)?Math.min(1,Math.hypot(p.x-lastX,p.z-lastZ)):0;lastX=p.x;lastZ=p.z;
      oWalk=walk;oBob=bob;walk+=moved*.6;
      bob+=((p.onGround&&!p.swimming&&!dead?Math.min(.1,moved):0)-bob)*.4;
      if(!sync(p.yaw,p.pitch)){oXBob=xBob;oYBob=yBob;xBob+=(-p.pitch/DEG-xBob)*.5;yBob+=(-p.yaw/DEG-yBob)*.5;}
    },
    frame(dt,dead){
      const d=Number.isFinite(dt)&&dt>0?dt:0;
      hurtTime=Math.max(0,hurtTime-d*20);
      deathTime=dead?Math.min(DEATH_TICKS,deathTime+d*20):0;
    },
    hurt(){hurtTime=HURT_TICKS;},
    resync(){xBob=oXBob=yBob=oYBob=NaN;},
    reset(){lastX=lastZ=NaN;walk=oWalk=bob=oBob=0;hurtTime=deathTime=0;xBob=oXBob=yBob=oYBob=NaN;},
    camera(m,partial,reduced){
      if(reduced)return m;
      hurtBob(m,hurtTime/HURT_TICKS,deathTime);
      return viewBob(m,oWalk+(walk-oWalk)*partial,oBob+(bob-oBob)*partial);
    },
    lag(m,yaw,pitch,partial,reduced){
      if(reduced)return m;
      sync(yaw,pitch);
      const xb=oXBob+(xBob-oXBob)*partial,yb=oYBob+(yBob-oYBob)*partial;
      return RY(RX(m,(-pitch/DEG-xb)*.1),(-yaw/DEG-yb)*.1);
    }
  };
}
/** How an item is drawn in hand. */
export function heldDisplay(stack:ItemStack|null):{display:Display;icon:ItemIcon}|null{
  const def=stack?itemDef(stack.id):undefined;if(!def)return null;
  if(def.use==='shield')return{display:'shield',icon:def.icon};
  return{display:def.icon.kind==='block'?'block':'item',icon:def.icon};
}
/** Vanilla bow model overrides while drawing (pull = ticks drawn / 20): bow_pulling_0, _1 from 0.65, _2 from 0.9. The
 *  stage sprite is used only once item art paints it (`has`); until then the plain bow stays in hand. */
export function pullingSprite(used:number,has:(name:string)=>boolean):string{
  const pull=Math.max(0,used)/20,name=pull>=.9?'bow_pulling_2':pull>=.65?'bow_pulling_1':'bow_pulling_0';
  return has(name)?name:'';
}
const painted=(name:string)=>Object.prototype.hasOwnProperty.call(SPRITE_PAINTERS,name);
type UseAnim='eat'|'bow'|'block'|null;
function useAnim(id:string):UseAnim{
  const def=itemDef(id);if(!def)return null;
  if(def.food)return'eat';if(def.use==='bow')return'bow';if(def.use==='shield')return'block';return null;
}

const VERTEX=`precision highp float;
uniform mat4 mainMatrix;uniform mat4 offMatrix;uniform mat4 handProjection;
in vec3 position;in vec2 uv;in vec3 color;in vec2 misc;
out vec2 vUv;out vec3 vColor;flat out float vTex;
void main(){
  vec4 p=handProjection*(misc.x<.5?mainMatrix:offMatrix)*vec4(position,1.);
  // Squeeze the depth into the front 1% so the hand is always in front of the world.
  p.z=p.z*.01-.99*p.w;
  gl_Position=p;vUv=uv;vColor=color;vTex=misc.y;
}`;
const FRAGMENT=`precision highp float;
uniform sampler2D sheet;uniform sampler2D atlas;uniform vec3 light;
in vec2 vUv;in vec3 vColor;flat in float vTex;out vec4 colour;
void main(){
  vec4 t=vTex<.5?texture(sheet,vUv):texture(atlas,vUv);
  if(t.a<.1)discard;
  float a=1.;
  // Translucent block faces blend, front faces only (the mesher winds faces counter-clockwise from outside), like
  // vanilla's culled translucent sheet; everything else is opaque.
  if(vTex>1.5){if(!gl_FrontFacing)discard;a=t.a;}
  colour=vec4(t.rgb*vColor*light,a);
}`;

export interface HandState{
  /** Visual identity of what each hand shows: the item id ('' = nothing / the bare arm), plus '#<sprite>' for a bow's
   *  pull stage once item art paints bow_pulling_0..2. */
  readonly main:string;readonly off:string;
  /** Equip heights 0..1 (1 = raised) and swing progress 0..1. */
  readonly mainHeight:number;readonly offHeight:number;readonly swing:number;readonly swinging:boolean;
}
export interface Hand{
  readonly mesh:THREE.Mesh;readonly state:HandState;
  swing():void;
  /** 20 Hz: equip heights, swing and use timers. */
  tick():void;
  /** Per frame: poses for the partial tick, with the view bob/hurt prefix matrix, aspect ratio and the eye light colour. */
  update(partial:number,prefix:THREE.Matrix4,aspect:number,light:{r:number;g:number;b:number}):void;
  reset():void;
  dispose():void;
}
const key=(s:ItemStack|null)=>s?s.id:'';

export function createHand(game:Game,atlas:THREE.Texture):Hand{
  // ---- Sheet (rows flipped: v=1 is the top row) ---------------------------------------------------------------------
  // Keep the 16×16 geometry and normalized slot UVs; only the backing texture needs the shield's photo detail.
  const textureSlot=spriteTextureSize('shield'),textureScale=textureSlot/HAND_SLOT;
  const textureWidth=HAND_SHEET_WIDTH*textureScale,textureHeight=HAND_SHEET_HEIGHT*textureScale;
  const pixels=new Uint8Array(textureWidth*textureHeight*4);
  const sheet=new THREE.DataTexture(pixels,textureWidth,textureHeight,THREE.RGBAFormat);
  sheet.magFilter=sheet.minFilter=THREE.NearestFilter;sheet.generateMipmaps=false;
  const writeSlot=(slot:number,src:Uint8ClampedArray,sourceSize=HAND_SLOT)=>{
    for(let y=0;y<textureSlot;y++){
      const offset=((textureHeight-1-y)*textureWidth+slot*textureSlot)*4;
      if(sourceSize===textureSlot){pixels.set(src.subarray(y*sourceSize*4,(y+1)*sourceSize*4),offset);continue;}
      const sourceRow=(y*sourceSize/textureSlot|0)*sourceSize;
      for(let x=0;x<textureSlot;x++){
        const s=(sourceRow+(x*sourceSize/textureSlot|0))*4,d=offset+x*4;
        pixels[d]=src[s];pixels[d+1]=src[s+1];pixels[d+2]=src[s+2];pixels[d+3]=src[s+3];
      }
    }
    sheet.needsUpdate=true;
  };
  writeSlot(SLOT_ARM,paintArmSkin());

  // ---- Geometry ------------------------------------------------------------------------------------------------------
  const buf=new HandBuffer(),geometry=new THREE.BufferGeometry();
  const attrs={position:new THREE.BufferAttribute(buf.position,3),uv:new THREE.BufferAttribute(buf.uv,2),color:new THREE.BufferAttribute(buf.color,3),
    misc:new THREE.BufferAttribute(buf.misc,2)};
  for(const [name,a] of Object.entries(attrs)){a.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute(name,a);}
  geometry.setIndex(new THREE.BufferAttribute(quadIndices(MAX_HAND_QUADS),1));geometry.setDrawRange(0,0);
  const uniforms={mainMatrix:{value:new THREE.Matrix4()},offMatrix:{value:new THREE.Matrix4()},handProjection:{value:new THREE.Matrix4()},
    light:{value:new THREE.Color(1,1,1)},sheet:{value:sheet},atlas:{value:atlas}};
  // Blended (opaque texels write alpha 1) and single pass (RawShaderMaterial's default): drawn after everything blended.
  const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:VERTEX,fragmentShader:FRAGMENT,uniforms,side:THREE.DoubleSide,
    transparent:true,forceSinglePass:true});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;mesh.renderOrder=9;mesh.name='hand';
  const projection=new THREE.PerspectiveCamera(70,1,.05,10);

  // ---- State (vanilla ItemInHandRenderer fields) ---------------------------------------------------------------------
  let shownMain:ItemStack|null=null,shownOff:ItemStack|null=null,mainKey='',offKey='',builtMain='\0',builtOff='\0';
  let mainHeight=0,oMainHeight=0,offHeight=0,oOffHeight=0;
  let swinging=false,swingTime=0,attackAnim=0,oAttackAnim=0;
  let usedItem='',useTicks=0,useHand:0|1=0,mainSprite='',offSprite='';
  const model=new THREE.Matrix4();

  function build(){
    buf.quads=0;
    const parts:[ItemStack|null,number][]=[[shownMain,0],[shownOff,1]];
    for(const [stack,part] of parts){
      const left=part===1,held=heldDisplay(stack);
      if(!held){
        if(part===0){
          // Bare right arm: the arm pose matrix already includes the model part transform.
          buf.setTransform(model.identity());addArm(buf,0);
        }
        continue;
      }
      applyDisplay(model.identity(),held.display,left);buf.setTransform(model);
      const stage=part===0?mainSprite:offSprite,icon:ItemIcon=stage?{kind:'sprite',sprite:stage}:held.icon,slot=part===0?SLOT_MAIN:SLOT_OFF;
      if(icon.kind==='block'){
        const def=BLOCK_BY_NAME.get(icon.block);if(!def)continue;
        const tint=def.tint==='grass'?GRASS_ITEM:def.tint==='foliage'?FOLIAGE_ITEM:undefined;
        try{addBlockMesh(buf,game.mesher.meshBlock(def.id,tint),part);}catch{/* no mesher: nothing drawn */}
      }else{
        const px=icon.kind==='sprite'?spritePixels(icon.sprite):tilePixels(icon.tile);
        const tint=icon.kind==='tile'&&TINTED_TILES.has(icon.tile)?(/lily/.test(icon.tile)?FOLIAGE_ITEM:GRASS_ITEM):0xffffff;
        if(icon.kind==='sprite')writeSlot(slot,spriteTexturePixels(icon.sprite),spriteTextureSize(icon.sprite));
        else writeSlot(slot,px);
        addSprite(buf,px,slot,part,tint);
      }
    }
    for(const a of Object.values(attrs)){a.clearUpdateRanges();a.addUpdateRange(0,buf.quads*4*a.itemSize);a.needsUpdate=true;}
    geometry.setDrawRange(0,buf.quads*6);
  }

  const state:HandState={
    get main(){return mainKey;},get off(){return offKey;},get mainHeight(){return mainHeight;},get offHeight(){return offHeight;},
    get swing(){return attackAnim;},get swinging(){return swinging;}
  };
  const handMatrix=(m:THREE.Matrix4,part:0|1,partial:number)=>{
    const side=part===0?1:-1,stack=part===0?shownMain:shownOff;
    const equip=1-(part===0?oMainHeight+(mainHeight-oMainHeight)*partial:oOffHeight+(offHeight-oOffHeight)*partial);
    let swing=0;
    if(part===0){let d=attackAnim-oAttackAnim;if(d<0)d+=1;swing=oAttackAnim+d*partial;}
    if(!stack)return armPose(m,side,swing,equip);
    const using=game.interaction?.using,anim=using&&useHand===part&&usedItem===stack.id?useAnim(stack.id):null;
    const used=useTicks+partial;
    if(anim==='eat'){eatPose(m,side,used);itemArmTransform(m,side,equip);}
    else if(anim==='bow'){itemArmTransform(m,side,equip);bowPose(m,side,used);}
    else if(anim==='block'){
      itemArmTransform(m,side,equip);
      // Raised shield: toward the centre and up (vanilla shield_blocking display), eased over the first ticks.
      const k=Math.min(1,used/3);T(m,-side*.12*k,.28*k,-.06*k);RY(m,side*-10*k);
    }
    else itemSwingPose(m,side,swing,equip);
    return m;
  };
  return{
    mesh,state,
    swing(){
      // Player.swing: restarts only when not swinging or past half the swing.
      if(!swinging||swingTime>=SWING_TICKS/2||swingTime<0){swingTime=-1;swinging=true;}
    },
    tick(){
      oMainHeight=mainHeight;oOffHeight=offHeight;oAttackAnim=attackAnim;
      const inv=game.inventory,main=inv.held(),off=inv.offhand;
      const charge=Math.max(0,Math.min(1,game.interaction?.attackCharge??1));
      const mainSame=key(main)===key(shownMain),offSame=key(off)===key(shownOff);
      if(mainSame)shownMain=main;if(offSame)shownOff=off;
      mainHeight+=Math.max(-.4,Math.min(.4,(mainSame?charge*charge*charge:0)-mainHeight));
      offHeight+=Math.max(-.4,Math.min(.4,(offSame?1:0)-offHeight));
      if(mainHeight<.1)shownMain=main;
      if(offHeight<.1)shownOff=off;
      // updateSwingTime.
      if(swinging){swingTime++;if(swingTime>=SWING_TICKS){swingTime=0;swinging=false;}}else swingTime=0;
      attackAnim=swingTime/SWING_TICKS;
      const using=game.interaction?.using;
      if(using&&using.item===usedItem)useTicks++;
      else{usedItem=using?.item??'';useTicks=0;useHand=key(inv.held())===usedItem?0:1;}
      // The drawn bow's pull stage is part of what the hand shows (a stage change rebuilds it, without re-equipping).
      const stage=using&&useAnim(usedItem)==='bow'?pullingSprite(useTicks,painted):'';
      mainSprite=stage&&useHand===0&&key(shownMain)===usedItem?stage:'';offSprite=stage&&useHand===1&&key(shownOff)===usedItem?stage:'';
      mainKey=key(shownMain)+(mainSprite&&'#'+mainSprite);offKey=key(shownOff)+(offSprite&&'#'+offSprite);
    },
    update(partial,prefix,aspect,light){
      if(mainKey!==builtMain||offKey!==builtOff){builtMain=mainKey;builtOff=offKey;build();}
      const p=Math.max(0,Math.min(1,partial));
      handMatrix(uniforms.mainMatrix.value.copy(prefix),0,p);
      handMatrix(uniforms.offMatrix.value.copy(prefix),1,p);
      if(projection.aspect!==aspect&&aspect>0){projection.aspect=aspect;projection.updateProjectionMatrix();}
      uniforms.handProjection.value.copy(projection.projectionMatrix);
      uniforms.light.value.setRGB(light.r,light.g,light.b);
    },
    reset(){shownMain=shownOff=null;mainKey=offKey=mainSprite=offSprite='';builtMain=builtOff='\0';mainHeight=oMainHeight=offHeight=oOffHeight=0;swinging=false;swingTime=0;attackAnim=oAttackAnim=0;usedItem='';useTicks=0;},
    dispose(){geometry.dispose();material.dispose();sheet.dispose();}
  };
}
