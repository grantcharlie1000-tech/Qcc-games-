// Seeded 2D/3D simplex noise (after Stefan Gustavson's public-domain reference),
// using flat typed-array permutation tables and no allocation per sample.
const F2=.5*(Math.sqrt(3)-1),G2=(3-Math.sqrt(3))/6,F3=1/3,G3=1/6;
const GRAD3=new Int8Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);

export function mulberry32(seed:number){
  let a=seed>>>0;
  return ()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}
/** Integer hash of a lattice point and seed to [0,1). */
export function hash3(x:number,y:number,z:number,seed:number):number{
  let h=Math.imul(x,0x27d4eb2d)^Math.imul(y,0x165667b1)^Math.imul(z,0x1b873593)^Math.imul(seed,0x85ebca6b);
  h=Math.imul(h^(h>>>15),0x2c1b3c6d);h=Math.imul(h^(h>>>12),0x297a2d39);h^=h>>>15;
  return (h>>>0)/4294967296;
}

export class Simplex{
  private perm=new Uint8Array(512);
  private mod12=new Uint8Array(512);
  constructor(seed:number){
    const random=mulberry32(seed),p=new Uint8Array(256);
    for(let i=0;i<256;i++)p[i]=i;
    for(let i=255;i>0;i--){const j=Math.floor(random()*(i+1)),t=p[i];p[i]=p[j];p[j]=t;}
    for(let i=0;i<512;i++){this.perm[i]=p[i&255];this.mod12[i]=this.perm[i]%12;}
  }
  noise2(xin:number,yin:number):number{
    const perm=this.perm,mod12=this.mod12;
    const s=(xin+yin)*F2,i=Math.floor(xin+s),j=Math.floor(yin+s),t=(i+j)*G2;
    const x0=xin-(i-t),y0=yin-(j-t),i1=x0>y0?1:0,j1=1-i1;
    const x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1+2*G2,y2=y0-1+2*G2,ii=i&255,jj=j&255;
    let n=0,t0=.5-x0*x0-y0*y0;
    if(t0>0){const g=mod12[ii+perm[jj]]*3;t0*=t0;n+=t0*t0*(GRAD3[g]*x0+GRAD3[g+1]*y0);}
    let t1=.5-x1*x1-y1*y1;
    if(t1>0){const g=mod12[ii+i1+perm[jj+j1]]*3;t1*=t1;n+=t1*t1*(GRAD3[g]*x1+GRAD3[g+1]*y1);}
    let t2=.5-x2*x2-y2*y2;
    if(t2>0){const g=mod12[ii+1+perm[jj+1]]*3;t2*=t2;n+=t2*t2*(GRAD3[g]*x2+GRAD3[g+1]*y2);}
    return 70*n;
  }
  noise3(xin:number,yin:number,zin:number):number{
    const perm=this.perm,mod12=this.mod12;
    const s=(xin+yin+zin)*F3,i=Math.floor(xin+s),j=Math.floor(yin+s),k=Math.floor(zin+s),t=(i+j+k)*G3;
    const x0=xin-(i-t),y0=yin-(j-t),z0=zin-(k-t);
    let i1,j1,k1,i2,j2,k2;
    if(x0>=y0){
      if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0;}else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1;}else{i1=0;j1=0;k1=1;i2=1;j2=0;k2=1;}
    }else{
      if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1;}else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1;}else{i1=0;j1=1;k1=0;i2=1;j2=1;k2=0;}
    }
    const x1=x0-i1+G3,y1=y0-j1+G3,z1=z0-k1+G3,x2=x0-i2+2*G3,y2=y0-j2+2*G3,z2=z0-k2+2*G3,x3=x0-1+3*G3,y3=y0-1+3*G3,z3=z0-1+3*G3;
    const ii=i&255,jj=j&255,kk=k&255;
    let n=0,t0=.6-x0*x0-y0*y0-z0*z0;
    if(t0>0){const g=mod12[ii+perm[jj+perm[kk]]]*3;t0*=t0;n+=t0*t0*(GRAD3[g]*x0+GRAD3[g+1]*y0+GRAD3[g+2]*z0);}
    let t1=.6-x1*x1-y1*y1-z1*z1;
    if(t1>0){const g=mod12[ii+i1+perm[jj+j1+perm[kk+k1]]]*3;t1*=t1;n+=t1*t1*(GRAD3[g]*x1+GRAD3[g+1]*y1+GRAD3[g+2]*z1);}
    let t2=.6-x2*x2-y2*y2-z2*z2;
    if(t2>0){const g=mod12[ii+i2+perm[jj+j2+perm[kk+k2]]]*3;t2*=t2;n+=t2*t2*(GRAD3[g]*x2+GRAD3[g+1]*y2+GRAD3[g+2]*z2);}
    let t3=.6-x3*x3-y3*y3-z3*z3;
    if(t3>0){const g=mod12[ii+1+perm[jj+1+perm[kk+1]]]*3;t3*=t3;n+=t3*t3*(GRAD3[g]*x3+GRAD3[g+1]*y3+GRAD3[g+2]*z3);}
    return 32*n;
  }
}

/** Integer hash of a lattice point and seed to an unsigned 32-bit value (same mixing as hash3). */
export function hashInt(x:number,y:number,z:number,seed:number):number{
  let h=Math.imul(x,0x27d4eb2d)^Math.imul(y,0x165667b1)^Math.imul(z,0x1b873593)^Math.imul(seed,0x85ebca6b);
  h=Math.imul(h^(h>>>15),0x2c1b3c6d);h=Math.imul(h^(h>>>12),0x297a2d39);h^=h>>>15;
  return h>>>0;
}
export const clamp=(v:number,lo:number,hi:number)=>v<lo?lo:v>hi?hi:v;
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
/** Hermite smoothstep from e0 to e1 (e1 may be below e0 for a falling edge). */
export function smoothstep(e0:number,e1:number,x:number):number{
  let t=(x-e0)/(e1-e0);t=t<0?0:t>1?1:t;return t*t*(3-2*t);
}
/** Fractal 2D simplex: `octaves` doublings of frequency at half amplitude, normalised by the amplitude sum.
 *  Each octave is offset so octaves do not share their zero at the origin. */
export function fbm2(n:Simplex,x:number,z:number,octaves:number):number{
  let sum=0,amp=1,norm=0,f=1;
  for(let i=0;i<octaves;i++){sum+=amp*n.noise2(x*f+i*31.71,z*f-i*17.37);norm+=amp;amp*=.5;f*=2;}
  return sum/norm;
}
