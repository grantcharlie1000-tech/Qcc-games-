// The sky and the clouds, two draw calls in all.
//  - The dome is one camera-centred box drawn at the far plane after the opaque world (only sky pixels are shaded). Its
//    fragment shader evaluates, per view direction, what vanilla LevelRenderer.renderSky draws with several meshes: the
//    sky disc 16 blocks overhead fogged toward the horizon colour, the sunrise/sunset fan, the square sun and moon
//    (phases from the celestial strip in sky-art.ts) and 1 500-odd stars, all rotating with the celestial angle, and the
//    dark disc below the horizon when the camera is under it.
//  - The clouds are 12×12×4 block boxes from a tiling cloud map (sky-art.ts), drifting east at the vanilla 0.6
//    blocks per second, 0.8 opaque, shaded per face and faded into the fog with horizontal distance.
import * as THREE from 'three';
import type {Vec3} from '../engine/contracts';
import {LIGHT_GLSL,type RGB,type RenderUniforms} from './sky';
import {CELESTIAL_CELL,CELESTIAL_CELLS,CELESTIAL_WIDTH,CLOUD_CELLS,buildCloudGeometry,paintCelestial,paintCloudMap} from './sky-art';

/** Cloud layer (vanilla 1.18+): bottom height 192, 4 blocks thick, 12-block cells, drifting 0.03 blocks per tick east. */
export const CLOUD_Y=192,CLOUD_THICKNESS=4,CLOUD_CELL=12,CLOUD_SPEED=.6;
/** Cloud map period in blocks: the mesh is 2×2 periods, re-centred on the camera every period. */
export const CLOUD_PERIOD=CLOUD_CELLS*CLOUD_CELL;
/** Stars per cube-face grid cell side and the chance of a star in a cell (about 1 500 stars like vanilla). */
const STAR_GRID=48,STAR_CHANCE=1500/(6*STAR_GRID*STAR_GRID);

const DOME_VERTEX=`precision highp float;
uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;
in vec3 position;out vec3 vDir;
void main(){vDir=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=vec4(p.xy,p.w*.999999,p.w);}`;
const DOME_FRAGMENT=`precision highp float;
uniform vec3 skyColor;uniform vec3 fogColor;uniform float skyFogStart;uniform float skyFogEnd;uniform float visible;uniform float voidDark;
uniform vec4 sunrise;uniform float sunriseSide;uniform float angle;uniform float sunAlpha;uniform float stars;uniform float moonCell;
uniform sampler2D celestial;
in vec3 vDir;out vec4 colour;
${LIGHT_GLSL}
float starHash(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
void main(){
  vec3 d=normalize(vDir);
  if(visible<.5){colour=vec4(fogColor,1.);return;}
  vec3 c;
  if(d.y>0.){
    // The vanilla sky disc: a 512-block octagon 16 blocks above the camera, its vertex distances interpolated.
    float r=16.*length(d.xz)/d.y;
    c=r>512.?fogColor:mix(skyColor,fogColor,bcFog(16.+r*(496./512.),skyFogStart,skyFogEnd));
  }else{
    float r=4.*length(d.xz)/max(-d.y,1e-4);
    c=voidDark>.5?mix(vec3(0.),fogColor,bcFog(4.+r,skyFogStart,skyFogEnd)):fogColor;
  }
  // Sunrise / sunset fan: apex 100 blocks toward the sun's horizon, rim 120 out and 40×alpha high, alpha fading to the rim.
  if(sunrise.a>.001){
    float a=sunrise.a,d1=d.x*sunriseSide;
    float q=length(vec2(d.y/(40.*a),d.z/120.)),den=100.*q+d1-3.*d.y/a;
    if(den>0.){float t=100.*q/den;if(t<=1.)c=mix(c,sunrise.rgb,a*(1.-t));}
  }
  // Celestial frame: world = rotY(-90°)·rotX(angle)·local; the sun is at local +y, the moon at -y.
  float s=sin(angle),k=cos(angle);
  vec3 l=vec3(d.z,d.y*k-d.x*s,-d.y*s-d.x*k);
  if(sunAlpha>0.){
    if(l.y>0.){
      vec2 uv=l.xz/l.y/.3;
      if(max(abs(uv.x),abs(uv.y))<1.){vec4 t=texture(celestial,vec2((uv.x*.5+.5)/${CELESTIAL_CELLS}.,1.-(uv.y*.5+.5)));c+=t.rgb*t.a*sunAlpha;}
    }else{
      vec2 uv=l.xz/(-l.y)/.2;
      if(max(abs(uv.x),abs(uv.y))<1.){
        vec4 t=texture(celestial,vec2((moonCell+clamp((1.-uv.x)*.5,.001,.999))/${CELESTIAL_CELLS}.,1.-clamp((uv.y+1.)*.5,.001,.999)));
        c+=t.rgb*t.a*sunAlpha;
      }
    }
  }
  if(stars>0.){
    vec3 m=abs(l);vec2 uv;float face;
    if(m.x>=m.y&&m.x>=m.z){face=l.x>0.?0.:1.;uv=l.yz/m.x;}
    else if(m.y>=m.z){face=l.y>0.?2.:3.;uv=l.xz/m.y;}
    else{face=l.z>0.?4.:5.;uv=l.xy/m.z;}
    vec2 g=(uv*.5+.5)*${STAR_GRID}.,cell=floor(g),f=fract(g)-.5;
    float h=starHash(vec3(cell,face*7.13));
    if(h<${STAR_CHANCE.toFixed(6)}){
      vec2 o=vec2(starHash(vec3(cell,face+19.7)),starHash(vec3(cell.yx,face+3.1)))*.5-.25;
      float rot=starHash(vec3(cell.yx,face+41.3))*6.2832,size=(.15+.1*starHash(vec3(cell,face+77.)))/100.*${STAR_GRID/2}.;
      vec2 p=f-o;p=vec2(p.x*cos(rot)-p.y*sin(rot),p.x*sin(rot)+p.y*cos(rot));
      if(max(abs(p.x),abs(p.y))<size)c+=vec3(stars*stars);
    }
  }
  colour=vec4(c,1.);
}`;
const CLOUD_VERTEX=`precision highp float;
uniform mat4 modelMatrix;uniform mat4 viewMatrix;uniform mat4 projectionMatrix;uniform vec3 cameraPosition;
in vec3 position;in float shade;out float vShade;out vec3 vRel;
void main(){vec4 w=modelMatrix*vec4(position,1.);vRel=w.xyz-cameraPosition;vShade=shade;gl_Position=projectionMatrix*viewMatrix*w;}`;
const CLOUD_FRAGMENT=`precision highp float;
uniform vec3 cloudColor;uniform vec3 fogColor;uniform float cloudNear;uniform float cloudFar;
uniform float mediumFog;uniform float fogNear;uniform float fogFar;
in float vShade;in vec3 vRel;out vec4 colour;
${LIGHT_GLSL}
void main(){
  float f=bcFog(length(vRel.xz),cloudNear,cloudFar);
  if(mediumFog>.5)f=max(f,bcFog(length(vRel),fogNear,fogFar));
  float a=.8*(1.-f*f);if(a<.01)discard;
  colour=vec4(mix(cloudColor*vShade,fogColor,f),a);
}`;

