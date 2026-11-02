type RGB=[number,number,number];
type Matrix=[RGB,RGB,RGB];

// Row-major forms of composite.js's GLSL column-major mat3 constructors.
const input:Matrix=[[.59719,.35458,.04823],[.07600,.90834,.01566],[.02840,.13383,.83777]];
const output:Matrix=[[1.60475,-.53108,-.07367],[-.10208,1.10813,-.00605],[-.00327,-.07276,1.07602]];
function inverse(m:Matrix):Matrix{
 const [[a,b,c],[d,e,f],[g,h,i]]=m,det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
 return [[(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det],[(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det],[(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det]];
}
const inputInverse=inverse(input),outputInverse=inverse(output);
const multiply=(m:Matrix,v:RGB):RGB=>m.map(row=>row[0]*v[0]+row[1]*v[1]+row[2]*v[2]) as RGB;
const decode=(s:number)=>s<=.04045?s/12.92:((s+.055)/1.055)**2.4;
function inverseFit(q:number){
 const a=1-.983729*q,b=.0245786-.4329510*q,c=-(.000090537+.238081*q),root=Math.sqrt(b*b-4*a*c);
 return b>0?-2*c/(b+root):(-b+root)/(2*a);
}
function invertTone(linear:RGB):RGB{
 const fitted=multiply(outputInverse,linear),scene=multiply(inputInverse,fitted.map(inverseFit) as RGB);
 return scene.map(c=>.6*c) as RGB;
}
const safe=(v:RGB)=>v.every(c=>Number.isFinite(c)&&c>=-1e-10);
function projectGamut(srgb:RGB):RGB{
 // Saturated team colors lie outside ACES's nonnegative scene gamut. Clamping
 // the exact inverse would turn blue red. Instead expand a max-channel-error
 // box in display sRGB and find a feasible inverse on its eight corners.
 // The two team swatches reach their minimax boundary here: about 14.73/3.47
 // byte values for blue/orange. Feasible colors still use the exact inverse.
 const candidate=(error:number):RGB|undefined=>{
  for(let mask=0;mask<8;mask++){
   const display=srgb.map((c,i)=>Math.min(1,Math.max(0,c+(mask&(1<<i)?error:-error)))) as RGB;
   const scene=invertTone(display.map(decode) as RGB);if(safe(scene))return scene;
  }
 };
 let lo=0,hi=1,best=invertTone([0,0,0]);
 // Find the first feasible interval before bisection; gamut edges need not
 // remain feasible across the entire range of an expanding display box.
 for(let n=1;n<=64;n++){const trial=candidate(n/64);if(trial){lo=(n-1)/64;hi=n/64;best=trial;break;}}
 for(let n=0;n<40;n++){const mid=(lo+hi)/2,trial=candidate(mid);if(trial){hi=mid;best=trial;}else lo=mid;}
 return best.map(c=>Math.max(0,c)) as RGB;
}
const cache=new Map<string,{linear:RGB;hdr:RGB}>();

/** Cached scene color before exposure. Supply hdr / exposure in the material shader. */
export function teamTone(hex:string):{linear:RGB;hdr:RGB}{
 if(!/^#[\da-f]{6}$/i.test(hex))throw new RangeError('Expected a six-digit sRGB hex color');
 const key=hex.toLowerCase(),cached=cache.get(key);if(cached)return cached;
 const srgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255) as RGB,linear=srgb.map(decode) as RGB;
 const exact=invertTone(linear),tone={linear,hdr:safe(exact)?exact.map(c=>Math.max(0,c)) as RGB:projectGamut(srgb)};
 cache.set(key,tone);return tone;
}
