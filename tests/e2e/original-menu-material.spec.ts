import {test,expect} from '../fixtures';

// Brief 32's restored game cards retain their original palette and typography.
for(const [id,selector,fill] of [
  ['snake','.snake-card','rgba(20, 55, 38, 0.59)'],
  ['quadfall','.qf-card','rgba(23, 34, 57, 0.96)'],
  ['maze-muncher','.mm-card','rgba(5, 7, 26, 0.816)'],
  ['flappy-bird','.fb-card','rgba(255, 243, 217, 0.96)'],
])test(`${id} keeps its original menu material`,async({page})=>{
  await page.goto(`/#/game/${id}`);
  const card=page.locator(selector).first();await expect(card).toBeVisible();
  await expect(card).toHaveCSS('background-color',fill);
  await expect(card).toHaveCSS('backdrop-filter','none');
  await expect(card).toHaveCSS('-webkit-text-stroke-width','0px');
  expect(await card.locator('strong,h2').first().evaluate(e=>getComputedStyle(e).fontFamily)).toContain('Arcade');
});
