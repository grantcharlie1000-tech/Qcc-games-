import {test,expect} from '../../fixtures';

test.use({reducedMotion:'reduce'});
test('earn Master by playing the tour, return to its saved board and play the pilot',async({page})=>{
  await page.goto('/?festive=off#/game/drift-club');
  await page.locator('.dc-book-open').click();await expect(page.locator('.dc-master')).toBeDisabled();await page.getByLabel('Close logbook').click();
  const rounds=[[[12,66,-1],[0,65],[37,94],[-16,68]],[[-7,68],[10,70],[40,90],[-18,74]],[[2,67],[-6,64],[-30,81],[4,61]]];
  for(const [i,shots] of rounds.entries()){
    for(const [a,p,s] of shots){
      await page.locator('.dc-angle').fill(String(a));await page.locator('.dc-power').fill(String(p));
      if(s)await page.locator('[data-spin="-1"]').click();
      await page.locator('.dc-shoot').click();
    }
    if(i<2)await page.locator('.dc-advance').click();
  }
  await expect(page.locator('.dc-result h3')).toHaveText('Bronze tour');
  await page.locator('.dc-result-book').click();await expect(page.locator('.dc-record')).toContainText('35 pts');
  await page.locator('.dc-master').click();await expect(page.locator('.dc-course')).toHaveText('Breakwater');
  await page.locator('.dc-shoot').click();await page.reload();
  await expect(page.locator('.dc')).toHaveAttribute('data-throws','1');await expect(page.locator('.dc-course')).toHaveText('Breakwater');
  await page.locator('[data-mode="rival"]').click();await page.locator('.dc-shoot').click();
  await expect(page.locator('.dc')).toHaveAttribute('data-throws','2');await expect(page.locator('.dc-player')).toHaveText('Your shot');
});
test('restart during the final accepted delivery retains the earned circuit',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  const plan=[[12,66,-1],[0,65],[37,94],[-16,68],[-7,68],[10,70],[40,90],[-18,74],[2,67],[-6,64],[-30,81]];
  await page.addInitScript(shots=>{
    const solo={mode:'solo',end:2,shots:shots.map(([angle,power,spin=0])=>({angle,power,spin}))};
    const data={v:1,mode:'solo',solo,duel:{mode:'duel',end:0,shots:[]}};
    localStorage.setItem('pocket-arcade:v1:save:drift-club',JSON.stringify({version:1,data}));
  },plan);
  await page.goto('/?festive=off#/game/drift-club');
  await page.locator('.dc-angle').fill('4');await page.locator('.dc-power').fill('61');await page.locator('.dc-shoot').click();
  await page.locator('#game-menu').click();await page.locator('#restart-game').click();
  await expect(page.locator('.dc')).toHaveAttribute('data-throws','0');
  await page.locator('.dc-book-open').click();await expect(page.locator('.dc-master')).toBeEnabled();
  await expect(page.locator('.dc-record')).toContainText('35 pts');
});