/** Per-frame sky inputs, filled by the renderer (reused, no allocation). Colours are display values. */
export interface SkyFrame{
  /** Zenith colour (vanilla getSkyColor) and the sunrise glow [r,g,b,a] or null; side +1 east (sunrise), -1 west. */
  sky:RGB;sunrise:number[]|null;sunriseSide:number;
  /** Celestial angle 0..1 (0 noon), 1 - rain for sun and moon, star brightness, moon phase 0..7. */
  angle:number;sunAlpha:number;stars:number;moonPhase:number;
  /** Sky disc fog (vanilla FOG_SKY: 0..view distance in air; the medium's fog in water). */
  skyFogStart:number;skyFogEnd:number;
  /** The camera is below the horizon height: the lower sky turns black. False in lava: no sky at all. */
  voidDark:boolean;skyVisible:boolean;
  cloud:RGB;cloudNear:number;cloudFar:number;cloudsVisible:boolean;
  /** In a liquid the clouds are also hidden by the liquid's fog. */
  mediumFog:boolean;
  /** Seconds of cloud drift (frozen with reduced motion). */
  cloudTime:number;
}
export function createSkyFrame():SkyFrame{
  return{sky:{r:0,g:0,b:0},sunrise:null,sunriseSide:-1,angle:0,sunAlpha:1,stars:0,moonPhase:0,skyFogStart:0,skyFogEnd:80,voidDark:false,skyVisible:true,
    cloud:{r:1,g:1,b:1},cloudNear:80,cloudFar:200,cloudsVisible:true,mediumFog:false,cloudTime:0};
}
export interface Sky{
  readonly dome:THREE.Mesh;readonly clouds:THREE.Mesh;
  update(frame:SkyFrame,camera:Vec3):void;
  dispose():void;
}
/** Cloud mesh offset for a camera position and drift: whole map periods, so the 2×2 tiled mesh always surrounds the camera. */
export function cloudOffset(cameraX:number,cameraZ:number,drift:number,out={x:0,z:0}){
  const d=((drift%CLOUD_PERIOD)+CLOUD_PERIOD)%CLOUD_PERIOD;
  out.x=Math.round((cameraX-d)/CLOUD_PERIOD)*CLOUD_PERIOD+d;out.z=Math.round(cameraZ/CLOUD_PERIOD)*CLOUD_PERIOD;
  return out;
}

