// Overlays, one draw call each and only while something shows:
//  - the block overlay: the targeted block's selection outline (vanilla: black at 40%, 2.5 px and wider above 1080p, drawn
//    as screen-space quads so the width holds at any resolution; hidden with F1) and the breaking crack (destroy_stage_N on the block's
//    outline box, inflated slightly, polygon offset, multiplied into the block like vanilla's crumbling blend);
//  - the screen overlay: full-screen tints from setOverlay (underwater blotches that slide with the view, lava, the
//    red hurt vignette, fire flames at the bottom of the screen, the purple portal shimmer of ender pearls).
import * as THREE from 'three';
import {ATLAS_COLUMNS,ATLAS_ROWS,OUTLINE_BOX,TILE_INDEX} from '../data/blocks';
import type {Vec3} from '../engine/contracts';

export type OverlayKind='water'|'lava'|'hurt'|'fire'|'portal';
export const OVERLAY_CODE:Record<OverlayKind,number>={water:1,lava:2,hurt:3,fire:4,portal:5};
export interface Box{minX:number;minY:number;minZ:number;maxX:number;maxY:number;maxZ:number}

// ---- Block overlay ------------------------------------------------------------------------------------------------------
/** The 12 edges of a box as endpoint pairs [ax,ay,az,bx,by,bz]. */
export function boxEdges(b:Box,out:number[]=[]):number[]{
  out.length=0;
  const xs=[b.minX,b.maxX],ys=[b.minY,b.maxY],zs=[b.minZ,b.maxZ];
  for(const y of ys)for(const z of zs)out.push(xs[0],y,z,xs[1],y,z);
  for(const x of xs)for(const z of zs)out.push(x,ys[0],z,x,ys[1],z);
  for(const x of xs)for(const y of ys)out.push(x,y,zs[0],x,y,zs[1]);
  return out;
}
/** Crack faces on a box: per face 4 corners (x,y,z) and tile-space UVs (0..1, v up) cropped to the box like vanilla
 *  model UVs, face order +x,-x,+y,-y,+z,-z, corners in the quad order (0,1,2),(2,1,3). */
export function crackFaces(b:Box,pos:number[],uv:number[]){
  pos.length=0;uv.length=0;
  const lo=[b.minX,b.minY,b.minZ],hi=[b.maxX,b.maxY,b.maxZ];
  const frac=(axis:number,v:number)=>{const base=Math.floor(lo[axis]+1e-9);return Math.min(1,Math.max(0,v-base));};
  // For each face: the fixed axis and value, then corners as (u-axis value, v-axis value) choices.
  const faces:[number,number,number,number,boolean][]=[
    // axis, side(0 min / 1 max), u axis, v axis, u reversed
    [0,1,2,1,true],[0,0,2,1,false],[1,1,0,2,false],[1,0,0,2,false],[2,1,0,1,false],[2,0,0,1,true]
  ];
  for(const [axis,side,ua,va,rev] of faces){
    const fixed=side?hi[axis]:lo[axis];
    // Corners: top-left, bottom-left, top-right, bottom-right as seen from outside.
    const us=rev?[hi[ua],lo[ua]]:[lo[ua],hi[ua]];
    let vs=[hi[va],lo[va]];
    if(axis===1)vs=side?[lo[va],hi[va]]:[hi[va],lo[va]];
    const corners=[[us[0],vs[0]],[us[0],vs[1]],[us[1],vs[0]],[us[1],vs[1]]];
    for(const [u,v] of corners){
      const p=[0,0,0];p[axis]=fixed;p[ua]=u;p[va]=v;pos.push(p[0],p[1],p[2]);
      // v grows upward on sides and toward north (-z) on top/bottom.
      uv.push(frac(ua,u),axis===1?1-frac(va,v):frac(va,v));
    }
  }
}

