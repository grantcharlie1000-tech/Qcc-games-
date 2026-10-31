import {expect,test,vi} from 'vitest';
import {glassMode,isChromiumBrands,LENS_BEND,LENS_BEVEL,LENS_CAP,LENS_MARGIN,lensDensity,lensField,lensPng,pillVars,REFRACTION_SCALE} from '../../src/ui/glass';

// The island is 366 by 64 px at a 390 px viewport (12 px from each screen edge), and its lens field covers it plus the margin.
const W=366,H=64;
const WIDTH=W+2*LENS_MARGIN,HEIGHT=H+2*LENS_MARGIN;
const DENSITIES=[1,2,3];
// One channel step, in CSS px of shift: the 8-bit channel spans the scale in 255 steps.
const STEP=REFRACTION_SCALE/255;

for(const density of [1,2,3])test(`arcade bezel magnifies a broad band without folding at density ${density}`,()=>{
  const width=240+2*LENS_MARGIN,height=56+2*LENS_MARGIN;
  const data=lensField(width,height,LENS_MARGIN,14,LENS_BEND,1,density,'convex');
  const shift=(depth:number)=>{
    const y=Math.floor((LENS_MARGIN+depth)*density),x=Math.floor(width/2*density);
    return REFRACTION_SCALE*(data[(y*width*density+x)*4+1]/255-.5);
  };
  expect(shift(0)).toBeGreaterThan(6);
  expect(shift(4)).toBeGreaterThan(3);
  expect(Math.abs(shift(14))).toBeLessThan(.1);
  // Read the sampled backdrop coordinate, not just the displacement: reversal
  // means the same detail folds back over itself in the outer band.
  let previous=-Infinity;
  for(let i=0;i<28*density;i++){
    const depth=i/density,sample=depth+shift(depth);
    expect(sample).toBeGreaterThan(previous);
    previous=sample;
  }
});

for(const density of [1,2,3])test(`convex caps preserve area through bilinear sampling at density ${density}`,()=>{
  for(const [w,h] of [[48,48],[52,52],[64,64],[240,56],[366,64]]){
    const width=w+2*LENS_MARGIN,height=h+2*LENS_MARGIN,pw=width*density,ph=height*density;
    const data=lensField(width,height,LENS_MARGIN,14,LENS_BEND,1,density,'convex');
    const scale=REFRACTION_SCALE*density/255;
    let minimum=Infinity;
    for(let y=0;y<ph-1;y++)for(let x=0;x<pw-1;x++){
      const a=(y*pw+x)*4,b=a+4,c=a+pw*4,d=c+4;
      // A bilinear map can fold diagonally even when its axis derivatives are
      // positive. Its Jacobian determinant must be positive at all four cell
      // corners; these bound the interior as well.
      for(const [left,right] of [[a,b],[c,d]])for(const [top,bottom] of [[a,c],[b,d]]){
        const xx=1+(data[right]-data[left])*scale,xy=(data[bottom]-data[top])*scale;
        const yx=(data[right+1]-data[left+1])*scale,yy=1+(data[bottom+1]-data[top+1])*scale;
        minimum=Math.min(minimum,xx*yy-xy*yx);
      }
    }
    expect(minimum,`${w}×${h} capsule`).toBeGreaterThan(0);
  }
});

test('the arcade convex bezel samples inward at both circle edges and leaves the centre clear',()=>{
  const width=48+2*LENS_MARGIN;
  const data=lensField(width,width,LENS_MARGIN,12,LENS_BEND,1,2,'convex');
  const shift=(x:number,y:number)=>{
    const i=(Math.floor((y+LENS_MARGIN)*2)*width*2+Math.floor((x+LENS_MARGIN)*2))*4;
    return [REFRACTION_SCALE*(data[i]/255-.5),REFRACTION_SCALE*(data[i+1]/255-.5)];
  };
  expect(shift(1,24)[0]).toBeGreaterThan(2);
  expect(shift(46,24)[0]).toBeLessThan(-2);
  expect(shift(24,1)[1]).toBeGreaterThan(2);
  expect(shift(24,46)[1]).toBeLessThan(-2);
  for(const v of shift(24,24))expect(Math.abs(v)).toBeLessThan(.1);
  for(const v of shift(14,24))expect(Math.abs(v)).toBeLessThan(.1);
});

