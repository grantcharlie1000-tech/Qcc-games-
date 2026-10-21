// Sky, fog and light colour math (Java Edition 1.20 formulas) shared by the renderer's shaders.
// Colours are display (sRGB) values in 0..1, the space the raw shaders write to the framebuffer;
// uniforms of type THREE.Color hold these values directly in r, g, b.
//
// Time: the celestial angle is 0 at noon, 0.25 at sunset, 0.5 at midnight and 0.75 at sunrise. It
// is linear in dayTime so the sun crosses the horizon exactly where the engine's daylightAt is 0.5.
import {DAY_TICKS} from '../engine/constants';
import type {SharedUniforms,Vec3} from '../engine/contracts';

export interface RGB{r:number;g:number;b:number}
export type Medium='air'|'water'|'lava';
const TAU=Math.PI*2;
const clamp01=(v:number)=>v<0?0:v>1?1:v;
const set=(out:RGB,r:number,g:number,b:number)=>{out.r=r;out.g=g;out.b=b;return out;};
export const hexToRgb=(hex:number,out:RGB={r:0,g:0,b:0})=>set(out,(hex>>16&255)/255,(hex>>8&255)/255,(hex&255)/255);

export function celestialAngle(dayTime:number):number{
  const a=dayTime/DAY_TICKS-.25;return a-Math.floor(a);
}
/** Unit direction toward the sun (the moon is opposite): rises in the east (+x), sets in the west (-x). */
export function sunDirection(angle:number,out:Vec3={x:0,y:0,z:0}):Vec3{
  out.x=-Math.sin(angle*TAU);out.y=Math.cos(angle*TAU);out.z=0;return out;
}
/** 0 = full moon on day 1, then waning gibbous, last quarter, waning crescent, new, waxing crescent, first quarter, waxing gibbous. */
export function moonPhase(day:number):number{return(((Math.floor(day)-1)%8)+8)%8;}
/** Sunrise / sunset glow [r,g,b,alpha] while the sun is near the horizon, else null (vanilla getSunriseColor). */
export function sunriseColor(angle:number,out:number[]=[0,0,0,0]):number[]|null{
  const c=Math.cos(angle*TAU),width=.4;
  if(c<-width||c>width)return null;
  const f3=c/width*.5+.5;let f4=1-(1-Math.sin(f3*Math.PI))*.99;f4*=f4;
  out[0]=f3*.3+.7;out[1]=f3*f3*.7+.2;out[2]=.2;out[3]=f4;return out;
}
export function starBrightness(angle:number,rain:number):number{
  const f=clamp01(1-(Math.cos(angle*TAU)*2+.25));return f*f*.5*(1-clamp01(rain));
}
/** Sky light factor 0.2..1 from the engine's sky darkening levels (night up to 11, rain 3, thunder 5 more). */
export function skyFactor(darkening:number):number{return .2+.8*clamp01(1-darkening/11);}
/** The light factor the renderer draws with: skyFactor of the engine's sky darkening before rounding (GameTime.skyDarkening:
 *  night up to 11, rain 3, thunder 5 more). The engine rounds it to whole levels for game logic; vanilla lights the client
 *  smoothly (getSkyDarken), so sunlit terrain fades with the sky instead of stepping 11 times at dusk. */
