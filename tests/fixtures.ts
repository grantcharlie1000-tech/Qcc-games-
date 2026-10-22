import {test as base,expect} from '@playwright/test';
import type {BrowserContext} from '@playwright/test';

// Existing game tests start after a user has chosen a topic. Study-specific tests
// use Playwright's base fixture to exercise the real first-visit chooser.
export async function seedStudyTopic(context:BrowserContext){
  await context.addInitScript(()=>{localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');});
}
export const test=base.extend({
  context:async({context},use)=>{await seedStudyTopic(context);await use(context);}
});
export {expect};
export type {Page} from '@playwright/test';
