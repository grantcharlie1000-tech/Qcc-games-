import {test,expect} from '../../fixtures';

test('Strongroom is private in the library, search and favourites',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('pocket-arcade:v1:favourites',JSON.stringify(['strongroom'])));
 await page.goto('/#/collection');
 await expect(page.locator('.game-card')).toHaveCount(21);
 await expect(page.getByRole('link',{name:'Play Strongroom',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await page.getByRole('searchbox',{name:'Find a game'}).fill('Strongroom');
 await page.getByRole('button',{name:'Close menu',exact:true}).click();
 await expect(page.locator('.game-card')).toHaveCount(0);
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await page.getByRole('searchbox',{name:'Find a game'}).fill('');
 await page.getByLabel('Favourites only',{exact:true}).check();
 await page.getByRole('button',{name:'Close menu',exact:true}).click();
 await expect(page.locator('.game-card')).toHaveCount(0);
});

test('direct Strongroom invitations are noindex and leaving restores normal metadata',async({page})=>{
 test.setTimeout(180000);
 await page.goto('/?quality=potato&test#/game/strongroom?room=ABC234');
 await expect(page.locator('meta[name=robots]')).toHaveAttribute('content',/noindex/);
 await expect(page).toHaveURL(/#\/collection\/22\?room=ABC234$/);
 await expect(page.getByRole('textbox',{name:'Room code',exact:true})).toHaveValue('ABC234',{timeout:120000});
 await page.getByRole('button',{name:'Close Strongroom online',exact:true}).click();
 await page.getByRole('link',{name:'Back to game library',exact:true}).click();
 await expect(page.locator('.game-card')).toHaveCount(21);
 await expect(page.locator('meta[name=robots]')).toHaveCount(0);
});
