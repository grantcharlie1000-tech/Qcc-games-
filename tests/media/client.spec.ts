import {test,expect} from '@playwright/test';
import sharp from 'sharp';
// prepareImage wired to a real createImageBitmap and canvas (the vite dev server serves the module).
const prepare=async(page:import('@playwright/test').Page,bytes:Buffer,type:string,purpose:string)=>page.evaluate(async({data,type,purpose})=>{
 const {prepareImage}:{prepareImage:(file:File,purpose:string)=>Promise<File>}=await import(/* @vite-ignore */ '/src/media/'+'client.ts');
 const input=new File([new Uint8Array(data)],'in',{type});
 const out=await prepareImage(input,purpose as 'post');
 const bitmap=await createImageBitmap(out);const size={width:bitmap.width,height:bitmap.height};bitmap.close();
 return {same:out===input,type:out.type,bytes:Array.from(new Uint8Array(await out.arrayBuffer())),...size};
},{data:Array.from(bytes),type,purpose});
test.beforeEach(async({page})=>{await page.goto('/');});
test('a small PNG passes through with the same bytes',async({page})=>{
 const png=await sharp({create:{width:300,height:200,channels:3,background:'#336699'}}).png().toBuffer();
 const result=await prepare(page,png,'image/png','post');
 expect(result.same).toBe(true);expect(Buffer.from(result.bytes).equals(png)).toBe(true);expect([result.width,result.height]).toEqual([300,200]);
});
test('a large JPEG is shrunk to the purpose edge',async({page})=>{
 const noisy=sharp(Buffer.alloc(3000*2000*3).map((_,i)=>(i*7919)%251),{raw:{width:3000,height:2000,channels:3}}).blur(3).jpeg({quality:90});
 const jpeg=await noisy.toBuffer();
 const result=await prepare(page,jpeg,'image/jpeg','post');
 expect(result.same).toBe(false);expect(result.type).toBe('image/jpeg');
 expect(Math.max(result.width,result.height)).toBe(1600);expect(result.bytes.length).toBeLessThanOrEqual(4194304);
});
test('a portrait avatar keeps its short side at 256',async({page})=>{
 const noisy=await sharp(Buffer.alloc(600*900*3).map((_,i)=>(i*7919)%251),{raw:{width:600,height:900,channels:3}}).blur(2).jpeg({quality:90}).toBuffer();
 const result=await prepare(page,noisy,'image/jpeg','avatar');
 expect(result.width).toBe(256);expect(result.height).toBe(384);
});
test('an empty file is refused before decoding',async({page})=>{
 const message=await page.evaluate(async()=>{const {prepareImage}:{prepareImage:(file:File,purpose:string)=>Promise<File>}=await import(/* @vite-ignore */ '/src/media/'+'client.ts');try{await prepareImage(new File([],'e.png',{type:'image/png'}),'post');return 'none';}catch(error){return (error as Error).message;}});
 expect(message).toContain('can’t be read');
});