const BLOCK_VERTEX=`precision highp float;
uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;uniform vec2 resolution;uniform float lineWidth;uniform float near;
uniform float showOutline;uniform float showCrack;
in vec3 position;in vec3 other;in vec3 params;in vec2 uv;
out vec2 vUv;flat out float vKind;
void main(){
  float kind=params.z;vKind=kind;vUv=uv;
  if(kind<.5){
    if(showCrack<.5){gl_Position=vec4(2.,2.,2.,1.);return;}
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);return;
  }
  if(showOutline<.5){gl_Position=vec4(2.,2.,2.,1.);return;}
  vec4 a=modelViewMatrix*vec4(position,1.),b=modelViewMatrix*vec4(other,1.);float n=-near*1.001;
  if(a.z>n){if(b.z>n){gl_Position=vec4(2.,2.,2.,1.);return;}a=mix(a,b,(n-a.z)/(b.z-a.z));}
  if(b.z>n)b=mix(b,a,(n-b.z)/(a.z-b.z));
  vec4 ca=projectionMatrix*a,cb=projectionMatrix*b;
  vec2 sa=ca.xy/ca.w*resolution*.5,sb=cb.xy/cb.w*resolution*.5,dir=sb-sa;
  float len=length(dir);dir=len>1e-4?dir/len:vec2(1.,0.);
  vec2 nrm=vec2(-dir.y,dir.x);
  vec4 c=params.x<.5?ca:cb;
  vec2 offset=(nrm*params.y+dir*(params.x<.5?-1.:1.))*lineWidth*.5;
  c.xy+=offset/(resolution*.5)*c.w;
  gl_Position=c;
}`;
const BLOCK_FRAGMENT=`precision highp float;
uniform sampler2D atlas;uniform vec2 crackTile;
in vec2 vUv;flat in float vKind;out vec4 colour;
void main(){
  if(vKind>.5){colour=vec4(0.,0.,0.,.4);return;}
  vec2 f=clamp(vUv,.001,.999);
  vec4 t=texture(atlas,vec2((crackTile.x+f.x)/${ATLAS_COLUMNS}.,1.-(crackTile.y+1.-f.y)/${ATLAS_ROWS}.));
  if(t.a<.5)discard;
  // Blended as src*dst + dst*(1-a): with a=1 this multiplies the block by 2×crack (vanilla DST_COLOR, SRC_COLOR).
  colour=vec4(min(vec3(1.),t.rgb*2.),1.);
}`;
const LINE_VERTS=48,CRACK_VERTS=24;
export interface BlockOverlay{
  readonly mesh:THREE.Mesh;
  setSelection(box:Box|null):void;
  /** F1 (hide GUI) hides the outline but not the crack, like vanilla's shouldRenderBlockOutline. */
  setOutlineHidden(hidden:boolean):void;
  /** Crack at a block position (the box is its outline box) and stage 0..9, or null. */
  setBreaking(pos:Vec3|null,stage:number,id:number):void;
  /** Drawing buffer size in pixels (line width scales with it). */
  resize(width:number,height:number,near:number):void;
  dispose():void;
}
export function createBlockOverlay(atlas:THREE.Texture):BlockOverlay{
  const geometry=new THREE.BufferGeometry();
  const position=new Float32Array((LINE_VERTS+CRACK_VERTS)*3),other=new Float32Array((LINE_VERTS+CRACK_VERTS)*3);
  const params=new Float32Array((LINE_VERTS+CRACK_VERTS)*3),uv=new Float32Array((LINE_VERTS+CRACK_VERTS)*2);
  const index:number[]=[];
  for(let e=0;e<12;e++){
    const v=e*4;index.push(v,v+1,v+2,v+2,v+1,v+3);
    // (endpoint, side): A-, A+, B-, B+.
    [[0,-1],[0,1],[1,-1],[1,1]].forEach(([t,s],k)=>{params[(v+k)*3]=t;params[(v+k)*3+1]=s;params[(v+k)*3+2]=1;});
  }
  for(let f=0;f<6;f++){const v=LINE_VERTS+f*4;index.push(v,v+1,v+2,v+2,v+1,v+3);}
  const attrs={position:new THREE.BufferAttribute(position,3),other:new THREE.BufferAttribute(other,3),params:new THREE.BufferAttribute(params,3),uv:new THREE.BufferAttribute(uv,2)};
  for(const [name,a] of Object.entries(attrs)){a.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute(name,a);}
  geometry.setIndex(index);
  const uniforms={atlas:{value:atlas},crackTile:{value:new THREE.Vector2()},resolution:{value:new THREE.Vector2(1280,720)},lineWidth:{value:2.5},near:{value:.05},
    showOutline:{value:0},showCrack:{value:0}};
  const material=new THREE.RawShaderMaterial({
    glslVersion:THREE.GLSL3,vertexShader:BLOCK_VERTEX,fragmentShader:BLOCK_FRAGMENT,uniforms,transparent:true,depthWrite:false,
    blending:THREE.CustomBlending,blendSrc:THREE.DstColorFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4,side:THREE.DoubleSide
  });
  const mesh=new THREE.Mesh(geometry,material);
  // First in the blended pass, before translucent chunks (2): like vanilla, the outline and crack of a block under water
  // or behind ice are tinted by it instead of sitting on top.
  mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;mesh.renderOrder=1.4;mesh.visible=false;mesh.name='block-overlay';
  const edges:number[]=[],cpos:number[]=[],cuv:number[]=[];
  // World positions (float64) of the outline edges and the crack corners. The GPU gets them relative to a whole-block
  // origin at the shown block (the mesh is translated there; three forms modelViewMatrix in float64), so the outline
  // stays steady far from spawn.
  const lineWorld=new Float64Array(12*6),crackWorld=new Float64Array(CRACK_VERTS*3),origin={x:0,y:0,z:0};
  let selected=false,cracking=false,outlineHidden=false;
  function write(){
    const src=selected?lineWorld:crackWorld;
    origin.x=Math.floor(src[0]);origin.y=Math.floor(src[1]);origin.z=Math.floor(src[2]);
    mesh.matrix.makeTranslation(origin.x,origin.y,origin.z);mesh.matrixWorld.copy(mesh.matrix);
    if(selected){
      for(let e=0;e<12;e++)for(let k=0;k<4;k++){
        const v=(e*4+k)*3,w=e*6;
        position[v]=lineWorld[w]-origin.x;position[v+1]=lineWorld[w+1]-origin.y;position[v+2]=lineWorld[w+2]-origin.z;
        other[v]=lineWorld[w+3]-origin.x;other[v+1]=lineWorld[w+4]-origin.y;other[v+2]=lineWorld[w+5]-origin.z;
      }
      attrs.other.needsUpdate=true;
    }
    if(cracking)for(let i=0;i<CRACK_VERTS;i++){
      const v=(LINE_VERTS+i)*3;
      position[v]=crackWorld[i*3]-origin.x;position[v+1]=crackWorld[i*3+1]-origin.y;position[v+2]=crackWorld[i*3+2]-origin.z;
    }
    attrs.position.needsUpdate=true;
  }
  const refresh=()=>{
    uniforms.showOutline.value=selected&&!outlineHidden?1:0;uniforms.showCrack.value=cracking?1:0;
    mesh.visible=uniforms.showOutline.value>0||uniforms.showCrack.value>0;
  };
  return{
    mesh,
    setSelection(box){
      const valid=!!box&&[box.minX,box.minY,box.minZ,box.maxX,box.maxY,box.maxZ].every(Number.isFinite);
      selected=valid;
      if(valid){
        // Vanilla inflates the outline shape by 0.002 so the lines sit just outside the faces.
        const g=.002;boxEdges({minX:box!.minX-g,minY:box!.minY-g,minZ:box!.minZ-g,maxX:box!.maxX+g,maxY:box!.maxY+g,maxZ:box!.maxZ+g},edges);
        lineWorld.set(edges);write();
      }
      refresh();
    },
    setOutlineHidden(hidden){if(outlineHidden!==hidden){outlineHidden=hidden;refresh();}},
    setBreaking(pos,stage,id){
      const s=Math.floor(stage),tile=TILE_INDEX.get(`destroy_stage_${s}`);
      const valid=!!pos&&s>=0&&s<=9&&tile!==undefined&&[pos.x,pos.y,pos.z].every(Number.isFinite);
      cracking=valid;
      if(valid){
        const bx=Math.floor(pos!.x),by=Math.floor(pos!.y),bz=Math.floor(pos!.z),o=OUTLINE_BOX[id]??[],b=o.length>=6?o:[0,0,0,1,1,1],g=.001;
        crackFaces({minX:bx+b[0]-g,minY:by+b[1]-g,minZ:bz+b[2]-g,maxX:bx+b[3]+g,maxY:by+b[4]+g,maxZ:bz+b[5]+g},cpos,cuv);
        crackWorld.set(cpos);uv.set(cuv,LINE_VERTS*2);write();
        attrs.uv.needsUpdate=true;
        uniforms.crackTile.value.set(tile!%ATLAS_COLUMNS,Math.floor(tile!/ATLAS_COLUMNS));
      }
      refresh();
    },
    resize(width,height,near){
      uniforms.resolution.value.set(Math.max(1,width),Math.max(1,height));uniforms.near.value=near;
      // Vanilla line width: max(2.5, window width / 1920 × 2.5) pixels.
      uniforms.lineWidth.value=Math.max(2.5,2.5*width/1920);
    },
    dispose(){geometry.dispose();material.dispose();}
  };
}

