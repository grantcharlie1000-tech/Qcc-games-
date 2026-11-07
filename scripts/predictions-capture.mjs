// Drives the running local stack (QCC_PREDICTIONS=on npm run dev:online) through a full two-account flow and
// captures screenshots. Usage: node scripts/predictions-capture.mjs <outDir> <tokens.json>  (tokens: {pr_alice,pr_bob,pr_mod} from accounts signup; pr_mod granted via QCC_PREDICTIONS_MODERATORS)
// Set PLAYWRIGHT_CHROMIUM to a browser path if the pinned Playwright browser is not installed.
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('@playwright/test');
import {readFileSync,mkdirSync} from 'node:fs';
const [out,tokensFile]=process.argv.slice(2);mkdirSync(out,{recursive:true});
const tokens=JSON.parse(readFileSync(tokensFile,'utf8'));
const BASE='http://localhost:4173/';
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM?{executablePath:process.env.PLAYWRIGHT_CHROMIUM}:{})});
const log=[];const note=(...a)=>{const s=a.join(' ');log.push(s);console.log(s);};
async function ctx(user,viewport,mobile=false){
 const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',timezoneId:'Pacific/Auckland'});
 await context.addInitScript(([user,token])=>{
  if(window!==window.top)return;
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
  localStorage.setItem('qcc:festive','off');localStorage.setItem('pocket-arcade:v1:accounts:guest','true');
  if(user){localStorage.setItem('pocket-arcade:v1:accounts:session',JSON.stringify({token,username:user}));localStorage.setItem('qcc:christmas-welcome:2026:'+user,'seen');}
 },[user,user?tokens[user]:null]);
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 return {context,page,errors};
}
const shot=async(page,name)=>{await page.waitForTimeout(250);await page.screenshot({path:`${out}/${name}.png`,fullPage:false});note('shot',name);};
const go=async(page,hash)=>{await page.goto(BASE+hash);await page.waitForSelector('.pr-panel h1,.pr-panel .pr-head',{timeout:15000});await page.waitForTimeout(300);};

// 1. Guest at 390: browse.
{const {page,context}=await ctx(null,{width:390,height:844},true);await go(page,'#/predictions');await shot(page,'01-guest-explore-390');await context.close();}

