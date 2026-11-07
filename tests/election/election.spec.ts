import {test,expect,originalTheme} from '../fixtures';
import {buildBundle} from '../../server/election-feed';

// A small, fixed feed so the page is tested without the Electoral Commission.
async function fixtureBundle(){
  const xml:Record<string,string>={
    'election.xml':'<?xml version="1.0"?><election updated="2026-11-07T20:30:00"><statistics><total_voting_places_counted>40</total_voting_places_counted><percent_voting_places_counted>40.0</percent_voting_places_counted><total_votes_cast>400</total_votes_cast><percent_votes_cast>40.0</percent_votes_cast><total_electorates_final>0</total_electorates_final><percent_electorates_final>0</percent_electorates_final><total_special_votes>9</total_special_votes></statistics><partystatus><party p_no="16"><votes>220</votes><percent_votes>55.0</percent_votes><party_seats>1</party_seats><candidate_seats>1</candidate_seats><total_seats>2</total_seats></party><party p_no="13"><votes>180</votes><percent_votes>45.0</percent_votes><party_seats>1</party_seats><candidate_seats>0</candidate_seats><total_seats>1</total_seats></party></partystatus></election>',
    'parties.xml':'<?xml version="1.0"?><parties><party p_no="16"><abbrev>NAT</abbrev><short_name>National Party</short_name><registered>yes</registered></party><party p_no="13"><abbrev>LAB</abbrev><short_name>Labour Party</short_name><registered>yes</registered></party></parties>',
    'electorates.xml':'<?xml version="1.0"?><electorates><electorate e_no="1"><electorate_name>Auckland Central</electorate_name></electorate><electorate e_no="2"><electorate_name>Waiariki</electorate_name></electorate></electorates>',
    'candidates.xml':'<?xml version="1.0"?><candidates><candidate c_no="1"><candidate_name>SMITH, Jane</candidate_name><electorate>1</electorate><party>16</party><list_no>1</list_no></candidate><candidate c_no="2"><candidate_name>BROWN, Sam</candidate_name><electorate>1</electorate><party>13</party><list_no>1</list_no></candidate><candidate c_no="3"><candidate_name>KING, Tom</candidate_name><electorate>0</electorate><party>16</party><list_no>2</list_no></candidate></candidates>',
    'e01/e01.xml':'<?xml version="1.0"?><electorate e_no="1" final="false" updated="2026-11-07T20:29:00"><statistics><total_voting_places>10</total_voting_places><total_voting_places_counted>4</total_voting_places_counted><percent_voting_places_counted>40.0</percent_voting_places_counted><total_votes_cast>200</total_votes_cast></statistics><partyvotes><party p_no="16"><votes>110</votes></party></partyvotes><candidatevotes><candidate c_no="1"><votes>120</votes></candidate><candidate c_no="2"><votes>78</votes></candidate></candidatevotes></electorate>',
  };
  return buildBundle(async url=>{const body=xml[String(url).split('/xml/')[1]];return body?new Response(body):new Response('',{status:404});});
}

test('Results Desk opens from the Menu and shows seats, electorates and members',async({page,context})=>{
  await originalTheme(context);
  const bundle=await fixtureBundle();
  await page.route(url=>url.pathname.endsWith('/api/election'),route=>route.fulfill({json:bundle}));
  await page.goto('./');
  // The library's live strip is the quick way in; the Menu has an entry too.
  const banner=page.locator('.election-banner');
  await expect(banner).toHaveAttribute('data-state','live');
  await expect(banner.locator('.eb-line')).toHaveText('National reach 2 of 3 seats with 40.0% of voting places counted: a majority of one.');
  await expect(banner.locator('.eb-seats i')).toHaveCount(2);
  await banner.click();
  await expect(page).toHaveURL(/#\/election$/);
  await page.goBack();
  await page.locator('.app-navigation [data-action="menu"]').click();
  await page.locator('#open-election').click();
  await expect(page).toHaveURL(/#\/election$/);
  await expect(page.locator('.el-status')).toHaveAttribute('data-state','live');
  await expect(page.locator('.el-headline')).toHaveText('National reach 2 of 3 seats with 40.0% of voting places counted: a majority of one.');
  await expect(page.locator('.el-house circle')).toHaveCount(3);
  await expect(page.locator('.el-tile')).toHaveCount(2);

  // Coalition builder: Labour alone is short.
  await page.locator('.el-toggle[data-party="13"]').click();
  await expect(page.locator('.el-majority p')).toContainText('1 of 3 seats · 1 short of a majority');
  await expect(page.locator('[data-field="live"][role=status]')).toContainText('1 short of a majority');

  await page.locator('[data-tab="electorates"]').click();
  await expect(page.locator('a.el-row')).toHaveCount(2);
  // A background update repaints the rows but leaves the search box and its text alone.
  const search=page.locator('[data-filter="query"]');
  await search.fill('Auck');await expect(page.locator('a.el-row')).toHaveCount(1);
  bundle.updated='2026-11-07T20:45:00';
  // Returning to a visible tab runs the same background refresh as the timer.
  const refreshed=page.waitForResponse(r=>r.url().includes('/api/election?part=2'));
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await refreshed;
  await expect(page.locator('.el-meta')).toContainText('8:45 pm');
  await expect(search).toBeFocused();await expect(search).toHaveValue('Auck');await expect(page.locator('a.el-row')).toHaveCount(1);
  await search.fill('');
  await page.locator('[data-kind="maori"]').click();
  await expect(page.locator('a.el-row')).toHaveText([/Waiariki/]);
  await page.locator('[data-kind="all"]').click();
  await page.locator('a.el-row',{hasText:'Auckland Central'}).click();
  await expect(page).toHaveURL(/#\/election\/e\/1$/);
  await expect(page.locator('.el-detail-lead')).toContainText('Jane Smith leads by 42');

  await page.locator('[data-tab="members"]').click();
  await expect(page.locator('.el-member-card').first()).toContainText('Tom King');

  await page.locator('.el-back').click();
  await expect(page.locator('.game-card').first()).toBeVisible();
});

test('Results Desk explains a feed failure and retries',async({page})=>{
  let fail=true;
  await page.route(url=>url.pathname.endsWith('/api/election'),async route=>fail?route.fulfill({status:502,json:{error:'The Electoral Commission results feed is not answering right now.'}}):route.fulfill({json:await fixtureBundle()}));
  await page.goto('./#/election');
  await expect(page.locator('.el-status')).toHaveAttribute('data-state','error');
  await expect(page.locator('.el-empty')).toContainText('not answering');
  fail=false;
  await page.locator('.el-empty [data-action="retry"]').click();
  await expect(page.locator('.el-status')).toHaveAttribute('data-state','live');
});