test('the convex capsule preserves an undistorted centre between its two 12px bezels',()=>{
  const width=240+2*LENS_MARGIN,height=56+2*LENS_MARGIN;
  const data=lensField(width,height,LENS_MARGIN,12,LENS_BEND,1,1,'convex');
  for(let y=13;y<43;y++)for(let x=28;x<212;x++){
    const i=((y+LENS_MARGIN)*width+x+LENS_MARGIN)*4;
    expect(Math.abs(data[i]-127.5)).toBeLessThanOrEqual(.5);
    expect(Math.abs(data[i+1]-127.5)).toBeLessThanOrEqual(.5);
  }
});
// The lens map at a pixel density: round(size * density) pixels a side, each sampling the same field in CSS px. The shift the lens applies
// at a map pixel is read as the SVG filter reads it (channel/255 - 1/2, times the scale), in CSS px. inBar takes a point in the bar's own
// CSS px and reads the map pixel that covers it.
function mapAt(density:number){
  const pixelWidth=Math.round(WIDTH*density),pixelHeight=Math.round(HEIGHT*density);
  const data=lensField(WIDTH,HEIGHT,LENS_MARGIN,LENS_BEVEL,LENS_BEND,LENS_CAP,density);
  const at=(x:number,y:number):[number,number]=>{const i=(y*pixelWidth+x)*4;return [REFRACTION_SCALE*(data[i]/255-0.5),REFRACTION_SCALE*(data[i+1]/255-0.5)];};
  const inBar=(u:number,v:number)=>at(Math.floor((LENS_MARGIN+u)*density),Math.floor((LENS_MARGIN+v)*density));
  return {data,pixelWidth,pixelHeight,at,inBar};
}

for(const density of DENSITIES){
  const {data,pixelWidth,pixelHeight,at,inBar}=mapAt(density);

  test(`the lens field at density ${density} is opaque RGBA, one pixel for each pixel of the map`,()=>{
    expect(pixelWidth).toBe(WIDTH*density);
    expect(pixelHeight).toBe(HEIGHT*density);
    expect(data.length).toBe(pixelWidth*pixelHeight*4);
    expect(data.every((_,i)=>i%4!==3||data[i]===255)).toBe(true);
  });

  test(`at density ${density} the lens samples from beyond the rim: the straight rims bend about 10 px, and the ends half that`,()=>{
    const middle=H/2;
    // The top and bottom rims are straight, so they carry the full bend, and each end carries LENS_CAP of it.
    expect(-inBar(W/2,0)[1]).toBeGreaterThanOrEqual(9);
    expect(-inBar(W/2,0)[1]).toBeLessThanOrEqual(10);
    expect(inBar(W/2,H-1)[1]).toBeGreaterThanOrEqual(9);
    expect(inBar(W/2,H-1)[1]).toBeLessThanOrEqual(10);
    expect(inBar(0,middle)[0]).toBeLessThanOrEqual(-4);
    expect(inBar(W-1,middle)[0]).toBeGreaterThanOrEqual(4);
    // The lens reaches far enough past the bar for the whole bend.
    expect(LENS_MARGIN).toBeGreaterThanOrEqual(LENS_BEND);
  });

  test(`at density ${density} the ends shift between 4 and 6 px, so the end caps are eased by half against the straight rims`,()=>{
    expect(inBar(0,H/2)[0]).toBeGreaterThanOrEqual(-6);
    expect(inBar(0,H/2)[0]).toBeLessThanOrEqual(-4);
    expect(inBar(W-1,H/2)[0]).toBeGreaterThanOrEqual(4);
    expect(inBar(W-1,H/2)[0]).toBeLessThanOrEqual(6);
  });

  test(`at density ${density} the shift changes by at most 1.5 px per CSS px between neighbouring pixels, so the bend has no sharp step`,()=>{
    // Neighbouring map pixels are 1 / density CSS px apart, so the change per CSS px is the change between them times the density.
    let steepest=0;
    for(let y=0;y<pixelHeight;y++)for(let x=0;x+1<pixelWidth;x++)steepest=Math.max(steepest,Math.abs(at(x+1,y)[0]-at(x,y)[0]));
    for(let x=0;x<pixelWidth;x++)for(let y=0;y+1<pixelHeight;y++)steepest=Math.max(steepest,Math.abs(at(x,y+1)[1]-at(x,y)[1]));
    expect(steepest*density).toBeLessThanOrEqual(1.5);
    expect(steepest*density).toBeGreaterThan(0.5);
  });

  test(`at density ${density} along every row and column the sample moves forward, so the lens never folds`,()=>{
    // The sample sits at (index + 0.5) / density plus its shift, so one map pixel moves it 1 / density, plus the change in shift. Each
    // step must move forward by more than half a CSS px per CSS px: the lens's partials are never negative, so the margin is wider.
    let worst=Infinity;
    for(let y=0;y<pixelHeight;y++)for(let x=0;x+1<pixelWidth;x++)worst=Math.min(worst,1/density+(at(x+1,y)[0]-at(x,y)[0]));
    for(let x=0;x<pixelWidth;x++)for(let y=0;y+1<pixelHeight;y++)worst=Math.min(worst,1/density+(at(x,y+1)[1]-at(x,y)[1]));
    expect(worst*density).toBeGreaterThan(0.5);
  });

  test(`at density ${density} the Jacobian of the lens map stays positive with margin`,()=>{
    // The determinant of the map's Jacobian, from central differences of the shifts in CSS px per CSS px, at every pixel off the outer ring.
    let worst=Infinity;
    for(let y=2;y<pixelHeight-2;y++)for(let x=2;x<pixelWidth-2;x++){
      const [xr,yr]=at(x+1,y),[xl,yl]=at(x-1,y),[xd,yd]=at(x,y+1),[xu,yu]=at(x,y-1);
      const dxdx=density*(xr-xl)/2,dydx=density*(yr-yl)/2,dxdy=density*(xd-xu)/2,dydy=density*(yd-yu)/2;
      worst=Math.min(worst,(1+dxdx)*(1+dydy)-dxdy*dydx);
    }
    expect(worst).toBeGreaterThan(0.5);
  });

  test(`at density ${density} the centre stays still, and the bend is gone a bevel inside the rim`,()=>{
    const [cx,cy]=inBar(W/2,H/2);
    expect(Math.abs(cx)).toBeLessThan(0.2);
    expect(Math.abs(cy)).toBeLessThan(0.2);
    // 24 px in from the left rim, past the 20 px bevel.
    expect(Math.abs(inBar(24,H/2)[0])).toBeLessThan(0.2);
  });

  test(`at density ${density} the lens is symmetric: a mirror image flips one shift and keeps the other`,()=>{
    let worst=0;
    for(let y=0;y<pixelHeight;y++)for(let x=0;x<pixelWidth;x++){
      const i=(y*pixelWidth+x)*4,flipX=(y*pixelWidth+(pixelWidth-1-x))*4,flipY=((pixelHeight-1-y)*pixelWidth+x)*4;
      worst=Math.max(worst,
        Math.abs(data[flipX]-(255-data[i])),Math.abs(data[flipX+1]-data[i+1]),
        Math.abs(data[flipY]-data[i]),Math.abs(data[flipY+1]-(255-data[i+1])));
    }
    // The channels are rounded, so a mirror image can differ by one step.
    expect(worst).toBeLessThanOrEqual(1);
  });
}