export function createSky(uniforms:RenderUniforms):Sky{
  const strip=paintCelestial(),flipped=new Uint8Array(strip.length),row=CELESTIAL_WIDTH*4;
  for(let y=0;y<CELESTIAL_CELL;y++)flipped.set(strip.subarray(y*row,(y+1)*row),(CELESTIAL_CELL-1-y)*row);
  const celestial=new THREE.DataTexture(flipped,CELESTIAL_WIDTH,CELESTIAL_CELL,THREE.RGBAFormat);
  celestial.magFilter=celestial.minFilter=THREE.NearestFilter;celestial.generateMipmaps=false;celestial.needsUpdate=true;

  const domeUniforms={skyColor:{value:new THREE.Color()},fogColor:uniforms.fogColor,skyFogStart:{value:0},skyFogEnd:{value:80},visible:{value:1},voidDark:{value:0},
    sunrise:{value:new THREE.Vector4()},sunriseSide:{value:-1},angle:{value:0},sunAlpha:{value:1},stars:{value:0},moonCell:{value:1},celestial:{value:celestial}};
  const dome=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.RawShaderMaterial({
    glslVersion:THREE.GLSL3,vertexShader:DOME_VERTEX,fragmentShader:DOME_FRAGMENT,uniforms:domeUniforms,
    side:THREE.BackSide,depthWrite:false,depthFunc:THREE.LessEqualDepth
  }));
  // After the opaque and cutout chunks (renderOrder 0/1), before anything blended.
  dome.frustumCulled=false;dome.renderOrder=5;dome.name='sky';

  const geometry=buildCloudGeometry(paintCloudMap(),CLOUD_CELLS,CLOUD_CELL,CLOUD_THICKNESS,2);
  const cloudGeometry=new THREE.BufferGeometry();
  cloudGeometry.setAttribute('position',new THREE.BufferAttribute(geometry.positions,3));
  cloudGeometry.setAttribute('shade',new THREE.BufferAttribute(geometry.shades,1));
  const cloudUniforms={cloudColor:{value:new THREE.Color(1,1,1)},fogColor:uniforms.fogColor,cloudNear:{value:80},cloudFar:{value:200},mediumFog:{value:0},
    fogNear:uniforms.fogNear,fogFar:uniforms.fogFar};
  const clouds=new THREE.Mesh(cloudGeometry,new THREE.RawShaderMaterial({
    glslVersion:THREE.GLSL3,vertexShader:CLOUD_VERTEX,fragmentShader:CLOUD_FRAGMENT,uniforms:cloudUniforms,
    transparent:true,depthWrite:true,side:THREE.FrontSide
  }));
  clouds.frustumCulled=false;clouds.renderOrder=4;clouds.matrixAutoUpdate=false;clouds.name='clouds';
  const offset={x:0,z:0};

  return{
    dome,clouds,
    update(f,camera){
      dome.position.set(camera.x,camera.y,camera.z);dome.updateMatrix();
      domeUniforms.skyColor.value.setRGB(f.sky.r,f.sky.g,f.sky.b);
      domeUniforms.skyFogStart.value=f.skyFogStart;domeUniforms.skyFogEnd.value=Math.max(f.skyFogStart+1e-3,f.skyFogEnd);
      domeUniforms.visible.value=f.skyVisible?1:0;domeUniforms.voidDark.value=f.voidDark?1:0;
      const s=f.sunrise;domeUniforms.sunrise.value.set(s?s[0]:0,s?s[1]:0,s?s[2]:0,s?s[3]:0);domeUniforms.sunriseSide.value=f.sunriseSide;
      domeUniforms.angle.value=f.angle*Math.PI*2;domeUniforms.sunAlpha.value=f.sunAlpha;domeUniforms.stars.value=f.stars;
      domeUniforms.moonCell.value=1+(((Math.floor(f.moonPhase)%8)+8)%8);
      clouds.visible=f.cloudsVisible;
      if(f.cloudsVisible){
        cloudOffset(camera.x,camera.z,f.cloudTime*CLOUD_SPEED,offset);
        clouds.matrix.makeTranslation(offset.x,CLOUD_Y,offset.z);clouds.matrixWorld.copy(clouds.matrix);
        cloudUniforms.cloudColor.value.setRGB(f.cloud.r,f.cloud.g,f.cloud.b);
        cloudUniforms.cloudNear.value=f.cloudNear;cloudUniforms.cloudFar.value=Math.max(f.cloudNear+1,f.cloudFar);cloudUniforms.mediumFog.value=f.mediumFog?1:0;
      }
    },
    dispose(){
      dome.geometry.dispose();(dome.material as THREE.Material).dispose();cloudGeometry.dispose();(clouds.material as THREE.Material).dispose();celestial.dispose();
    }
  };
}
