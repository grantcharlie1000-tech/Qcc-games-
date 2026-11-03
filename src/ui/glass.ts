// Glass chrome uses a static CSS tint and rim. Live canvas copies and SVG
// backdrop filters are deliberately absent: game rendering owns each frame.
// Exported optical math remains available to offline reference tests; the UI
// binder below never constructs or subscribes to an optical renderer.
import {bindGlassInk} from './glass-ink';
export interface Brand{brand:string;version?:string}
export type GlassMode='backdrop'|'frost'|'off';

// The lens bends content by up to LENS_BEND px at the top and bottom rims, and the bend falls smoothly to nothing LENS_BEVEL px
// inside, so the centre stays still. The two end caps bend by LENS_CAP of that: at 390 px the island sits 12 px from each screen
// edge, so a full bend there would pull the screen's own dark margin into the ends. The map's channels run from -scale/2 to
// +scale/2, so the filter's scale is twice the bend. The lens reaches LENS_MARGIN px past the bar, which is where the rim samples
// its content from.
export const LENS_BEVEL=20;
export const LENS_BEND=10;
export const LENS_CAP=0.5;
export const REFRACTION_SCALE=2*LENS_BEND;
export const LENS_MARGIN=LENS_BEND+4;
// The arcade's clear material has a narrower, lower-power bezel. Keep these
// separate from the legacy unmarked-bar map and its displacement scale.
export const ARCADE_LENS_BEVEL=12;
// The actual convex profile peaks below 5px. A tight encoding range avoids
// wasting 8-bit displacement precision, especially on DPR3 circular controls.
export const ARCADE_LENS_BEND=5;

const smoothstep=(t:number)=>t*t*(3-2*t);
// A convex squircle cross-section, y=(1-(1-t)^4)^1/4. Refract a vertical ray
// through its normal (air 1 → glass 1.5), then project it through the glass.
// Unlike the legacy outward smear, this samples inward: the rim magnifies the
// content inside the lens. Precompute the radial profile once per map.
function convexProfile(bevel:number,bend:number):number[]{
  const rays=Array.from({length:129},(_,i)=>{
    const t=Math.max(.0001,i/128),u=1-t,height=Math.pow(1-u**4,.25);
    const slope=u**3/height**3;
    const incidence=Math.atan(slope);
    const refraction=incidence-Math.asin(Math.sin(incidence)/1.5);
    return Math.min(bend,5*Math.tan(refraction)*(3+bevel*.65*height));
  });
  // Give the ray field a wider optical depth, then bound its radial derivative.
  // A sampled coordinate is depth + displacement: its derivative must stay
  // positive or the texture folds. .5 also limits magnification, preventing
  // thin terrain/wireframe lines from stretching into streaks. Integrating back
  // from the clear centre also removes the caustic
  // spike at the rim, without changing the legacy Movies field.
  const step=bevel/128*.5;
  for(let i=127;i>=0;i--)rays[i]=Math.min(rays[i],rays[i+1]+step);
  for(let i=1;i<=128;i++)rays[i]=Math.min(rays[i],rays[i-1]);
  return rays.map(ray=>-ray);
}
// The lens's height field. For each device pixel of a width by height box (in CSS px), it gives the displacement the lens applies there,
// sampled at the screen's pixel density. The bar is a capsule that sits LENS_MARGIN inside the box. A pixel moves outward along the capsule's normal, by LENS_BEND at the rim (LENS_CAP
// of that on the end caps), and that falls smoothly to zero LENS_BEVEL px inside. So each pixel samples from beyond the rim, which
// compresses the content into the rim like the edge of a thick glass, and along any normal the sample position only moves forward:
// nothing folds. The result is RGBA bytes. Red carries the x displacement and green the y one, each as 0 to 255 for -scale/2 to
// +scale/2, so 128 is no shift.
// The map has round(width * density) by round(height * density) pixels. Each pixel samples the field at its own centre, so at a whole
// density that centre is (x + 0.5) / density, and a map at density 2 is the same field drawn twice as finely.
export function lensField(width:number,height:number,margin=LENS_MARGIN,bevel=LENS_BEVEL,bend=LENS_BEND,cap=LENS_CAP,density=1,profile:'legacy'|'convex'='legacy'):Uint8ClampedArray<ArrayBuffer>{
  const pixelWidth=Math.round(width*density),pixelHeight=Math.round(height*density);
  const data=new Uint8ClampedArray(new ArrayBuffer(pixelWidth*pixelHeight*4));
  const scale=2*bend;
  const bw=width-2*margin,radius=(height-2*margin)/2;
  const convex=profile==='convex'?convexProfile(bevel,bend):null;
  for(let y=0;y<pixelHeight;y++)for(let x=0;x<pixelWidth;x++){
    // The device pixel's centre, in CSS px across the box. The map is stretched over the box, so this is also right when the size
    // times the density is not a whole number.
    const px=(x+0.5)*width/pixelWidth,py=(y+0.5)*height/pixelHeight;
    // The point in the bar's coordinates, with the capsule's core on the line v=0 between the two cap centres.
    const u=px-margin,v=py-margin-radius;
    const cx=Math.min(Math.max(u,radius),Math.max(bw-radius,radius));
    const dx=u-cx,dist=Math.hypot(dx,v);
    // Depth is the distance inside the rim. Outside the rim it stays at the rim's bend, so the field has no step at the edge. The
    // share is 1 where the normal is vertical (the straight rims) and cap where it is horizontal (the ends).
    const share=cap+(1-cap)*(dist>0?Math.abs(v)/dist:0);
    const depth=Math.min(1,Math.max(0,radius-dist)/bevel);
    const sample=depth*128,lo=Math.floor(sample);
    const push=convex
      ?share*(convex[lo]+(convex[Math.min(128,lo+1)]-convex[lo])*(sample-lo))
      :bend*share*(1-smoothstep(depth));
    const ox=dist>0?push*dx/dist:0,oy=dist>0?push*v/dist:0;
    const i=(y*pixelWidth+x)*4;
    data[i]=Math.round(255*(0.5+ox/scale));
    data[i+1]=Math.round(255*(0.5+oy/scale));
    data[i+2]=128;
    data[i+3]=255;
  }
  return data;
}

