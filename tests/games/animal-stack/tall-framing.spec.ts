import {test,expect}from'../../fixtures';import{readFileSync}from'node:fs';
const saved=JSON.parse(readFileSync(new URL('./tall-run.json',import.meta.url),'utf8'));
for(const viewport of [{width:390,height:844},{width:844,height:390}])test(`real tall saved stack clears HUD through rotations and resize ${viewport.width}×${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/');await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:animal-stack',JSON.stringify({version:1,data,updated:Date.now()})),saved);await page.goto('/#/game/animal-stack');const root=page.locator('.animal-stack'),canvas=root.locator('canvas');await expect(root).toHaveAttribute('data-balanced','5');await expect(root).toHaveAttribute('data-ready','true');
 // Observe actual rasterized Canvas pixels; HUD itself is an independent DOM layer.
 const pixelsAboveHUD=()=>canvas.evaluate(element=>{const c=element as HTMLCanvasElement,ratio=c.height/c.getBoundingClientRect().height,ctx=c.getContext('2d')!,width=c.width,height=Math.min(c.height,Math.ceil(76*ratio)),pixels=ctx.getImageData(0,0,width,height).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]!==85||pixels[i+1]!==195||pixels[i+2]!==236)ink++;return ink;});
 await expect.poll(pixelsAboveHUD).toBe(0);
 // Clear keyboard focus before pixel scan: its outline is CSS, not animal art.
 for(let rotation=0;rotation<8;rotation++){await canvas.focus();await page.keyboard.press('e');await canvas.evaluate(e=>(e as HTMLElement).blur());await expect.poll(pixelsAboveHUD).toBe(0);}
 await page.screenshot({path:`tests/games/animal-stack/evidence/tall-${viewport.width}x${viewport.height}.png`});
 await expect(root.getByRole('button',{name:/^Drop /})).toBeVisible();
 // Pointer capture at the rendered waiting sloth centre verifies the same inverse camera transform.
 const centre=await canvas.evaluate(element=>{const c=element as HTMLCanvasElement,ctx=c.getContext('2d')!,rect=c.getBoundingClientRect(),ratio=c.height/rect.height,pixels=ctx.getImageData(0,0,c.width,c.height).data;let x=0,y=0,count=0;for(let py=Math.ceil(84*ratio);py<Math.min(c.height,Math.floor(140*ratio));py++)for(let px=0;px<c.width;px++){const i=(py*c.width+px)*4;if(pixels[i]===149&&pixels[i+1]===145&&pixels[i+2]===138){x+=px;y+=py;count++;}}return count?{x:rect.x+x/count/ratio,y:rect.y+y/count/ratio}:null;});
 if(viewport.height===390){expect(centre).not.toBeNull();await page.mouse.move(centre!.x,centre!.y);await page.mouse.down();await page.mouse.move(centre!.x+12,centre!.y,{steps:5});await page.mouse.up();await expect(root).not.toHaveAttribute('data-aim','180');await expect(root).toHaveAttribute('data-count','5');}
 await page.setViewportSize(viewport.height===390?{width:390,height:844}:{width:844,height:390});await expect.poll(pixelsAboveHUD).toBe(0);await expect(root).toHaveAttribute('data-count','5');
});
