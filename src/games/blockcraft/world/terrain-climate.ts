// Multi-noise climate after the 1.18+ overworld: five climate parameters (temperature, humidity,
// continentalness, erosion, weirdness) sampled every CLIMATE_STEP blocks and interpolated per column,
// then shaped into a surface height (continentalness spline, erosion-controlled hills and mountains,
// peaks-and-valleys from weirdness, rivers where weirdness crosses zero) and a biome.
//
// Height is a continuous function of continuous noises, so neighbouring biomes meet without cliffs;
// biome choice never feeds back into height. Everything is pure and shared by generate(), heightAt()
// and biomeAt(), which therefore agree exactly.
import {Simplex,mulberry32} from './noise';
import * as noise from './noise';
import {biomeId,type BiomeId} from '../data/biomes';
import * as constants from '../engine/constants';

// Imported values used in hot loops are bound to module-local constants (plain reads; module bindings can be
// accessors under test transforms).
const {fbm2,smoothstep,lerp}=noise,{CH,SEA_LEVEL}=constants;

export const CLIMATE_STEP=4;
const PARAMS=8,SLOTS=4096;
// Parameter slots of a grid node.
const TEMP=0,HUMID=1,CONT=2,EROS=3,WEIRD=4,ISLE=5,WEIRD_DX=6,WEIRD_DZ=7;

/** Climate zone thresholds, chosen from the noise distributions (2-octave fbm, 4-octave for continentalness). */
export const TEMPERATURE_ZONES=[-.41,-.18,.12,.36] as const; // frozen | cold | temperate | warm | hot
export const HUMIDITY_ZONES=[-.38,-.15,.1,.31] as const;     // arid | dry | neutral | wet | humid
/** Continentalness: deep ocean below DEEP, ocean below COAST_LO, the coast band up to COAST_HI, then inland. */
export const DEEP_OCEAN=-.34,COAST_LO=-.165,COAST_HI=-.11;
/** Snowy peaks need a cold climate; lower or warmer mountains are windswept hills (snow-capped above ~103 by coldAt). */
export const PEAK_HEIGHT=100;
/** Columns within this many blocks of a river line count as river (biome) where they lie below sea level. */
export const RIVER_REACH=12;
/** Distance from the origin within which continentalness is raised so the spawn area is land. */
export const SPAWN_LAND_RADIUS=1024;
/** Mushroom islands need deep ocean this far out all round. */
export const ISLE_MOAT=192;
/** Mean height of a mushroom island's rolling hills; its shelf shallower than ISLE_SHELF is ocean, not deep ocean. */
const ISLE_HEIGHT=68,ISLE_SHELF=44;
/** Island noise where an island's flank starts rising; it reaches full height .25 higher, a gentle underwater slope. */
const ISLE_RAMP=.4;
/** Worlds start on a continent: continentalness rises smoothly within SPAWN_LAND_RADIUS of the origin (a gentle
 *  stand-in for vanilla's search for an inland spawn climate). */
function spawnLand(x:number,z:number):number{
  const r2=x*x+z*z;
  return r2<SPAWN_LAND_RADIUS*SPAWN_LAND_RADIUS?.3*smoothstep(SPAWN_LAND_RADIUS,320,Math.sqrt(r2)):0;
}

const CX=[-1,-.5,-.38,-.34,-.3,-.22,COAST_LO,-.135,COAST_HI,0,.3,1];
const CY=[28,30,33,39.5,43,49,56.5,61,64,66,68,70];
function continentHeight(c:number):number{
  if(c<=CX[0])return CY[0];
  for(let i=1;i<CX.length;i++)if(c<CX[i]){const t=(c-CX[i-1])/(CX[i]-CX[i-1]);return CY[i-1]+(CY[i]-CY[i-1])*t;}
  return CY[CY.length-1];
}
const zone=(v:number,edges:readonly number[])=>v<edges[0]?0:v<edges[1]?1:v<edges[2]?2:v<edges[3]?3:4;