// 2. Alice on a phone: join, quick YES from a card, review, confirm, receipt.
const alice=await ctx('pr_alice',{width:390,height:844},true);
{const {page}=alice;
 await go(page,'#/predictions');await shot(page,'02-alice-join-390');
 await page.getByRole('button',{name:/Join and get/}).click();
 await page.waitForSelector('.pr-balance:not([hidden])');await shot(page,'03-alice-explore-390');
 await page.locator('.pr-card').first().getByRole('button',{name:/^YES/}).click();
 await page.waitForSelector('#predictions-trade[open] .pr-quote-table');
 await page.locator('#predictions-trade').getByRole('button',{name:/^2$/}).click();
 await page.waitForFunction(()=>/Review YES · 2\.00/.test(document.querySelector('#predictions-trade button[type=submit]')?.textContent??''));
 await shot(page,'04-alice-ticket-sheet-390');
 await page.locator('#predictions-trade button[type=submit]').click();
 await page.waitForSelector('[data-flow="confirm"]');await shot(page,'05-alice-review-390');
 await page.locator('[data-flow="confirm"]').click();
 await page.waitForSelector('.pr-done');await shot(page,'06-alice-receipt-390');
 note('alice receipt:',(await page.locator('#predictions-trade').innerText()).replace(/\s+/g,' '));
 await page.locator('#predictions-trade [data-flow="close"].pr-primary').click();
}
// 3. Bob on desktop: market detail, NO for 3 credits via the inline ticket.
const bob=await ctx('pr_bob',{width:1440,height:1000});
let marketHash;
{const {page}=bob;
 await go(page,'#/predictions');await page.getByRole('button',{name:/Join and get/}).click();await page.waitForSelector('.pr-balance:not([hidden])');
 await shot(page,'07-bob-explore-1440');
 const href=await page.locator('.pr-card-q a').first().getAttribute('href');marketHash=href;
 await go(page,href);
 await page.locator('.pr-side .pr-no').click();
 await page.locator('#pr-amount').fill('3');
 await page.waitForFunction(()=>/Review NO · 3\.00/.test(document.querySelector('.pr-ticket button[type=submit]')?.textContent??''));
 await shot(page,'08-bob-detail-ticket-1440');
 await page.locator('.pr-ticket button[type=submit]').click();
 await page.waitForSelector('[data-flow="confirm"]');await shot(page,'09-bob-review-1440');
 await page.locator('[data-flow="confirm"]').click();await page.waitForSelector('.pr-done');
 note('bob receipt:',(await page.locator('#predictions-trade').innerText()).replace(/\s+/g,' '));
 await page.locator('#predictions-trade [data-flow="close"].pr-primary').click();
 await page.waitForTimeout(800);await shot(page,'10-bob-detail-after-1440');
}
// 4. Alice sells half from My calls; then views the market chart.
{const {page}=alice;
 await go(page,'#/predictions/calls');await shot(page,'11-alice-calls-390');
 await page.getByRole('button',{name:'Sell'}).first().click();
 await page.waitForSelector('#predictions-trade[open]');await page.locator('#predictions-trade').getByRole('button',{name:/^Half/}).click();
 await page.waitForSelector('[data-flow="sell-review"]:not([disabled])');await shot(page,'12-alice-sell-390');
 await page.locator('[data-flow="sell-review"]').click();await page.waitForSelector('[data-flow="confirm"]');
 await page.locator('[data-flow="confirm"]').click();await page.waitForSelector('.pr-done');
 note('alice sale:',(await page.locator('#predictions-trade').innerText()).replace(/\s+/g,' '));
 await page.locator('#predictions-trade [data-flow="close"].pr-primary').click();
 await go(page,marketHash);await shot(page,'13-alice-detail-390');
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await shot(page,'14-alice-detail-rules-390');
}
// 5. Alice asks a question (3 steps).
{const {page}=alice;
 await go(page,'#/predictions/ask');
 await page.locator('#pr-f-question').fill('Will the school library quiz night run on its scheduled date?');
 await page.locator('#pr-f-category').selectOption('school');
 await page.getByRole('button',{name:'Continue'}).click();
 await page.getByRole('button',{name:'Continue'}).click();// errors expected
 await shot(page,'15-ask-errors-390');
 await page.locator('#pr-f-yesRule').fill('The library notice confirms the quiz ran on the scheduled date.');
 await page.locator('#pr-f-noRule').fill('The library notice confirms it was moved or did not run.');
 await page.locator('#pr-f-voidRule').fill('No official library notice within 3 days of the date.');
 await page.locator('#pr-f-source').fill('School library noticeboard');
 await page.getByRole('button',{name:'Continue'}).click();
 await shot(page,'16-ask-review-390');
 await page.getByRole('button',{name:'Submit for review'}).click();await page.waitForSelector('text=Submitted for review');
}
// 6. Moderator approves it from the queue.
const mod=await ctx('pr_mod',{width:768,height:1024});
{const {page}=mod;
 await go(page,'#/predictions');const join=page.getByRole('button',{name:/Join and get/});if(await join.count()){await join.click();await page.waitForSelector('.pr-balance:not([hidden])');}
 await go(page,'#/predictions/review');await shot(page,'17-mod-queue-768');
 await page.locator('.pr-review-item').first().getByRole('button',{name:'Approve and fund'}).click();
 await page.waitForTimeout(1200);
 // Propose a result on the closed fixture (trading already closed).
 await go(page,'#/predictions?view=waiting');
 const closed=await page.locator('.pr-card-q a').first().getAttribute('href');
 await go(page,closed);
 await page.locator('#pr-propose-outcome').selectOption('yes');
 await page.locator('#pr-propose-ev').fill('The organiser announced an extra Saturday matinee on the ticketing page.');
 await page.locator('#pr-propose-src').fill('Organiser ticketing page');
 await page.getByRole('button',{name:'Propose result'}).click();await page.waitForTimeout(1200);
 await shot(page,'18-mod-proposed-768');
}
// 7. Bob challenges the proposal.
{const {page}=bob;
 await go(page,'#/predictions?view=waiting');
 const href=await page.locator('.pr-card-q a').first().getAttribute('href');await go(page,href);
 await page.locator('#pr-dispute').fill('The extra show is a private dress rehearsal, not a public performance.');
 await page.getByRole('button',{name:'Send challenge'}).click();await page.waitForTimeout(1200);
 await shot(page,'19-bob-disputed-1440');
 await go(page,'#/predictions/rankings');await shot(page,'20-rankings-1440');
}
// 8. Width sweep on explore and detail.
for(const [w,h] of [[320,700],[390,844],[768,1024],[1440,1000]]){
 const c=await ctx('pr_alice',{width:w,height:h},w<700);
 await go(c.page,'#/predictions');await shot(c.page,`21-explore-${w}`);
 const overflow=await c.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
 await go(c.page,marketHash);await shot(c.page,`22-detail-${w}`);
 const overflow2=await c.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
 note(`width ${w}: horizontal overflow explore=${overflow} detail=${overflow2}; errors=${c.errors.length?c.errors.join(' | '):'none'}`);
 await c.context.close();
}
note('alice errors:',alice.errors.join(' | ')||'none');note('bob errors:',bob.errors.join(' | ')||'none');note('mod errors:',mod.errors.join(' | ')||'none');
await browser.close();