// ---- Screen overlay -----------------------------------------------------------------------------------------------------
const SCREEN_VERTEX=`precision highp float;
in vec3 position;out vec2 vScreen;
void main(){vScreen=position.xy;gl_Position=vec4(position.xy,0.,1.);}`;
const SCREEN_FRAGMENT=`precision highp float;
uniform float kind;uniform float strength;uniform float time;uniform vec2 aspect;uniform vec2 look;uniform float brightness;
uniform sampler2D atlas;uniform vec2 fireTile;
in vec2 vScreen;out vec4 colour;
float h(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float blotch(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
vec4 fire(vec2 s){
  // Two flame sprites at the bottom corners (vanilla ScreenEffectRenderer.renderFire), the tile scrolling upward.
  vec4 c=vec4(0.);
  for(int i=0;i<2;i++){
    float side=i==0?-1.:1.;
    vec2 centre=vec2(side*.48/.7002/aspect.x,-.6/.7002),extent=vec2(1./.7002/aspect.x,1./.7002);
    vec2 q=(s-centre)/(2.*extent)+.5;
    if(q.x<0.||q.x>1.||q.y<0.||q.y>1.)continue;
    if(i==1)q.x=1.-q.x;
    vec2 f=vec2(q.x,fract(q.y-time*1.2));
    vec4 t=texture(atlas,vec2((fireTile.x+clamp(f.x,.001,.999))/${ATLAS_COLUMNS}.,1.-(fireTile.y+1.-clamp(f.y,.001,.999))/${ATLAS_ROWS}.));
    t.a*=.9;
    c=vec4(mix(c.rgb,t.rgb,t.a),max(c.a,t.a));
  }
  return c;
}
void main(){
  vec2 s=vScreen;float k=kind,a=0.;vec3 c=vec3(0.);
  float edge=length(s*vec2(1.,.8));
  if(k<1.5){
    // Underwater: a dark blotchy texture at 10% that slides with yaw and pitch.
    vec2 p=(s*aspect*.5+look)*4.;float b=blotch(p)*.6+blotch(p*2.3+3.7)*.4;
    c=mix(vec3(.02,.05,.16),vec3(.1,.2,.45),b)*brightness;a=.1+.08*b;
  }else if(k<2.5){
    c=vec3(.75,.26,.02);a=.35+.2*smoothstep(.2,1.3,edge);
  }else if(k<3.5){
    c=vec3(.75,0.,0.);a=.12+.38*smoothstep(.15,1.35,edge);
  }else if(k<4.5){
    vec4 f=fire(s);c=f.rgb;a=f.a;
  }else{
    float w=sin(s.x*9.+time*4.)*sin(s.y*7.-time*3.)*.5+.5;
    c=mix(vec3(.35,.06,.6),vec3(.75,.35,1.),w);a=.25+.25*w*smoothstep(.1,1.2,edge);
  }
  a*=clamp(strength,0.,1.);if(a<.003)discard;
  colour=vec4(c,a);
}`;
export interface ScreenOverlay{
  readonly mesh:THREE.Mesh;
  set(kind:OverlayKind|null,strength:number):void;
  readonly kind:OverlayKind|null;readonly strength:number;
  /** Per frame: seconds (animation), aspect ratio, view yaw/pitch (water slide), light at the eye 0..1. */
  update(time:number,aspect:number,yaw:number,pitch:number,brightness:number):void;
  dispose():void;
}
export function createScreenOverlay(atlas:THREE.Texture):ScreenOverlay{
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  const fire=TILE_INDEX.get('fire')??0;
  const uniforms={kind:{value:0},strength:{value:0},time:{value:0},aspect:{value:new THREE.Vector2(16/9,1)},look:{value:new THREE.Vector2()},brightness:{value:1},
    atlas:{value:atlas},fireTile:{value:new THREE.Vector2(fire%ATLAS_COLUMNS,Math.floor(fire/ATLAS_COLUMNS))}};
  const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:SCREEN_VERTEX,fragmentShader:SCREEN_FRAGMENT,uniforms,
    transparent:true,depthTest:false,depthWrite:false});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;mesh.renderOrder=100;mesh.visible=false;mesh.name='screen-overlay';
  let kind:OverlayKind|null=null,strength=0;
  return{
    mesh,
    get kind(){return kind;},get strength(){return strength;},
    set(k,s){
      const valid=k!==null&&k in OVERLAY_CODE;
      kind=valid?k:null;strength=valid?Math.max(0,Math.min(1,Number.isFinite(s)?s:1)):0;
      uniforms.kind.value=kind?OVERLAY_CODE[kind]:0;uniforms.strength.value=strength;mesh.visible=strength>0;
    },
    update(time,aspect,yaw,pitch,brightness){
      uniforms.time.value=time;uniforms.aspect.value.set(aspect,1);uniforms.look.value.set(yaw*180/Math.PI/256,-pitch*180/Math.PI/256);
      uniforms.brightness.value=brightness;
    },
    dispose(){geometry.dispose();material.dispose();}
  };
}
