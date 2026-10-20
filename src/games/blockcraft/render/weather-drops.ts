// CPU side of the precipitation renderer (no THREE, testable in Node): a column grid around the camera with the
// precipitation height, surface and rain/snow kind of every column, and a simulation of up to DROP_CAP drops and
// SPLASH_CAP splash droplets that writes one instance record per visible particle. Drops live in world space and
// wrap around the camera, land on the column surface (rain splashes, snow just settles) and are never written below
// it, so nothing is drawn inside covered spaces.
import {isLava} from '../data/blocks';
import type {World} from '../engine/contracts';
import {precipitationHeight,precipitationKind,surfaceTop} from '../world/weather-columns';

export const DROP_CAP=1500,SPLASH_CAP=256;
/** Horizontal half size of the drop box and its extent below / above the camera, blocks. */
export const DROP_RADIUS=12,DROP_BELOW=10,DROP_ABOVE=14;
/** Rain landing within this horizontal distance of the camera splashes. */
export const SPLASH_RADIUS=10;
/** Instance kinds (iPos.w in the shader). */
export const KIND_RAIN=0,KIND_SNOW=1,KIND_SPLASH=2;
export const COLUMN_NONE=0,COLUMN_RAIN=1,COLUMN_SNOW=2;
/** Floats per instance: x, y, z (relative to the origin), kind, then width, length, alpha, phase. */
export const INSTANCE_FLOATS=8;
export const RAIN_SPEED=9,RAIN_SPEED_SPREAD=3,SNOW_SPEED=.9,SNOW_SPEED_SPREAD=.8;
const SPLASH_GRAVITY=24,SPLASH_LIFE=.6,LAVA_SMOKE_INTERVAL=.25;
const FIELD_HALF=DROP_RADIUS+1,FIELD_SIZE=FIELD_HALF*2+1;

