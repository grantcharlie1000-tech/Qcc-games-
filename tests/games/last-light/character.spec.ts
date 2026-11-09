import {test,expect} from '../../fixtures';

test('courier renders distinct movement frames, freezes on pause, honors reduced motion and clears retries',async({page})=>{
 await page.goto('/#/game/last-light');await expect(page.getByRole('button',{name:'Play →'})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const courierPath='/src/games/last-light/courier.ts',modelPath='/src/games/last-light/model.ts';
  const {Courier}=await import(courierPath),{createRun,respawn}=await import(modelPath);
  const canvas=document.createElement('canvas');canvas.width=150;canvas.height=100;const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
  const courier=new Courier(),s=createRun();Object.assign(s,{x:0,y:0,clock:1,grounded:true,ground:0,vx:220});
  function draw(actor=courier,run=s,reduced=false){
   c.clearRect(0,0,150,100);c.save();c.translate(40,20);c.scale(2,2);actor.draw(c,run,'#f3c77a',reduced);c.restore();
   return c.getImageData(0,0,150,100).data.reduce((hash:number,value:number)=>Math.imul(hash^value,16777619)>>>0,2166136261);
  }
  const frames:number[]=[];
  for(let i=0;i<24;i++){s.clock+=1/120;courier.tick(s,{},1/120);if(i%3===0)frames.push(draw());}
  const before=JSON.stringify(s),frozen=[draw(),draw(),draw()],unmutated=before===JSON.stringify(s);
  s.vx=0;const reduced:number[]=[];for(const clock of [2,3,4.7]){s.clock=clock;courier.tick(s,{},1/120);reduced.push(draw(courier,s,true));}
  s.clock=5;s.grounded=false;s.dashLeft=.12;s.vx=560;courier.tick(s,{dash:true},1/120);draw();
  // Menu/keyboard retries teleport the same Run without emitting a physics death event.
  respawn(s);const afterRetry=draw(),freshRetry=draw(new Courier(),s);
  s.respawn=0;s.clock=6;s.dashLeft=.12;courier.tick(s,{dash:true},1/120);s.stage=1;s.clock=0;s.dashLeft=0;
  const afterStage=draw(),freshStage=draw(new Courier(),s);
  const replacement=createRun();const afterNewRun=draw(courier,replacement),freshNewRun=draw(new Courier(),replacement);
  return {frames,frozen,unmutated,reduced,afterRetry,freshRetry,afterStage,freshStage,afterNewRun,freshNewRun,alpha:c.globalAlpha};
 });
 expect(new Set(result.frames).size).toBeGreaterThanOrEqual(6);
 expect(new Set(result.frozen).size).toBe(1);
 expect(result.unmutated).toBe(true);
 expect(new Set(result.reduced).size).toBe(1);
 expect(result.afterRetry).toBe(result.freshRetry);
 expect(result.afterStage).toBe(result.freshStage);
 expect(result.afterNewRun).toBe(result.freshNewRun);
 expect(result.alpha).toBe(1);
});