const id=biomeId;
const OCEAN=id('ocean'),DEEP=id('deep_ocean'),BEACH=id('beach'),STONY=id('stony_shore'),RIVER=id('river'),FROZEN_RIVER=id('frozen_river');
const MUSHROOM=id('mushroom_fields'),SWAMP=id('swamp'),PEAKS=id('snowy_peaks'),HILLS=id('mountains'),CHERRY=id('cherry_grove');
const SAVANNA=id('savanna'),BADLANDS=id('badlands'),DESERT=id('desert'),JUNGLE=id('jungle'),FOREST=id('forest');
const SNOWY_TAIGA=id('snowy_taiga'),SNOWY_PLAINS=id('snowy_plains'),PLAINS=id('plains'),FLOWER_PLAINS=id('sunflower_plains');
const TAIGA=id('taiga'),BIRCH=id('birch_forest'),DARK=id('dark_forest');
/** Lowland biomes by [temperature][humidity] zone, after the vanilla middle-biome table. */
const MIDDLE:BiomeId[][]=[
  [SNOWY_PLAINS,SNOWY_PLAINS,SNOWY_PLAINS,SNOWY_TAIGA,SNOWY_TAIGA],
  [PLAINS,PLAINS,FOREST,TAIGA,TAIGA],
  [FLOWER_PLAINS,PLAINS,FOREST,BIRCH,DARK],
  [SAVANNA,SAVANNA,FOREST,JUNGLE,JUNGLE],
  [DESERT,DESERT,DESERT,DESERT,DESERT]
];
/** Hillside and highland biomes (high ground or low erosion): groves, windswept hills, cherry groves, plateaus. */
const HIGHLAND:BiomeId[][]=[
  [SNOWY_TAIGA,SNOWY_TAIGA,SNOWY_TAIGA,SNOWY_TAIGA,SNOWY_TAIGA],
  [HILLS,HILLS,HILLS,TAIGA,TAIGA],
  [CHERRY,CHERRY,CHERRY,HILLS,DARK],
  [SAVANNA,SAVANNA,SAVANNA,JUNGLE,JUNGLE],
  [BADLANDS,BADLANDS,BADLANDS,BADLANDS,BADLANDS]
];

/** One column's climate, height and biome (reused scratch: copy what you need). */
export interface ColumnClimate{
  temperature:number;humidity:number;continentalness:number;erosion:number;weirdness:number;
  /** 0..1 mountain influence and 0..1 river influence (before mountains damp it). */
  mountain:number;river:number;
  /** Surface height: the y of the top terrain block. */
  height:number;biome:BiomeId;
}

