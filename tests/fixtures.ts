import {test as base,expect} from '@playwright/test';
import type {BrowserContext,Page} from '@playwright/test';

// Existing game tests start after a user has chosen a topic. Study-specific tests
// use guestTest to skip only account entry and exercise the real first-visit chooser.
// Every request for a TMDB image gets a 1x1 PNG, so no test reaches the image server. seedStudyTopic calls this too.
export async function seedGuest(context:BrowserContext){
  await context.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
  await context.addInitScript(()=>{if(window!==window.top)return;try{localStorage.setItem('pocket-arcade:v1:accounts:guest','true');}catch{/* blocked storage tests choose guest explicitly */}});
}
export const guestTest=base.extend({
  context:async({context},use)=>{await seedGuest(context);await use(context);}
});
export async function seedStudyTopic(context:BrowserContext){
  await seedGuest(context);
  await context.addInitScript(()=>{if(window!==window.top)return;localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');});
}
export const test=base.extend({
  context:async({context},use)=>{await seedStudyTopic(context);await use(context);}
});
// Keyboard use without moving focus: a Tab keydown on the focused element, which src/ui/focus.ts counts as keyboard input.
export async function keyboardMode(page:Page){await page.evaluate(()=>(document.activeElement??document.body).dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true})));}
export {expect};
export type {Page} from '@playwright/test';