/** Small seeded PRNG for visuals and ambience (keeps game.random() for gameplay). */
export function visualRandom(seed:number):()=>number{
  let s=seed>>>0;
  return()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
const wrap=(v:number,min:number,span:number)=>min+((v-min)%span+span)%span;

/** Per-column precipitation data around the camera, rebuilt when the camera changes column or height or the world changes. */
export class PrecipitationField{
  readonly size=FIELD_SIZE;
  originX=0;originZ=0;centreY=Number.NaN;
  /** First y precipitation reaches (32767 when unloaded). */
  readonly height=new Int16Array(FIELD_SIZE*FIELD_SIZE);
  /** World y of the visible top surface drops land on. */
  readonly surface=new Float32Array(FIELD_SIZE*FIELD_SIZE);
  readonly kind=new Uint8Array(FIELD_SIZE*FIELD_SIZE);
  readonly lava=new Uint8Array(FIELD_SIZE*FIELD_SIZE);
  dirty=true;
  /** Marks the field stale when a changed block lies inside it. */
  touch(x:number,z:number){if(x>=this.originX&&x<this.originX+FIELD_SIZE&&z>=this.originZ&&z<this.originZ+FIELD_SIZE)this.dirty=true;}
  /** Rebuilds if needed; returns true when it did. */
  update(world:World,cx:number,cy:number,cz:number):boolean{
    const ox=Math.floor(cx)-FIELD_HALF,oz=Math.floor(cz)-FIELD_HALF,y=Math.floor(cy);
    if(!this.dirty&&ox===this.originX&&oz===this.originZ&&y===this.centreY)return false;
    this.dirty=false;this.originX=ox;this.originZ=oz;this.centreY=y;
    for(let iz=0;iz<FIELD_SIZE;iz++)for(let ix=0;ix<FIELD_SIZE;ix++){
      const i=ix+iz*FIELD_SIZE,wx=ox+ix,wz=oz+iz,h=precipitationHeight(world,wx,wz);
      if(h<0){this.height[i]=32767;this.surface[i]=32767;this.kind[i]=COLUMN_NONE;this.lava[i]=0;continue;}
      const top=h-1,id=top>=0?world.get(wx,top,wz):0;
      this.height[i]=h;this.surface[i]=top>=0?top+surfaceTop(id):0;this.lava[i]=+(id>0&&isLava(id));
      // Like vanilla, the kind is taken at the column surface or at the bottom of the drop box, whichever is higher.
      const kind=precipitationKind(world,wx,wz,Math.max(h,y-DROP_BELOW));
      this.kind[i]=kind==='rain'?COLUMN_RAIN:kind==='snow'?COLUMN_SNOW:COLUMN_NONE;
    }
    return true;
  }
  index(x:number,z:number):number{
    const ix=Math.floor(x)-this.originX,iz=Math.floor(z)-this.originZ;
    return ix<0||iz<0||ix>=FIELD_SIZE||iz>=FIELD_SIZE?-1:ix+iz*FIELD_SIZE;
  }
}

export interface DropFrame{
  dt:number;camX:number;camY:number;camZ:number;
  /** Instances are written relative to this point (keeps float precision far from the world origin). */
  originX:number;originY:number;originZ:number;
  /** 0..1 rain level. */
  intensity:number;reducedMotion:boolean;
}

export class DropSim{
  readonly x=new Float32Array(DROP_CAP);readonly y=new Float32Array(DROP_CAP);readonly z=new Float32Array(DROP_CAP);
  /** Per-drop 0..1 variation of speed, size and phase. */
  readonly rate=new Float32Array(DROP_CAP);
  readonly out=new Float32Array((DROP_CAP+SPLASH_CAP)*INSTANCE_FLOATS);
  private sx=new Float32Array(SPLASH_CAP);private sy=new Float32Array(SPLASH_CAP);private sz=new Float32Array(SPLASH_CAP);
  private svx=new Float32Array(SPLASH_CAP);private svy=new Float32Array(SPLASH_CAP);private svz=new Float32Array(SPLASH_CAP);
  private sbase=new Float32Array(SPLASH_CAP);private sage=new Float32Array(SPLASH_CAP).fill(SPLASH_LIFE);
  private head=0;private seeded=false;private time=0;private smokeIn=0;
  /** Drops written in the last update (rain or snow) and splashes written. */
  drops=0;splashes=0;
  constructor(private random:()=>number=visualRandom(0x5eed),
    /** Rain landing on lava (vanilla smoke instead of a splash), throttled. */
    private onLava:(x:number,y:number,z:number)=>void=()=>{}){}
  /** Forget every drop (new world). */
  reset(){this.seeded=false;this.sage.fill(SPLASH_LIFE);this.drops=this.splashes=0;}
  private seed(f:DropFrame){
    const r=this.random,span=DROP_RADIUS*2,h=DROP_BELOW+DROP_ABOVE;
    for(let i=0;i<DROP_CAP;i++){
      this.x[i]=f.camX-DROP_RADIUS+r()*span;this.z[i]=f.camZ-DROP_RADIUS+r()*span;this.y[i]=f.camY-DROP_BELOW+r()*h;this.rate[i]=r();
    }
    this.seeded=true;
  }
  private splash(x:number,y:number,z:number){
    const i=this.head;this.head=(this.head+1)%SPLASH_CAP;const r=this.random;
    this.sx[i]=x;this.sy[i]=y+.02;this.sz[i]=z;this.sbase[i]=y;this.sage[i]=0;
    this.svx[i]=(r()-.5)*1.2;this.svz[i]=(r()-.5)*1.2;this.svy[i]=2+r()*3;
  }
  /** Advances by f.dt (0 freezes) and writes instances; returns the instance count. */
  update(f:DropFrame,field:PrecipitationField):number{
    if(!this.seeded)this.seed(f);
    const r=this.random,out=this.out,dt=f.dt,span=DROP_RADIUS*2,range=DROP_BELOW+DROP_ABOVE;
    const minX=f.camX-DROP_RADIUS,minZ=f.camZ-DROP_RADIUS,bottom=f.camY-DROP_BELOW,top=f.camY+DROP_ABOVE;
    const visible=Math.min(DROP_CAP,Math.floor(DROP_CAP*Math.max(0,Math.min(1,f.intensity))*(f.reducedMotion?.5:1)));
    const fade=.4+.6*Math.max(0,Math.min(1,f.intensity)),sway=!f.reducedMotion;
    this.time+=dt;this.smokeIn-=dt;
    let n=0,o=0;
    for(let i=0;i<DROP_CAP;i++){
      let x=wrap(this.x[i],minX,span),z=wrap(this.z[i],minZ,span),y=this.y[i];
      if(y<bottom||y>=top)y=wrap(y,bottom,range);
      const idx=field.index(x,z),column=idx<0?COLUMN_NONE:field.kind[idx],rate=this.rate[i],snow=column===COLUMN_SNOW;
      const prev=y;
      y-=(snow?SNOW_SPEED+SNOW_SPEED_SPREAD*rate:RAIN_SPEED+RAIN_SPEED_SPREAD*rate)*dt;
      if(snow&&sway&&dt>0){x+=Math.sin(this.time*1.7+rate*40)*.35*dt;z+=Math.cos(this.time*1.3+rate*29)*.35*dt;}
      const land=idx<0?32767:field.surface[idx];
      if(y<land){
        if(prev>=land&&column===COLUMN_RAIN&&i<visible){
          const dx=x-f.camX,dz=z-f.camZ;
          if(field.lava[idx]){if(this.smokeIn<=0){this.smokeIn=LAVA_SMOKE_INTERVAL;this.onLava(x,land,z);}}
          else if(dx*dx+dz*dz<=SPLASH_RADIUS*SPLASH_RADIUS&&r()<.5)this.splash(x,land,z);
        }
        // Back to the top of the box; it stays hidden while the column is covered above the box.
        y=top-r()*1.5;
      }
      if(y<bottom)y+=range;
      this.x[i]=x;this.y[i]=y;this.z[i]=z;
      if(i>=visible||column===COLUMN_NONE||y<land)continue;
      out[o]=x-f.originX;out[o+1]=y-f.originY;out[o+2]=z-f.originZ;
      if(snow){out[o+3]=KIND_SNOW;out[o+4]=.08+.06*rate;out[o+5]=0;out[o+6]=.85*fade;}
      else{out[o+3]=KIND_RAIN;out[o+4]=.05;out[o+5]=.6+.5*rate;out[o+6]=(.3+.25*rate)*fade;}
      out[o+7]=rate;o+=INSTANCE_FLOATS;n++;
    }
    this.drops=n;let s=0;
    for(let i=0;i<SPLASH_CAP;i++){
      if(this.sage[i]>=SPLASH_LIFE)continue;
      this.sage[i]+=dt;this.svy[i]-=SPLASH_GRAVITY*dt;
      this.sx[i]+=this.svx[i]*dt;this.sy[i]+=this.svy[i]*dt;this.sz[i]+=this.svz[i]*dt;
      if(this.sy[i]<this.sbase[i]||this.sage[i]>=SPLASH_LIFE){this.sage[i]=SPLASH_LIFE;continue;}
      out[o]=this.sx[i]-f.originX;out[o+1]=this.sy[i]-f.originY;out[o+2]=this.sz[i]-f.originZ;
      out[o+3]=KIND_SPLASH;out[o+4]=.065;out[o+5]=0;out[o+6]=.75*fade;out[o+7]=0;o+=INSTANCE_FLOATS;s++;
    }
    this.splashes=s;
    return n+s;
  }
}