test('a denser map is the same field: averaged over each CSS pixel, density 2 and 3 agree with density 1 within one channel step',()=>{
  // Each CSS pixel of the density-1 map is covered by a block of density x density map pixels, whose average sits at the same point.
  const coarse=mapAt(1);
  for(const density of [2,3]){
    const fine=mapAt(density),k=density;
    let worst=0;
    for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
      const [ax,ay]=coarse.at(x,y);
      let sx=0,sy=0;
      for(let dy=0;dy<k;dy++)for(let dx=0;dx<k;dx++){const [bx,by]=fine.at(k*x+dx,k*y+dy);sx+=bx/(k*k);sy+=by/(k*k);}
      worst=Math.max(worst,Math.abs(ax-sx),Math.abs(ay-sy));
    }
    expect(worst).toBeLessThan(STEP);
  }
});

test('the map follows the screen: its density is the device pixel ratio, at least 1 and at most 3',()=>{
  expect([1,1.25,2,3,3.5,0.5,0,NaN].map(value=>lensDensity(value))).toEqual([1,1.25,2,3,3,1,1,1]);
});

test('a browser with no 2D canvas context gets no lens map, so the lens is left out rather than drawn unbent',()=>{
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>null,toDataURL:()=>'data:image/png;base64,AAAA'})});
  try{expect(lensPng(40,40)).toBe('');expect(lensPng(40,40,2)).toBe('');}finally{vi.unstubAllGlobals();}
});

test('only Chromium-based browsers report the Chromium brand',()=>{
  expect(isChromiumBrands([{brand:'Not:A-Brand',version:'99'},{brand:'Chromium',version:'131'},{brand:'Google Chrome',version:'131'}])).toBe(true);
  expect(isChromiumBrands([{brand:'Not A(Brand',version:'8'},{brand:'Chromium',version:'131'},{brand:'Microsoft Edge',version:'131'}])).toBe(true);
  expect(isChromiumBrands([{brand:'Not A(Brand',version:'24'}])).toBe(false);
  expect(isChromiumBrands([])).toBe(false);
  // Safari and Firefox do not expose userAgentData at all.
  expect(isChromiumBrands(undefined)).toBe(false);
});

test('Chromium refracts its backdrop, every other browser frosts its bar, and the flat modes get no lens',()=>{
  const chromium=[{brand:'Chromium',version:'131'}];
  const plain={reducedTransparency:false,moreContrast:false,forcedColours:false};
  expect(glassMode(chromium,plain)).toBe('backdrop');
  expect(glassMode(undefined,plain)).toBe('frost');
  expect(glassMode([{brand:'Not A(Brand',version:'24'}],plain)).toBe('frost');
  for(const brands of [chromium,undefined]){
    expect(glassMode(brands,{...plain,reducedTransparency:true})).toBe('off');
    expect(glassMode(brands,{...plain,moreContrast:true})).toBe('off');
    expect(glassMode(brands,{...plain,forcedColours:true})).toBe('off');
  }
});

test('pillVars turns a tab box into the pill custom properties, and no tab into a hidden pill',()=>{
  expect(pillVars({left:12,width:90})).toEqual({'--ui-pill-x':'12px','--ui-pill-w':'90px','--ui-pill-on':'1'});
  expect(pillVars({left:12.5,width:90.25})).toEqual({'--ui-pill-x':'12.5px','--ui-pill-w':'90.25px','--ui-pill-on':'1'});
  // With no current tab only the visibility changes, so the pill fades without sliding to the edge.
  expect(pillVars(null)).toEqual({'--ui-pill-on':'0'});
});
