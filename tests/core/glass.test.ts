import {expect,test,vi} from 'vitest';
import {glassMode,isChromiumBrands,LENS_BEND,LENS_BEVEL,LENS_CAP,LENS_MARGIN,lensDensity,lensField,lensPng,mirrorPlacement,pillVars,REFRACTION_SCALE} from '../../src/ui/glass';

// The island is 366 by 64 px at a 390 px viewport (12 px from each screen edge), and its lens field covers it plus the margin.
const W=366,H=64;
const WIDTH=W+2*LENS_MARGIN,HEIGHT=H+2*LENS_MARGIN;
const DENSITIES=[1,2,3];
// One channel step, in CSS px of shift: the 8-bit channel spans the scale in 255 steps.
const STEP=REFRACTION_SCALE/255;
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

  test(`at density ${density} the lens samples from beyond the rim: the straight rims bend by at least 15 px, and the ends by half that`,()=>{
    const middle=H/2;
    // The top and bottom rims are straight, so they carry the full bend, and each end carries LENS_CAP of it.
    expect(inBar(W/2,0)[1]).toBeLessThanOrEqual(-15);
    expect(inBar(W/2,H-1)[1]).toBeGreaterThanOrEqual(15);
    expect(inBar(0,middle)[0]).toBeLessThanOrEqual(-7);
    expect(inBar(W-1,middle)[0]).toBeGreaterThanOrEqual(7);
    expect(LENS_BEND).toBeGreaterThanOrEqual(15);
    // The lens reaches far enough past the bar for the whole bend.
    expect(LENS_MARGIN).toBeGreaterThanOrEqual(LENS_BEND);
  });

  test(`at density ${density} the ends shift between 7 and 9 px, so the end caps are eased by half against the straight rims`,()=>{
    expect(inBar(0,H/2)[0]).toBeGreaterThanOrEqual(-9);
    expect(inBar(0,H/2)[0]).toBeLessThanOrEqual(-7);
    expect(inBar(W-1,H/2)[0]).toBeGreaterThanOrEqual(7);
    expect(inBar(W-1,H/2)[0]).toBeLessThanOrEqual(9);
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
    // 24 px in from the left rim, past the 22 px bevel.
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

test('the mirror places each copy where its image sits, relative to the lens box',()=>{
  const bar={x:12,y:600,width:366,height:64};
  const images=[{x:12,y:560,width:170,height:200},{x:300,y:200,width:50,height:50}];
  // The lens box starts LENS_MARGIN before the bar, so the copy's origin is the image's offset from that corner.
  expect(mirrorPlacement(bar,images)).toEqual([{index:0,x:12-(12-LENS_MARGIN),y:560-(600-LENS_MARGIN),width:170,height:200}]);
});

test('the mirror keeps the sixteen copies with the most area under the lens, in document order',()=>{
  const bar={x:0,y:0,width:400,height:64};
  const images=Array.from({length:20},(_,i)=>({x:i*10,y:10,width:10+i,height:20}));
  const kept=mirrorPlacement(bar,images).map(placement=>placement.index);
  expect(kept).toEqual(Array.from({length:16},(_,i)=>i+4));
  expect(mirrorPlacement(bar,[{x:0,y:0,width:0,height:20}])).toEqual([]);
});

test('only Chromium-based browsers report the Chromium brand',()=>{
  expect(isChromiumBrands([{brand:'Not:A-Brand',version:'99'},{brand:'Chromium',version:'131'},{brand:'Google Chrome',version:'131'}])).toBe(true);
  expect(isChromiumBrands([{brand:'Not A(Brand',version:'8'},{brand:'Chromium',version:'131'},{brand:'Microsoft Edge',version:'131'}])).toBe(true);
  expect(isChromiumBrands([{brand:'Not A(Brand',version:'24'}])).toBe(false);
  expect(isChromiumBrands([])).toBe(false);
  // Safari and Firefox do not expose userAgentData at all.
  expect(isChromiumBrands(undefined)).toBe(false);
});

test('Chromium refracts its backdrop, every other browser mirrors, and the flat modes get no lens',()=>{
  const chromium=[{brand:'Chromium',version:'131'}];
  const plain={reducedTransparency:false,moreContrast:false,forcedColours:false};
  expect(glassMode(chromium,plain)).toBe('backdrop');
  expect(glassMode(undefined,plain)).toBe('mirror');
  expect(glassMode([{brand:'Not A(Brand',version:'24'}],plain)).toBe('mirror');
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