export function lightFactor(daylight:number,rain:number,thunder:number):number{
  return skyFactor(Math.min(15,(1-clamp01(daylight))*11+clamp01(rain)*3+clamp01(thunder)*5));
}
/** Zenith colour: the biome sky scaled by daylight, greyed by rain and thunder, brightened by lightning (vanilla getSkyColor). */
export function skyColor(biomeSky:number,daylight:number,rain:number,thunder:number,flash:number,out:RGB={r:0,g:0,b:0}):RGB{
  hexToRgb(biomeSky,out);const d=clamp01(daylight);let r=out.r*d,g=out.g*d,b=out.b*d;
  if(rain>0){const grey=(r*.3+g*.59+b*.11)*.6,k=1-rain*.75;r=r*k+grey*(1-k);g=g*k+grey*(1-k);b=b*k+grey*(1-k);}
  if(thunder>0){const grey=(r*.3+g*.59+b*.11)*.2,k=1-thunder*.75;r=r*k+grey*(1-k);g=g*k+grey*(1-k);b=b*k+grey*(1-k);}
  if(flash>0){const f=Math.min(1,flash)*.45;r=r*(1-f)+.8*f;g=g*(1-f)+.8*f;b=b*(1-f)+f;}
  return set(out,r,g,b);
}
const FOG_BASE={r:.7529,g:.8471,b:1};
const scratchSunrise=[0,0,0,0];
export interface FogInput{
  /** Engine daylight 0..1 and celestial angle. */
  daylight:number;angle:number;
  /** Camera look vector x (east component) for the sunrise tint. */
  lookX:number;viewChunks:number;rain:number;thunder:number;
  /** Zenith colour from skyColor. */
  sky:RGB;nightVision?:number;
}
/** Fog and horizon colour in air (vanilla FogRenderer.setupColor). */
export function fogColor(o:FogInput,out:RGB={r:0,g:0,b:0}):RGB{
  const d=clamp01(o.daylight);
  let r=FOG_BASE.r*(d*.94+.06),g=FOG_BASE.g*(d*.94+.06),b=FOG_BASE.b*(d*.91+.09);
  if(o.viewChunks>=4){
    const side=Math.sin(o.angle*TAU)>0?-1:1;let k=o.lookX*side;
    const glow=k>0?sunriseColor(o.angle,scratchSunrise):null;
    if(glow){k*=glow[3];r=r*(1-k)+glow[0]*k;g=g*(1-k)+glow[1]*k;b=b*(1-k)+glow[2]*k;}
  }
  const toSky=1-Math.pow(.25+.75*Math.min(32,o.viewChunks)/32,.25);
  r+=(o.sky.r-r)*toSky;g+=(o.sky.g-g)*toSky;b+=(o.sky.b-b)*toSky;
  if(o.rain>0){const k=1-o.rain*.5,kb=1-o.rain*.4;r*=k;g*=k;b*=kb;}
  if(o.thunder>0){const k=1-o.thunder*.5;r*=k;g*=k;b*=k;}
  return brighten(set(out,r,g,b),o.nightVision??0);
}
/** Night vision / water vision brightening: scale toward the brightest channel reaching 1. */
function brighten(c:RGB,amount:number):RGB{
  if(amount<=0||c.r<=0||c.g<=0||c.b<=0)return c;
  const m=Math.min(1/c.r,1/c.g,1/c.b),k=clamp01(amount);
  return set(c,c.r*(1-k)+c.r*m*k,c.g*(1-k)+c.g*m*k,c.b*(1-k)+c.b*m*k);
}
/** Cloud colour (vanilla getCloudColor): white by day, (0.1, 0.1, 0.15) at night, grey in rain and thunder. */
export function cloudColor(daylight:number,rain:number,thunder:number,out:RGB={r:0,g:0,b:0}):RGB{
  const d=clamp01(daylight);let r=1,g=1,b=1;
  if(rain>0){const grey=(r*.3+g*.59+b*.11)*.6,k=1-rain*.95;r=r*k+grey*(1-k);g=g*k+grey*(1-k);b=b*k+grey*(1-k);}
  r*=d*.9+.1;g*=d*.9+.1;b*=d*.85+.15;
  if(thunder>0){const grey=(r*.3+g*.59+b*.11)*.2,k=1-thunder*.95;r=r*k+grey*(1-k);g=g*k+grey*(1-k);b=b*k+grey*(1-k);}
  return set(out,r,g,b);
}
const lmBright=(level:number)=>{const f=level/15;return f/(4-3*f);};
export interface LightOptions{flash?:number;flicker?:number;nightVision?:number}
/** Light colour of a vertex with sky and block light 0..15 (vanilla LightTexture with gamma 0.5). `factor` from skyFactor. */
export function lightmap(sky:number,block:number,factor:number,o:LightOptions={},out:RGB={r:0,g:0,b:0}):RGB{
  const f1=(factor*.95+.05)+(1-(factor*.95+.05))*clamp01(o.flash??0);
  const sr=factor+(1-factor)*.35,sb=1;
  const bl=lmBright(block)*(1.5+(o.flicker??0)),sl=lmBright(sky)*f1;
  let r=bl+sr*sl,g=bl*((bl*.6+.4)*.6+.4)+sr*sl,b=bl*(bl*bl*.6+.4)+sb*sl;
  r=r*.96+.03;g=g*.96+.03;b=b*.96+.03;
  const nv=clamp01(o.nightVision??0),m=Math.max(r,g,b);
  if(nv>0&&m<1){r+=(r/m-r)*nv;g+=(g/m-g)*nv;b+=(b/m-b)*nv;}
  r=clamp01(r);g=clamp01(g);b=clamp01(b);
  const ng=(v:number)=>1-Math.pow(1-v,4);
  r=(r+ng(r))/2;g=(g+ng(g))/2;b=(b+ng(b))/2;
  return set(out,clamp01(r*.96+.03),clamp01(g*.96+.03),clamp01(b*.96+.03));
}
/** Vanilla getWaterVision: 0 on entering water, 0.6 after 5 s, 1 after 30 s. */
export function waterVision(ticks:number):number{
  if(ticks>=600)return 1;
  const a=clamp01(ticks/100),b=ticks<100?0:clamp01((ticks-100)/500);return a*.6+b*.4;
}
const WATER_FOG:Record<string,number>={swamp:0x232317};
/** Underwater fog colour of a biome (vanilla water_fog_color). */
export function waterFogColor(biomeName:string):number{return WATER_FOG[biomeName]??0x050533;}
/** Underwater fog: the biome water fog colour brightened by water vision, dimmed in the dark (light 0..1 at the eye). */
export function underwaterFogColor(hex:number,vision:number,light:number,out:RGB={r:0,g:0,b:0}):RGB{
  brighten(hexToRgb(hex,out),vision);const k=.25+.75*clamp01(light);return set(out,out.r*k,out.g*k,out.b*k);
}
export const LAVA_FOG:RGB={r:.6,g:.1,b:0};
/** Fog start and end distance in blocks and its shape (vanilla FogRenderer.setupFog). Air fog ends at the edge of the
 *  meshed chunks (the view radius, in chunks) after a short smooth band and is cylindrical; liquid fog is spherical. */
