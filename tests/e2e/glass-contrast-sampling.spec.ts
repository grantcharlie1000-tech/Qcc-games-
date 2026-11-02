import {test,expect} from '../fixtures';
import {glyphContrast,glyphContrastSamples} from '../glass-contrast';

for(const dpr of [1,2,3])test.describe(`contrast sampling at DSF${dpr}`,()=>{
  test.use({deviceScaleFactor:dpr});
  test('maps CSS glyph bounds to actual screenshot pixels and rejects low contrast or missing ink',async({page})=>{
    await page.setContent('<div id="surface" style="position:relative;width:100px;height:30px;background:white"><i style="position:absolute;left:65px;top:8px;width:10px;height:10px"></i></div>');
    const surface=page.locator('#surface');
    const shot=(await surface.screenshot()).toString('base64');
    await surface.evaluate(el=>{(el as HTMLElement).style.background='black';(el.firstElementChild as HTMLElement).style.background='white';});
    const mask=(await surface.screenshot()).toString('base64');
    const box={x:65,y:8,w:10,h:10},bounds={width:100,height:30};
    const ratios=await glyphContrast(page,shot,mask,[{...box,color:'rgb(0, 0, 0)'},{...box,color:'rgb(170, 170, 170)'},{...box,x:0,color:'rgb(0, 0, 0)'}],bounds);
    expect(ratios[0]).toBeCloseTo(21,3);expect(ratios[1]).toBeGreaterThan(2);expect(ratios[1]).toBeLessThan(4.5);expect(ratios[2]).toBe(0);
  });
  test('locates antialiased glyph cores without changing the specified-colour contrast requirement',async({page})=>{
    await page.setContent('<div id="surface" style="position:relative;width:100px;height:30px;background:white"><i style="position:absolute;left:65px;top:8px;width:10px;height:10px"></i></div>');
    const surface=page.locator('#surface'),shot=(await surface.screenshot()).toString('base64');
    const box={x:65,y:8,w:10,h:10,color:'rgb(0, 0, 0)'},bounds={width:100,height:30};
    await surface.evaluate(e=>{(e as HTMLElement).style.background='black';(e.firstElementChild as HTMLElement).style.background='#ccc';});
    const mask=(await surface.screenshot()).toString('base64');
    const [ratio]=await glyphContrast(page,shot,mask,[box],bounds);
    // The mask identifies ink locations, not the declared foreground colour.
    expect(ratio).toBeCloseTo(21,3);
    const [low]=await glyphContrast(page,shot,mask,[{...box,color:'rgb(170, 170, 170)'}],bounds);
    expect(low).toBeGreaterThan(2);expect(low).toBeLessThan(4.5);
  });
});

test.describe('thin diagonal contours',()=>{
  test.use({deviceScaleFactor:1});
  test('measures exterior pixels when axial neighbours are still antialiased ink',async({page})=>{
    await page.setContent('<canvas width="100" height="30"></canvas>');
    const surface=page.locator('canvas');
    await surface.evaluate(e=>{const c=(e as HTMLCanvasElement).getContext('2d')!;c.fillStyle='#fff';c.fillRect(0,0,100,30);c.fillStyle='#555';c.fillRect(86,13,1,1);});
    const shot=(await surface.screenshot()).toString('base64');
    await surface.evaluate(e=>{
      const c=(e as HTMLCanvasElement).getContext('2d')!;c.fillStyle='#000';c.fillRect(0,0,100,30);
      c.fillStyle='#808080';c.fillRect(64,13,3,1);c.fillRect(65,12,1,3);
      c.fillStyle='#fff';c.fillRect(65,13,1,1);c.fillRect(85,13,1,1);
    });
    const mask=(await surface.screenshot()).toString('base64'),box={x:60,y:8,w:10,h:10};
    const values=await glyphContrastSamples(page,shot,mask,[{...box,color:'rgb(0, 0, 0)'},{...box,color:'rgb(170, 170, 170)'},{...box,x:0,color:'rgb(0, 0, 0)'},{...box,x:80,color:'rgb(0, 0, 0)'}],{width:100,height:30},true);
    expect(values[0].count).toBe(4);expect(values[0].diagonalCount).toBe(4);expect(values[0].worst).toBeCloseTo(21,3);
    expect(values[1].count).toBe(4);expect(values[1].worst).toBeGreaterThan(2);expect(values[1].worst).toBeLessThan(4.5);
    expect(values[2]).toEqual({worst:0,typical:0,count:0});
    // A failed axial measurement cannot be replaced by passing diagonals.
    expect(values[3].count).toBe(4);expect(values[3].diagonalCount).toBeUndefined();expect(values[3].worst).toBeLessThan(4.5);
  });
});
