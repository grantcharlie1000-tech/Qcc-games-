import {expect,test} from 'vitest';
import {CROP_GRID,sectionCrop} from '../../src/ui/section-lens';

// MOTION-6 (#24 review, finding 1): the frost's wide field reads mip level 3 of the backdrop crop (8 device px a texel at
// density 1.5), whose texel grid is anchored at the crop's origin and pitched by its size. The crop must sit on the screen's
// own grid of CROP_GRID device px, so a bar that grows about its centre under a press (x1.046 x1.065) reads its body blur
// on the same texels at the same screen point.
const restBar={left:16,top:772,right:306,bottom:832};
const grow=(bar:typeof restBar,sx:number,sy:number)=>{
  const cx=(bar.left+bar.right)/2,cy=(bar.top+bar.bottom)/2,hw=(bar.right-bar.left)*sx/2,hh=(bar.bottom-bar.top)*sy/2;
  return {left:cx-hw,top:cy-hh,right:cx+hw,bottom:cy+hh};
};
const onGrid=(value:number,density:number)=>Math.abs(value*density/CROP_GRID-Math.round(value*density/CROP_GRID))<1e-9;
// The phase, in mip-3 texels, at which a screen point reads the field: WebGL halves each level's size down to floor(size/8)
// texels at level 3, so a crop whose size is not a multiple of 8 device px pitches its texels wider than 8.
type Box={x:number;y:number;width:number;height:number};
const phase=(crop:Box,density:number,axis:'x'|'y',at:number)=>{
  const origin=crop[axis]*density,size=Math.round((axis==='x'?crop.width:crop.height)*density);
  const t=(at*density-origin)/(size/Math.floor(size/CROP_GRID));
  return t-Math.floor(t);
};
const apart=(a:number,b:number)=>Math.min(Math.abs(a-b),1-Math.abs(a-b));

test('the backdrop crop sits on the 8 device px grid, so the pressed bar reads its body blur at the same phase',()=>{
  for(const density of [1,1.25,1.5]){
    const rest=sectionCrop(restBar,density,390,844)!,held=sectionCrop(grow(restBar,1.046,1.065),density,390,844)!;
    expect(onGrid(rest.x,density)&&onGrid(rest.y,density)&&onGrid(held.x,density)&&onGrid(held.y,density),JSON.stringify([rest,held])).toBe(true);
    // An end the viewport does not clip also lands on the grid, so each mip level halves exactly.
    expect(onGrid(rest.x+rest.width,density)&&onGrid(held.x+held.width,density)).toBe(true);
    // The clipped bottom stops at the viewport, as before.
    expect(rest.y+rest.height).toBeCloseTo(844,6);
    // assemble.py's body strip (css x 233-273, inside the bar): the same screen point reads the same field texels.
    for(const [axis,at] of [['x',253],['y',795]] as const)
      expect(apart(phase(rest,density,axis,at),phase(held,density,axis,at)),`${density} ${axis}`).toBeLessThan(.05);
  }
  // The old crop (the bar's edges rounded to css px, 28 px out) read the strip about a third of a texel apart once the bar grew.
  const old=(bar:typeof restBar)=>{
    const x=Math.max(0,Math.floor(bar.left)-28),y=Math.max(0,Math.floor(bar.top)-28);
    return {x,y,width:Math.min(390,Math.ceil(bar.right)+28)-x,height:Math.min(844,Math.ceil(bar.bottom)+28)-y};
  };
  expect(apart(phase(old(restBar),1.5,'y',795),phase(old(grow(restBar,1.046,1.065)),1.5,'y',795))).toBeGreaterThan(.25);
});

test('the crop still holds 28 css px round the bar, inside the viewport',()=>{
  const crop=sectionCrop(restBar,1.5,390,844)!;
  expect(crop.x).toBe(0);
  expect(crop.y).toBeLessThanOrEqual(restBar.top-28);
  expect(crop.x+crop.width).toBeGreaterThanOrEqual(restBar.right+28);
  expect(crop.x+crop.width).toBeLessThan(restBar.right+28+CROP_GRID/1.5);
  expect(crop.y+crop.height).toBeLessThanOrEqual(844);
  expect(sectionCrop({left:16,top:900,right:306,bottom:960},1.5,390,844)).toBeNull();
});
