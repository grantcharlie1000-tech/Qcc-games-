import {expect,type Locator,type Page} from '@playwright/test';

/** Exercise real menu SVGs separately from their warning labels. Explicit
 * accessibility preferences keep the inherited/system palette, then returning
 * to normal must restore white without reopening the sheet. */
export async function expectSheetIconPalette(page:Page,sheet:Locator,danger:Locator,browserName:string){
 const icons=sheet.locator('svg.ui-icon:not(.app-status-icon)');
 const white=async()=>{
  expect(await icons.count()).toBeGreaterThan(1);
  await expect.poll(()=>icons.evaluateAll(es=>es.map(e=>getComputedStyle(e).color))).toEqual(Array(await icons.count()).fill('rgb(255, 255, 255)'));
  await expect.poll(()=>danger.locator('span').last().evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 100, 103)');
 };
 const inherited=async()=>{
  await expect.poll(()=>danger.locator('svg').evaluate(e=>getComputedStyle(e).color)).toBe(await danger.evaluate(e=>getComputedStyle(e).color));
  expect(await danger.locator('svg').evaluate(e=>e.style.getPropertyValue('--glass-adaptive-ink'))).toBe('');
 };
 await white();
 await page.emulateMedia({contrast:'more'});await inherited();
 await page.emulateMedia({contrast:'no-preference',forcedColors:'active'});await inherited();
 await page.emulateMedia({forcedColors:'none'});await white();
 if(browserName==='chromium'){
  const cdp=await page.context().newCDPSession(page);
  try{
   await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});await inherited();
   await cdp.send('Emulation.setEmulatedMedia',{features:[]});await white();
  }finally{await cdp.detach();}
 }
}