export function fogRange(medium:Medium,viewChunks:number,o:{waterVision?:number;swamp?:boolean;fireResistance?:boolean},
  out={near:0,far:0,cylinder:true}):{near:number;far:number;cylinder:boolean}{
  const air=Math.max(24,(viewChunks-.5)*16);
  if(medium==='lava'){out.near=o.fireResistance?0:.25;out.far=o.fireResistance?3:1;out.cylinder=false;return out;}
  if(medium==='water'){
    out.near=-8;out.far=96*Math.max(.25,o.waterVision??0)*(o.swamp?.85:1);out.cylinder=false;
    if(out.far>air){out.far=air;out.cylinder=true;}
    return out;
  }
  out.far=air;out.near=air-Math.min(64,Math.max(4,air/10));out.cylinder=true;return out;
}
/** Vanilla getNightVisionScale: full strength, flickering during the last 10 seconds. */
export function nightVisionScale(ticksLeft:number):number{
  return ticksLeft>200?1:.7+Math.sin(ticksLeft*Math.PI*.2)*.3;
}
/** Which side of the sky glows: -1 west at sunset (the sun is setting), +1 east at sunrise. */
export const sunriseSide=(angle:number)=>Math.sin(angle*TAU)>0?-1:1;

// ---- GLSL shared by every renderer shader -------------------------------------------------------
/** Lightmap and fog helpers; identical to lightmap() and fogRange() use above. */
export const LIGHT_GLSL=`
float bcBright(float level){float f=level/15.;return f/(4.-3.*f);}
vec3 bcLightmap(float sky,float block,float factor,float flash,float flicker,float nightVision){
  float f1=mix(factor*.95+.05,1.,clamp(flash,0.,1.));
  vec3 skyCol=mix(vec3(factor,factor,1.),vec3(1.),.35);
  float b=bcBright(block)*(1.5+flicker);
  vec3 c=vec3(b,b*((b*.6+.4)*.6+.4),b*(b*b*.6+.4))+skyCol*(bcBright(sky)*f1);
  c=mix(c,vec3(.75),.04);
  float m=max(c.r,max(c.g,c.b));
  if(nightVision>0.&&m<1.)c=mix(c,c/m,clamp(nightVision,0.,1.));
  c=clamp(c,0.,1.);
  c=mix(c,1.-pow(1.-c,vec3(4.)),.5);
  return clamp(mix(c,vec3(.75),.04),0.,1.);
}
/** 1.18+ terrain fog is cylindrical in air (shape 1) and spherical in liquids (shape 0). */
float bcFogDistance(vec3 rel,float shape){return mix(length(rel),max(length(rel.xz),abs(rel.y)),shape);}
float bcFog(float dist,float near,float far){return dist<=near?0.:smoothstep(near,far,dist);}
`;

/** The shared uniforms plus renderer-wide extras used by the renderer's own shaders (chunks, particles, hand, clouds). */
export interface RenderUniforms extends SharedUniforms{
  /** 1 = cylindrical fog (air), 0 = spherical (water, lava). */
  fogShape:{value:number};
  /** 0..1 night vision brightening. */
  nightVision:{value:number};
  /** Block light flicker added to the 1.5 block light factor (vanilla torch flicker). */
  flicker:{value:number};
  /** 1 = leaves and plants sway, 0 with reduced motion. */
  sway:{value:number};
}
