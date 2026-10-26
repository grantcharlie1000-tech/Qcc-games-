import {test as base,expect} from '@playwright/test';
import type {BrowserContext} from '@playwright/test';

// Existing game tests start after a user has chosen a topic. Study-specific tests
// use guestTest to skip only account entry and exercise the real first-visit chooser.
export async function seedGuest(context:BrowserContext){
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
export {expect};
export type {Page} from '@playwright/test';