// The lens field as a PNG, the form an SVG feImage reads. The PNG has the box's size in device pixels, not in CSS px, so on a screen with
// more than one device pixel per CSS px the bend is as fine as the screen. The feImage stretches it over the box either way. Only a browser
// can encode the PNG, so this is outside the unit tests. With no 2D context there is no map, and the empty string tells the caller to leave
// the lens out, rather than bend with an all-zero map.
export function lensPng(width:number,height:number,density=1,arcade=false,margin=LENS_MARGIN):string{
  try{
  const canvas=document.createElement('canvas');
  const pixelWidth=Math.round(width*density),pixelHeight=Math.round(height*density);
  canvas.width=pixelWidth;canvas.height=pixelHeight;
  const context=canvas.getContext('2d');
  if(!context)return '';
  context.putImageData(new ImageData(lensField(width,height,margin,arcade?ARCADE_LENS_BEVEL:LENS_BEVEL,arcade?ARCADE_LENS_BEND:LENS_BEND,arcade?1:LENS_CAP,density,arcade?'convex':'legacy'),pixelWidth,pixelHeight),0,0);
  return canvas.toDataURL('image/png');
  }catch{return '';}
}
// The density the map is built at: the screen's device pixel ratio, but at least 1 and at most 3. A missing or odd ratio gives 1.
export function lensDensity(devicePixelRatio:number):number{
  return Math.min(3,Math.max(1,devicePixelRatio||1));
}

// Only Chromium-based browsers report the Chromium brand, and only Chromium draws an SVG filter inside backdrop-filter.
export function isChromiumBrands(brands:readonly Brand[]|undefined):boolean{
  return !!brands?.some(entry=>entry.brand==='Chromium');
}
// Which material a bar gets: Chromium refracts its backdrop, and every other browser frosts the bar. Reduced transparency, more contrast and
// forced colours get none, so the bar is a flat solid island.
export function glassMode(brands:readonly Brand[]|undefined,flags:{reducedTransparency:boolean;moreContrast:boolean;forcedColours:boolean}):GlassMode{
  if(flags.reducedTransparency||flags.moreContrast||flags.forcedColours)return 'off';
  return isChromiumBrands(brands)?'backdrop':'frost';
}

const round=(value:number)=>Math.round(value*100)/100;
// The custom properties that place the pill over a tab. With no current tab only its visibility changes, so it fades
// out where it was instead of sliding to the edge.
export function pillVars(tab:{left:number;width:number}|null):Record<string,string>{
  if(!tab)return {'--ui-pill-on':'0'};
  return {'--ui-pill-x':`${round(tab.left)}px`,'--ui-pill-w':`${round(tab.width)}px`,'--ui-pill-on':'1'};
}

/** No layout reads, scroll observers, filter maps, canvas allocation or game
 * frame subscription. CSS owns selection/press feedback and media fallbacks. */
export function bindGlass(bar:HTMLElement):{dispose():void}{
  const queries=[matchMedia('(prefers-reduced-transparency: reduce)'),matchMedia('(prefers-contrast: more)'),matchMedia('(forced-colors: active)')];
  const apply=()=>{
    bar.dataset.glass=queries.some(q=>q.matches)?'off':'frost';
    bar.dataset.glassMode=queries.some(q=>q.matches)?'off':'static';
  };
  for(const query of queries)query.addEventListener('change',apply);
  apply();
  const disposeInk=bar.classList.contains('arcade-glass')?bindGlassInk(bar):undefined;
  return {dispose(){
    disposeInk?.();
    for(const query of queries)query.removeEventListener('change',apply);
    delete bar.dataset.glass;delete bar.dataset.glassMode;
  }};
}