export class Climate{
  private readonly t:Simplex;private readonly h:Simplex;private readonly c:Simplex;private readonly e:Simplex;
  private readonly w:Simplex;private readonly isle:Simplex;private readonly d1:Simplex;private readonly d2:Simplex;
  // Direct-mapped cache of grid nodes: values are a pure function of the node, so caching never changes results.
  private readonly keys=new Int32Array(SLOTS*2).fill(0x7fffffff);
  private readonly vals=new Float64Array(SLOTS*PARAMS);
  readonly out:ColumnClimate={temperature:0,humidity:0,continentalness:0,erosion:0,weirdness:0,mountain:0,river:0,height:0,biome:0};
  /** Seeded shift of every climate sample, so the origin is not a simplex lattice point (where all noises are 0). */
  private readonly ox:number;private readonly oz:number;
  constructor(seed:number){
    const s=seed>>>0,shift=mulberry32(s^0x0c11ab17);
    this.ox=Math.floor((shift()-.5)*40000)+.37;this.oz=Math.floor((shift()-.5)*40000)+.61;
    this.t=new Simplex(s^0x3c6ef372);this.h=new Simplex(s^0xa54ff53a);this.c=new Simplex(s^0x510e527f);this.e=new Simplex(s^0x9b05688c);
    this.w=new Simplex(s^0x1f83d9ab);this.isle=new Simplex(s^0x5be0cd19);this.d1=new Simplex(s^0x6a09e667);this.d2=new Simplex(s^0xbb67ae85);
  }
  /** Offset of a grid node's parameters in `vals`, computing them on a cache miss. */
  private node(gx:number,gz:number):number{
    const slot=((Math.imul(gx,0x9e3779b1)^Math.imul(gz,0x85ebca6b))>>>20)&(SLOTS-1),k=slot*2;
    const o=slot*PARAMS,v=this.vals;
    if(this.keys[k]===gx&&this.keys[k+1]===gz)return o;
    const wx=gx*CLIMATE_STEP,wz=gz*CLIMATE_STEP,x=wx+this.ox,z=wz+this.oz;
    v[o+TEMP]=fbm2(this.t,x/1400,z/1400,2);
    v[o+HUMID]=fbm2(this.h,x/1100,z/1100,2);
    v[o+CONT]=fbm2(this.c,x/1000,z/1000,4);
    v[o+EROS]=fbm2(this.e,x/520,z/520,2);
    v[o+WEIRD]=fbm2(this.w,x/420,z/420,2);
    // Weirdness gradient per block (central differences), interpolated like the values: rivers use |W| / |grad W|.
    v[o+WEIRD_DX]=(fbm2(this.w,(x+2)/420,z/420,2)-fbm2(this.w,(x-2)/420,z/420,2))/4;
    v[o+WEIRD_DZ]=(fbm2(this.w,x/420,(z+2)/420,2)-fbm2(this.w,x/420,(z-2)/420,2))/4;
    // Mushroom island strength: rare spots of the island noise in deep ocean with deep ocean all round them
    // (8 samples ISLE_MOAT blocks away), so the islands stand alone far from any coast.
    let isle=0;
    const raw=this.isle.noise2(x/400,z/400),cont=v[o+CONT]+spawnLand(wx,wz);
    if(raw>ISLE_RAMP&&cont<-.36){
      let ring=-1;
      for(let i=0;i<8;i++){
        const ax=Math.cos(i*Math.PI/4)*ISLE_MOAT,az=Math.sin(i*Math.PI/4)*ISLE_MOAT;
        ring=Math.max(ring,fbm2(this.c,(x+ax)/1000,(z+az)/1000,4)+spawnLand(wx+ax,wz+az));
      }
      isle=smoothstep(ISLE_RAMP,ISLE_RAMP+.25,raw)*smoothstep(-.36,-.44,cont)*smoothstep(-.1,-.24,ring);
    }
    v[o+ISLE]=isle;
    this.keys[k]=gx;this.keys[k+1]=gz;
    return o;
  }
  /** Evaluates the column at integer (x,z) into `this.out` and returns it. */
  column(x:number,z:number):ColumnClimate{
    const gx=x>>2,gz=z>>2,fx=(x&3)/CLIMATE_STEP,fz=(z&3)/CLIMATE_STEP,v=this.vals;
    const a=this.node(gx,gz),b=this.node(gx+1,gz),c=this.node(gx,gz+1),d=this.node(gx+1,gz+1);
    const w00=(1-fx)*(1-fz),w10=fx*(1-fz),w01=(1-fx)*fz,w11=fx*fz;
    const T=v[a]*w00+v[b]*w10+v[c]*w01+v[d]*w11;
    const H=v[a+1]*w00+v[b+1]*w10+v[c+1]*w01+v[d+1]*w11;
    const C=v[a+2]*w00+v[b+2]*w10+v[c+2]*w01+v[d+2]*w11+spawnLand(x,z);
    const E=v[a+3]*w00+v[b+3]*w10+v[c+3]*w01+v[d+3]*w11;
    const W=v[a+4]*w00+v[b+4]*w10+v[c+4]*w01+v[d+4]*w11;
    const isle=v[a+5]*w00+v[b+5]*w10+v[c+5]*w01+v[d+5]*w11;
    const WX=v[a+6]*w00+v[b+6]*w10+v[c+6]*w01+v[d+6]*w11,WZ=v[a+7]*w00+v[b+7]*w10+v[c+7]*w01+v[d+7]*w11;
    const sx=x+this.ox,sz=z+this.oz,d1=fbm2(this.d1,sx/48,sz/48,3),d2=this.d2.noise2(sx/16,sz/16);

    // Continentalness sets the base: deep ocean, ocean, coast, inland.
    const land=smoothstep(-.15,-.02,C),inland=smoothstep(-.05,.4,C);
    // Low erosion raises mountains; peaks-and-valleys (folded weirdness) shapes ridges and river valleys.
    const wn=Math.min(1,Math.abs(W)*1.6),pv=1-Math.abs(3*wn-2);
    const mountain=land*smoothstep(-.05,-.45,E)*(.7+.3*inland);
    const hills=lerp(3,10,smoothstep(.35,-.15,E))*land;
    let height=continentHeight(C)+(1-land)*1.5*d1+hills*(.55*pv+.45*d1)
      +mountain*(6+48*smoothstep(-.3,.85,pv))+mountain*6*d2;
    // Very high erosion in mild, humid climates flattens to sea level: swamps.
    const wet=smoothstep(.32,.46,E)*smoothstep(-.18,0,H)*smoothstep(-.45,-.35,T)*smoothstep(.4,.3,T)*smoothstep(-.12,-.04,C);
    height=lerp(height,61.7+2.3*d1,wet);
    // Rare mushroom islands rise out of the deep ocean as low rolling hills.
    height=lerp(height,ISLE_HEIGHT+7*d1+1.5*d2,isle);
    const beforeRiver=height;
    // Rivers follow weirdness zero crossings: a bed below sea level within about 3 blocks of the zero line, then banks
    // rising 0.9 blocks per block until they meet the land, so river sides never form cliffs. The distance to the line
    // is |W| over its gradient. Mountains keep mostly dry valleys.
    const distance=Math.abs(W)/Math.max(1e-4,Math.sqrt(WX*WX+WZ*WZ));
    const river=distance<RIVER_REACH?1-distance/RIVER_REACH:0;
    const valley=57+1.5*d1+Math.max(0,distance-3)*.9;
    if(valley<height)height=lerp(height,valley,(1-.7*mountain)*(1-isle));
    if(height>112)height=112+(height-112)*.5;
    const h=Math.max(8,Math.min(CH-6,Math.floor(height)));

    // Biome.
    const tz=zone(T,TEMPERATURE_ZONES),hz=zone(H,HUMIDITY_ZONES);
    let biome:BiomeId;
    // Mushroom fields are the island above the waterline; its submerged shelf is ocean (deep ocean where deep).
    if(isle>.6&&h>=SEA_LEVEL-1)biome=MUSHROOM;
    else if(C<COAST_LO&&beforeRiver<SEA_LEVEL)biome=C<DEEP_OCEAN&&(isle===0||h<ISLE_SHELF)?DEEP:OCEAN;
    else if(river>.25&&h<SEA_LEVEL&&beforeRiver>=SEA_LEVEL-1)biome=tz===0?FROZEN_RIVER:RIVER;
    else if(C<COAST_HI&&h<SEA_LEVEL-5)biome=OCEAN;
    else if(C<COAST_HI&&(h<=SEA_LEVEL+3||E<-.25&&h<=SEA_LEVEL+12))biome=E<-.25?STONY:BEACH;
    else if(wet>.5)biome=SWAMP;
    // Peaks: snowy in the cold, bare windswept hills in temperate and warm climates (vanilla's stony peaks); hot
    // peaks stay badlands (from the highland table).
    else if(h>=PEAK_HEIGHT+Math.round(2*d2)&&tz<=3)biome=tz<=1?PEAKS:HILLS;
    else if(h>=82+Math.round(2*d2)||(E<-.12&&h>=74))biome=HIGHLAND[tz][hz];
    else{
      biome=MIDDLE[tz][hz];
      // Weirdness variants: flower plains only on the positive side.
      if(biome===FLOWER_PLAINS&&W<0)biome=PLAINS;
    }
    const o=this.out;
    o.temperature=T;o.humidity=H;o.continentalness=C;o.erosion=E;o.weirdness=W;o.mountain=mountain;o.river=river;o.height=h;o.biome=biome;
    return o;
  }
}
