import {test,expect} from '../../fixtures';

test('district vistas have distinct silhouettes and parallax; depth fog leaves water and the upper playfield clear',async({page})=>{
 await page.goto('/#/game/last-light');await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const [{drawVistas},{drawDepthFog},{LEVELS},{createRun}]=await Promise.all(['/src/games/last-light/vista-art.ts','/src/games/last-light/world.ts','/src/games/last-light/levels.ts','/src/games/last-light/model.ts'].map(path=>import(path)));
  const districtPath='/src/games/last-light/district-vistas.ts';const {prepareDistrictVistas,drawDistrictVistas}=await import(districtPath);await prepareDistrictVistas;
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const c=canvas.getContext('2d')!,hash=(y=0,h=360)=>c.getImageData(0,y,640,h).data.reduce((n:number,v:number)=>Math.imul(n^v,16777619)>>>0,2166136261),vistas=[];
  for(const stage of [0,8,16,24,32]){const l=LEVELS[stage],before=JSON.stringify(l);c.clearRect(0,0,640,360);drawVistas(c,l,640,360,0,0);const still=hash();c.clearRect(0,0,640,360);drawVistas(c,l,640,360,180,0);vistas.push({still,moved:hash(),unchanged:before===JSON.stringify(l)});}
  const paintings=[8,24,32].map(stage=>drawDistrictVistas(c,LEVELS[stage],640,360,0,0));
  const s=createRun();const fill=()=>{c.fillStyle='#203040';c.fillRect(0,0,640,360);};fill();const upper=hash(0,200),lower=hash(280,80);drawDepthFog(c,LEVELS[0],s,0,0,640,360,true);const fog={upper:hash(0,200)===upper,lower:hash(280,80)!==lower};
  const first=hash();s.clock=20;fill();drawDepthFog(c,LEVELS[0],s,0,0,640,360,true);const frozen=hash()===first;fill();const waterBefore=hash();drawDepthFog(c,LEVELS[2],s,0,0,640,360,false);return {vistas,paintings,fog,frozen,waterClear:hash()===waterBefore};
 });
 expect(result.paintings).toEqual([true,true,true]);expect(new Set(result.vistas.map(v=>v.still)).size).toBe(5);for(const v of result.vistas){expect(v.still).not.toBe(v.moved);expect(v.unchanged).toBe(true);}expect(result.fog).toEqual({upper:true,lower:true});expect(result.frozen).toBe(true);expect(result.waterClear).toBe(true);
});
