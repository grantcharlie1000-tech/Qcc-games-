import {expect,test} from 'vitest';
import {glassMap,isChromiumBrands,pillVars,refractionAllowed,REFRACTION_SCALE,RIM_EDGE} from '../../src/ui/glass';

// The attributes of every <name> tag in an SVG string, in document order.
function tags(svg:string,name:string):Record<string,string>[]{
  return [...svg.matchAll(new RegExp(`<${name}\\b([^>]*?)/?>`,'g'))].map(match=>
    Object.fromEntries([...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(attr=>[attr[1],attr[2]])));
}

test('glassMap is an SVG sized to the bar, with a viewBox of the same size',()=>{
  const svg=glassMap(390,64);
  expect(svg.startsWith('<svg')).toBe(true);
  expect(tags(svg,'svg')[0]).toMatchObject({width:'390',height:'64',viewBox:'0 0 390 64'});
  expect(svg).not.toMatch(/NaN|undefined|Infinity/);
});

test('glassMap runs red to black across and green to black down, screened together',()=>{
  const svg=glassMap(390,64);
  const gradients=tags(svg,'linearGradient');
  const across=gradients.find(g=>g.x2==='1'&&g.y2==='0');
  const down=gradients.find(g=>g.x2==='0'&&g.y2==='1');
  expect(across).toBeDefined();
  expect(down).toBeDefined();
  expect(svg).toMatch(/<linearGradient[^>]*x2="1"[^>]*>\s*<stop offset="0" stop-color="#f00"\/>\s*<stop offset="1" stop-color="#000"\/>/);
  expect(svg).toMatch(/<linearGradient[^>]*x2="0"[^>]*>\s*<stop offset="0" stop-color="#0f0"\/>\s*<stop offset="1" stop-color="#000"\/>/);
  const fills=tags(svg,'rect').filter(r=>r.width==='390'&&r.height==='64');
  expect(fills).toHaveLength(2);
  expect(fills[0].fill).toBe(`url(#${across!.id})`);
  expect(fills[1].fill).toBe(`url(#${down!.id})`);
  expect(fills[1].style).toBe('mix-blend-mode:screen');
});

test('glassMap puts a neutral rounded rect inset by the edge, with rx of half the inset height',()=>{
  const rim=tags(glassMap(390,64),'rect').find(r=>r.fill==='rgb(128,128,128)');
  expect(rim).toMatchObject({x:'14',y:'14',width:'362',height:'36',rx:'18'});
  expect(tags(glassMap(390,64,10),'rect').find(r=>r.fill==='rgb(128,128,128)')).toMatchObject({x:'10',y:'10',width:'370',height:'44',rx:'22'});
});

test('glassMap blurs the rim by half the edge and gives the blur room to spread',()=>{
  const svg=glassMap(390,64);
  const rim=tags(svg,'rect').find(r=>r.fill==='rgb(128,128,128)')!;
  const blur=rim.filter.match(/^url\(#([^)]+)\)$/);
  expect(blur).not.toBeNull();
  const filter=tags(svg,'filter').find(f=>f.id===blur![1]);
  // The region grows by half the rim on each side, so the blur's tail is never cut where the bend is still strong.
  expect(filter).toMatchObject({x:'-50%',y:'-50%',width:'200%',height:'200%'});
  expect(tags(svg,'feGaussianBlur')[0].stdDeviation).toBe('7');
  expect(tags(glassMap(390,64,10),'feGaussianBlur')[0].stdDeviation).toBe('5');
});

test('glassMap clamps the rim on bars too small for the edge, so no size goes negative',()=>{
  const svg=glassMap(20,20);
  expect(tags(svg,'rect').find(r=>r.fill==='rgb(128,128,128)')).toMatchObject({width:'0',height:'0',rx:'0'});
  for(const rect of tags(svg,'rect')){
    expect(Number(rect.width??0)).toBeGreaterThanOrEqual(0);
    expect(Number(rect.height??0)).toBeGreaterThanOrEqual(0);
  }
});

test('glassMap defaults to the 14 px rim and is deterministic',()=>{
  expect(glassMap(390,64)).toBe(glassMap(390,64,RIM_EDGE));
  expect(RIM_EDGE).toBe(14);
  expect(glassMap(366,64)).toBe(glassMap(366,64));
});

// The bend is half the scale each way, and the rim falls off as a Gaussian edge with the blur's deviation. The steepest step
// of that falloff times the bend must stay under one, or the content folds over itself.
test('the refraction bends the rim without folding the content',()=>{
  const steepest=(REFRACTION_SCALE/2)*(1/((RIM_EDGE/2)*Math.sqrt(2*Math.PI)));
  expect(steepest).toBeLessThan(1);
  expect(steepest).toBeGreaterThan(0.5);
});

test('only Chromium-based browsers report the Chromium brand',()=>{
  expect(isChromiumBrands([{brand:'Not:A-Brand',version:'99'},{brand:'Chromium',version:'131'},{brand:'Google Chrome',version:'131'}])).toBe(true);
  expect(isChromiumBrands([{brand:'Not A(Brand',version:'8'},{brand:'Chromium',version:'131'},{brand:'Microsoft Edge',version:'131'}])).toBe(true);
  expect(isChromiumBrands([{brand:'Not A(Brand',version:'24'}])).toBe(false);
  expect(isChromiumBrands([])).toBe(false);
  // Safari and Firefox do not expose userAgentData at all.
  expect(isChromiumBrands(undefined)).toBe(false);
});

test('refraction needs Chromium and no reduced transparency',()=>{
  const chromium=[{brand:'Chromium',version:'131'}];
  expect(refractionAllowed(chromium,false)).toBe(true);
  expect(refractionAllowed(chromium,true)).toBe(false);
  expect(refractionAllowed(undefined,false)).toBe(false);
});

test('pillVars turns a tab box into the pill custom properties, and no tab into a hidden pill',()=>{
  expect(pillVars({left:12,width:90})).toEqual({'--ui-pill-x':'12px','--ui-pill-w':'90px','--ui-pill-on':'1'});
  expect(pillVars({left:12.5,width:90.25})).toEqual({'--ui-pill-x':'12.5px','--ui-pill-w':'90.25px','--ui-pill-on':'1'});
  // With no current tab only the visibility changes, so the pill fades without sliding to the edge.
  expect(pillVars(null)).toEqual({'--ui-pill-on':'0'});
});
