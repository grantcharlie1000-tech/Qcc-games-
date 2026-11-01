import {test,expect} from '../../fixtures';
for(const tier of ['potato','low','high'])test(`${tier} has daylight fill, an unclipped sky and correctly encoded output`,async({page})=>{
 test.setTimeout(180000);await page.goto(`/?quality=${tier}&test&seed=42#/game/strongroom`);await expect(page.locator('.strongroom-game')).toHaveAttribute('data-models','true',{timeout:140000});
 const value=await page.evaluate(()=>{const g=(window as any).__game,view=g.view,lights:any[]=[];view.scene.traverse((o:any)=>{if(o.isLight)lights.push({type:o.type,intensity:o.intensity,name:o.name});});return {exposure:g.renderer.toneMappingExposure,output:g.renderer.outputColorSpace,shadows:g.renderer.shadowMap.enabled,passes:view.composer?.passes.length??0,lights,background:!!view.scene.background,sky:!!view.world.sky?.dome};});
 expect(value.output).toBe('srgb');expect(value.exposure).toBeGreaterThanOrEqual(1.3);expect(value.lights.some(l=>l.name==='daylight-fill'&&l.intensity>=1.5)).toBe(true);expect(value.background||value.sky).toBe(true);if(tier==='potato'||tier==='low'){expect(value.shadows).toBe(false);expect(value.passes).toBe(0);}
});
