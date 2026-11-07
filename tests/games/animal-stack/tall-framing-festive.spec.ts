import {test,expect}from'../../fixtures';import{readFileSync}from'node:fs';
// Christmas skin: hats, antlers and scarves are drawn on top of the sprites. The camera still frames only the
// physics bounds, so this checks the rendered HUD band against the festive backdrop that is stamped there.
const saved=JSON.parse(readFileSync(new URL('./tall-run.json',import.meta.url),'utf8'));
for(const viewport of [{width:390,height:844},{width:844,height:390}])test(`festive tall stack keeps accessories clear of the HUD ${viewport.width}×${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/');await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:animal-stack',JSON.stringify({version:1,data,updated:Date.now()})),saved);await page.goto('/#/game/animal-stack');
 const root=page.locator('.animal-stack'),canvas=root.locator('canvas');await expect(root).toHaveAttribute('data-balanced','5');await expect(root).toHaveAttribute('data-ready','true');
 expect(await page.evaluate(()=>document.documentElement.dataset.festive)).toBe('christmas');
 const inkAboveHUD=()=>canvas.evaluate(async element=>{
  const c=element as HTMLCanvasElement,rect=c.getBoundingClientRect(),ratio=c.height/rect.height,height=Math.min(c.height,Math.ceil(76*ratio));
  // The dev server serves the game's own art module; the same function painted the backdrop being compared.
  const url='/src/games/animal-stack/christmas-art.ts';
  const {festiveBackdrop}=await import(/* @vite-ignore */ url) as {festiveBackdrop:(width:number,height:number,ratio:number)=>HTMLCanvasElement};
  const reference=festiveBackdrop(c.width/ratio,c.height/ratio,ratio).getContext('2d')!.getImageData(0,0,c.width,height).data;
  const pixels=c.getContext('2d')!.getImageData(0,0,c.width,height).data;let ink=0;
  for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-reference[i])>2||Math.abs(pixels[i+1]-reference[i+1])>2||Math.abs(pixels[i+2]-reference[i+2])>2)ink++;
  return ink;
 });
 await expect.poll(inkAboveHUD).toBe(0);
 for(let rotation=0;rotation<8;rotation++){await canvas.focus();await page.keyboard.press('e');await canvas.evaluate(e=>(e as HTMLElement).blur());await expect.poll(inkAboveHUD).toBe(0);}
 await page.setViewportSize(viewport.height===390?{width:390,height:844}:{width:844,height:390});await expect.poll(inkAboveHUD).toBe(0);await expect(root).toHaveAttribute('data-count','5');
});
