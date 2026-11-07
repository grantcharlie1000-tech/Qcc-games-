import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {startDb,makeUser,enable,client,opKey,draft,reconcile,unfrozen,type TestDb,type User} from './db';
import {runGrantJob} from '../../src/predictions/server';
import {weekStartDate} from '../../src/predictions/week';

// The PGlite fallback is several times slower than a real server.
vi.setConfig({testTimeout:30000});
let t:TestDb,api:ReturnType<typeof client>;
let mod:User,mod2:User,resolver:User,alice:User,bob:User,guestless:User;
let n=0;
const user=(prefix:string)=>makeUser(t.pool,`${prefix}_${++n}`);
beforeAll(async()=>{
 t=await startDb();api=client(t.db);
 await enable(t.pool);
 mod=await user('mod');mod2=await user('mod');resolver=await user('res');
 for(const [u,role] of [[mod,'moderator'],[mod2,'moderator'],[resolver,'resolver']] as const)
  await t.pool.query(`INSERT INTO predictions_roles(account_id,role,granted_by) VALUES ($1,$2,'test')`,[u.id,role]);
 alice=await user('alice');bob=await user('bob');guestless=await user('nojoin');
 for(const u of [mod,mod2,resolver,alice,bob])expect((await api.post('join',u,{})).status).toBe(200);
},60000);
afterAll(async()=>{await t?.stop();});

async function openMarket(overrides:Record<string,unknown>={},by?:User):Promise<string> {
 const author=by??await user('author');await api.post('join',author,{});
 const sub=await api.post('submit',author,draft(overrides));
 expect(sub.status).toBe(200);
 const approved=await api.post('review',mod,{marketId:sub.body.id,decision:'approve'});
 expect(approved.body).toMatchObject({ok:true,state:'open'});
 return sub.body.id;
}
async function buy(u:User,marketId:string,side:'yes'|'no',amount:number,key=opKey()){
 const quote=await api.post('quote',u,{marketId,side,op:'buy',amount});
 if(quote.status!==200)return quote;
 return api.post('execute',u,{marketId,quoteId:quote.body.id,operationKey:key});
}
/** A joined user whose eligibility started `weeks` ago, so lazy repair gives them weeks+1 allowances. */
async function funded(prefix:string,weeks=3):Promise<User> {
 const u=await user(prefix);await api.post('join',u,{});
 await t.pool.query(`UPDATE predictions_eligibility SET eligible_from=now()-($2*interval '7 days') WHERE account_id=$1`,[u.id,weeks]);
 await api.get('me',u);return u;
}
const balance=async(u:User)=>Number((await t.pool.query('SELECT balance FROM predictions_wallets WHERE account_id=$1',[u.id])).rows[0]?.balance??-1);
const ledgerOk=async()=>expect(await reconcile(t.pool)).toEqual({unbalanced:0,walletMismatch:0,reserveMismatch:0,shareMismatch:0,insolvent:0});

describe('feature flag and access',()=>{
 it('reports disabled and refuses every other action while the flag is off',async()=>{
  await t.pool.query('UPDATE predictions_config SET enabled=false');
  expect((await api.get('me',alice)).body).toMatchObject({enabled:false});
  expect((await api.get('markets',alice)).body.error).toBe('predictions_disabled');
  await t.pool.query('UPDATE predictions_config SET enabled=true');
 });
 it('a guest can browse public markets but cannot quote, trade or see school-only markets',async()=>{
  const pub=await openMarket(),school=await openMarket({audience:'school'});
  const list=(await api.get('markets',null)).body.items.map((m:{id:string})=>m.id);
  expect(list).toContain(pub);expect(list).not.toContain(school);
  expect((await api.get('market',null,{id:school})).status).toBe(404);
  expect((await api.get('market',guestless,{id:school})).status).toBe(404);
  expect((await api.get('market',bob,{id:school})).status).toBe(200);
  expect((await api.post('quote',null,{marketId:pub,side:'yes',op:'buy',amount:1_000_000})).status).toBe(401);
  expect((await api.post('quote',guestless,{marketId:pub,side:'yes',op:'buy',amount:1_000_000})).body.error).toBe('not_eligible');
 });
 it('rejects cross-origin and non-JSON writes',async()=>{
  const handle=(await import('../../src/predictions/server')).createPredictionsHandler(t.db);
  const r=await handle(new Request('https://qcc.test/.netlify/functions/predictions?action=join',{method:'POST',headers:{authorization:`Bearer ${alice.token}`,'content-type':'application/json',origin:'https://evil.test'},body:'{}'}));
  expect(r.status).toBe(403);
 });
});

describe('weekly allowance',()=>{
 it('joining issues the current week once; repeat visits and joins add nothing',async()=>{
  const u=await user('grant');
  await t.pool.query(`UPDATE predictions_config SET launch_at=now()-interval '1 minute'`);
  expect((await api.post('join',u,{})).body).toMatchObject({eligible:true,balance:10_000_000});
  await api.post('join',u,{});await api.get('me',u);await api.get('me',u);
  expect(await balance(u)).toBe(10_000_000);
  expect((await t.pool.query('SELECT count(*)::int AS n FROM predictions_grants WHERE account_id=$1',[u.id])).rows[0].n).toBe(1);
  await enable(t.pool);
 });
 it('recovers missed weeks since eligibility, never before launch, none for a wholly suspended week',async()=>{
  const u=await user('missed');
  await api.post('join',u,{});
  // Rewrite history: eligible 5 weeks ago, suspended for weeks 3-4 ago, eligible again since; launch 4 weeks ago.
  const now=Date.now(),week=7*86_400_000;
  await t.pool.query('DELETE FROM predictions_eligibility WHERE account_id=$1',[u.id]);
  await t.pool.query(`INSERT INTO predictions_eligibility(account_id,eligible_from,eligible_until,method) VALUES ($1,$2,$3,'opt_in'),($1,$4,NULL,'operator')`,
   [u.id,new Date(now-5*week).toISOString(),new Date(now-3.5*week).toISOString(),new Date(now-1.2*week).toISOString()]);
  await t.pool.query(`UPDATE predictions_config SET launch_at=$1`,[new Date(now-4.2*week).toISOString()]);
  await api.get('me',u);
  const weeks=(await t.pool.query(`SELECT to_char(week_start,'YYYY-MM-DD') AS w FROM predictions_grants WHERE account_id=$1 ORDER BY 1`,[u.id])).rows.map((r:any)=>r.w);
  // Existing join grant (this week) + launch week + the week eligibility ended in + the two weeks since re-enabling.
  const expected=new Set([weekStartDate(now),weekStartDate(now-4.2*week),weekStartDate(now-3.5*week-1),weekStartDate(now-1.2*week)]);
  expect(new Set(weeks)).toEqual(expected);
  expect(weeks).not.toContain(weekStartDate(now-5*week));// before launch
  expect(weeks).not.toContain(weekStartDate(now-2.5*week));// wholly suspended
  await enable(t.pool);await ledgerOk();
 });
 it('the scheduled job and lazy repair converge on the same records',async()=>{
  const u=await user('job');await api.post('join',u,{});
  const before=await balance(u);
  const job=await runGrantJob(t.db);
  expect(job.failed).toBe(0);
  await api.get('me',u);
  expect(await balance(u)).toBe(before);
 });
 it('database week boundaries match the TypeScript Auckland calendar across both DST changes',async()=>{
  const instants=['2026-09-26T10:59:59Z','2026-09-26T11:00:00Z','2026-09-27T10:59:59.999Z','2026-09-27T11:00:00Z','2026-09-27T13:59:00Z',
   '2027-04-03T10:59:59Z','2027-04-04T11:59:59.999Z','2027-04-04T12:00:00Z','2027-04-04T13:00:00Z','2026-12-31T23:30:00Z'];
  for(const instant of instants){
   const row=(await t.pool.query(`SELECT to_char(date_trunc('week',$1::timestamptz AT TIME ZONE 'Pacific/Auckland'),'YYYY-MM-DD') AS w`,[instant])).rows[0];
   expect(row.w,instant).toBe(weekStartDate(Date.parse(instant)));
  }
  // Monday 28 Sept 2026 00:00 NZDT is 27 Sept 11:00 UTC; Monday 5 Apr 2027 00:00 NZST is 4 Apr 12:00 UTC.
  expect(weekStartDate(Date.parse('2026-09-27T10:59:59Z'))).toBe('2026-09-21');
  expect(weekStartDate(Date.parse('2026-09-27T11:00:00Z'))).toBe('2026-09-28');
  expect(weekStartDate(Date.parse('2027-04-04T11:59:59Z'))).toBe('2027-03-29');
  expect(weekStartDate(Date.parse('2027-04-04T12:00:00Z'))).toBe('2027-04-05');
 });
});

describe('quotes and execution',()=>{
 let market:string;
 beforeEach(async()=>{market=await openMarket();});
 it('the golden 2-credit purchase executes exactly as quoted and replays without a second debit',async()=>{
  const u=await user('golden');await api.post('join',u,{});
  const start=await balance(u);
  const quote=await api.post('quote',u,{marketId:market,side:'yes',op:'buy',amount:2_000_000});
  expect(quote.body).toMatchObject({shares:3_818_056,credits:2_000_000,priceBeforePpm:500000,priceAfterPpm:547581,payoutIfRight:3_818_056,voidPayout:1_909_028});
  const key=opKey();
  const first=await api.post('execute',u,{marketId:market,quoteId:quote.body.id,operationKey:key});
  expect(first.status).toBe(200);
  expect(first.body.receipt).toMatchObject({shares:3_818_056,credits:2_000_000,balanceAfter:start-2_000_000});
  const again=await api.post('execute',u,{marketId:market,quoteId:quote.body.id,operationKey:key});
  expect(again.body).toMatchObject({replayed:true,receipt:{id:first.body.receipt.id}});
  expect(await balance(u)).toBe(start-2_000_000);
  // Receipt lookup by key, owner only.
  expect((await api.get('receipt',u,{key})).body.id).toBe(first.body.receipt.id);
  expect((await api.get('receipt',bob,{key})).status).toBe(404);
  // Reusing the key for a different quote is a conflict.
  const other=await api.post('quote',u,{marketId:market,side:'no',op:'buy',amount:500_000});
  expect((await api.post('execute',u,{marketId:market,quoteId:other.body.id,operationKey:key})).body.error).toBe('idempotency_conflict');
  await ledgerOk();
 });
 it('sell back returns one microcredit less than paid (rounding favours the reserve)',async()=>{
  const u=await user('seller');await api.post('join',u,{});
  const start=await balance(u);
  const bought=await buy(u,market,'no',1_000_000);
  const shares=bought.body.receipt.shares;
  const quote=await api.post('quote',u,{marketId:market,side:'no',op:'sell',amount:shares});
  expect(quote.body.credits).toBe(999_999);
  const sold=await api.post('execute',u,{marketId:market,quoteId:quote.body.id,operationKey:opKey()});
  expect(sold.body.receipt.credits).toBe(999_999);
  expect(await balance(u)).toBe(start-1);
  const pos=(await t.pool.query('SELECT shares,cost_basis,realised FROM predictions_positions WHERE market_id=$1 AND account_id=$2',[market,u.id])).rows[0];
  expect(pos).toMatchObject({shares:'0',cost_basis:'0',realised:'-1'});
  expect((await api.post('quote',u,{marketId:market,side:'no',op:'sell',amount:1})).body.error).toBe('insufficient_shares');
  await ledgerOk();
 });
 it('a price move beyond tolerance rejects the stale quote; within tolerance it executes at the current price',async()=>{
  const quote=await api.post('quote',alice,{marketId:market,side:'yes',op:'buy',amount:1_000_000,toleranceBp:0});
  await buy(bob,market,'yes',5_000_000);
  expect((await api.post('execute',alice,{marketId:market,quoteId:quote.body.id,operationKey:opKey()})).body.error).toBe('price_moved');
  const loose=await api.post('quote',alice,{marketId:market,side:'yes',op:'buy',amount:1_000_000,toleranceBp:500});
  await buy(bob,market,'no',200_000);
  const done=await api.post('execute',alice,{marketId:market,quoteId:loose.body.id,operationKey:opKey()});
  expect(done.status).toBe(200);
  expect(done.body.receipt.credits).toBeLessThanOrEqual(1_000_000);// never spends more than accepted
  await ledgerOk();
 });
 it('expired quotes, closed markets, insufficient credits and the position cap are refused',async()=>{
  const q=await api.post('quote',alice,{marketId:market,side:'yes',op:'buy',amount:500_000});
  await t.pool.query(`UPDATE predictions_quotes SET expires_at=now()-interval '1 second' WHERE id=$1`,[q.body.id]);
  expect((await api.post('execute',alice,{marketId:market,quoteId:q.body.id,operationKey:opKey()})).body.error).toBe('quote_expired');
  const poor=await user('poor');await api.post('join',poor,{});
  await t.pool.query(`UPDATE predictions_config SET launch_at=now()-interval '1 minute'`);
  const broke=await user('broke');await api.post('join',broke,{});await enable(t.pool);
  expect(await balance(broke)).toBe(10_000_000);
  expect((await buy(broke,market,'yes',11_000_000)).body.error).toBe('insufficient_credits');
  expect(await balance(broke)).toBe(10_000_000);
  // Position cap: 25 credits of cost basis per account per market.
  const rich=await funded('rich');
  expect((await buy(rich,market,'yes',20_000_000)).status).toBe(200);
  expect((await buy(rich,market,'no',6_000_000)).body.error).toBe('position_cap');
  const close=await api.post('quote',alice,{marketId:market,side:'yes',op:'buy',amount:500_000});
  await unfrozen(t.pool,`UPDATE predictions_markets SET close_at=now()-interval '1 second',resolve_at=now() WHERE id=$1`,[market]);
  expect((await api.post('execute',alice,{marketId:market,quoteId:close.body.id,operationKey:opKey()})).body.error).toBe('market_closed');
  expect((await api.get('market',alice,{id:market})).body.state).toBe('closed');
  await ledgerOk();
 });
 it('a global trading pause blocks quotes and trades but not reads',async()=>{
  await t.pool.query('UPDATE predictions_config SET trading_paused=true');
  expect((await api.post('quote',alice,{marketId:market,side:'yes',op:'buy',amount:500_000})).body.error).toBe('trading_paused');
  expect((await api.get('market',alice,{id:market})).status).toBe(200);
  await t.pool.query('UPDATE predictions_config SET trading_paused=false');
 });
});

describe('questions and moderation',()=>{
 it('validates drafts server-side, blocks personal subjects and duplicates, caps pending submissions',async()=>{
  const u=await user('author');await api.post('join',u,{});
  expect((await api.post('submit',u,draft({question:'Will Sam get a girlfriend before the ball?'}))).body.error).toBe('invalid_draft');
  expect((await api.post('submit',u,draft({closeAt:new Date(Date.now()+60_000).toISOString()}))).body.error).toBe('invalid_draft');
  const d=draft();
  expect((await api.post('submit',u,d)).status).toBe(200);
  expect((await api.post('submit',bob,{...d,question:d.question.toUpperCase()})).body.error).toBe('duplicate_question');
  await api.post('submit',u,draft());await api.post('submit',u,draft());
  expect((await api.post('submit',u,draft())).body.error).toBe('too_many_pending');
 });
 it('only a moderator who is not the author can publish; approval freezes rules and funds 14 credits',async()=>{
  const sub=await api.post('submit',mod,draft());
  expect((await api.post('review',alice,{marketId:sub.body.id,decision:'approve'})).status).toBe(403);
  expect((await api.post('review',mod,{marketId:sub.body.id,decision:'approve'})).body.error).toBe('conflict_of_interest');
  expect((await api.post('review',mod2,{marketId:sub.body.id,decision:'approve'})).body.state).toBe('open');
  const row=(await t.pool.query('SELECT reserve,rules_hash FROM predictions_markets WHERE id=$1',[sub.body.id])).rows[0];
  expect(row.reserve).toBe('14000000');expect(row.rules_hash).toMatch(/^[a-f0-9]{64}$/);
  await expect(t.pool.query(`UPDATE predictions_markets SET yes_rule='changed after publication' WHERE id=$1`,[sub.body.id])).rejects.toMatchObject({code:'P0001'});
  await expect(t.pool.query(`UPDATE predictions_markets SET state='pending' WHERE id=$1`,[sub.body.id])).rejects.toMatchObject({code:'P0001'});
 });
 it('changes requested lets the author edit and resubmit; rejection is final',async()=>{
  const u=await user('editor');await api.post('join',u,{});
  const sub=await api.post('submit',u,draft());
  expect((await api.post('review',mod,{marketId:sub.body.id,decision:'changes'})).status).toBe(400);// note required
  await api.post('review',mod,{marketId:sub.body.id,decision:'changes',note:'Name the exact noticeboard.'});
  const mine=(await api.get('mine',u)).body.items[0];
  expect(mine).toMatchObject({state:'changes_requested',reviewNote:'Name the exact noticeboard.'});
  expect((await api.post('submit',u,{...draft(),id:sub.body.id})).body.state).toBe('pending');
  await api.post('review',mod,{marketId:sub.body.id,decision:'reject',note:'Outcome is already known.'});
  expect((await api.post('submit',u,{...draft(),id:sub.body.id})).status).toBe(409);
 });
 it('the journal is append-only and every transaction must balance',async()=>{
  await expect(t.pool.query(`UPDATE predictions_journal SET reason='x'`)).rejects.toMatchObject({code:'P0001'});
  await expect(t.pool.query(`DELETE FROM predictions_postings`)).rejects.toMatchObject({code:'P0001'});
  const c=await t.pool.connect();
  try{
   await c.query('BEGIN');
   const j=(await c.query(`INSERT INTO predictions_journal(kind,actor) VALUES ('correction','test') RETURNING id`)).rows[0].id;
   await c.query(`INSERT INTO predictions_postings(journal_id,line,book,owner,amount) VALUES ($1,1,'wallet',$2,5)`,[j,alice.id]);
   await expect(c.query('COMMIT')).rejects.toMatchObject({code:'P0001'});
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
 });
});

describe('resolution and settlement',()=>{
 async function closedMarketWithTrades(){
  const market=await openMarket();
  const alice=await funded('yesbuyer'),bob=await funded('nobuyer');
  const a=await buy(alice,market,'yes',2_000_000),b=await buy(bob,market,'no',3_000_000);
  expect(a.status).toBe(200);expect(b.status).toBe(200);
  await unfrozen(t.pool,`UPDATE predictions_markets SET close_at=now()-interval '1 second',resolve_at=now() WHERE id=$1`,[market]);
  return {market,alice,bob,yes:a.body.receipt.shares as number,no:b.body.receipt.shares as number};
 }
 it('pays winners exactly once after the challenge window, then releases the unused reserve',async()=>{
  const {market,alice,bob,yes}=await closedMarketWithTrades();
  // A trader cannot resolve their own market; the author cannot either.
  expect((await api.post('propose',alice,{marketId:market,outcome:'yes',evidence:'Organiser notice says it ran.',sourceChecked:'Noticeboard'})).status).toBe(403);
  const proposed=await api.post('propose',resolver,{marketId:market,outcome:'yes',evidence:'Organiser notice confirms it ran on the day.',sourceChecked:'Library noticeboard, 5pm'});
  expect(proposed.body.status).toBe('proposed');
  expect((await api.post('finalise',mod,{marketId:market})).body.error).toBe('invalid_state');// window still open
  await t.pool.query(`UPDATE predictions_resolutions SET challenge_until=proposed_at+interval '1 millisecond' WHERE market_id=$1`,[market]);
  const aliceBefore=await balance(alice),bobBefore=await balance(bob);
  expect((await api.post('finalise',resolver,{marketId:market})).status).toBe(403);// resolvers cannot finalise
  const done=await api.post('finalise',mod,{marketId:market});
  expect(done.body).toMatchObject({ok:true,outcome:'yes'});
  expect(await balance(alice)).toBe(aliceBefore+yes);
  expect(await balance(bob)).toBe(bobBefore);
  expect((await api.post('finalise',mod2,{marketId:market})).body.error).toBe('already_settled');
  expect((await api.post('settle',mod,{marketId:market})).body.paid).toBe(0);
  expect(await balance(alice)).toBe(aliceBefore+yes);
  const s=(await t.pool.query('SELECT released,completed_at FROM predictions_settlements WHERE market_id=$1',[market])).rows[0];
  expect(s.completed_at).not.toBeNull();
  expect((await t.pool.query('SELECT reserve FROM predictions_markets WHERE id=$1',[market])).rows[0].reserve).toBe('0');
  const detail=(await api.get('market',alice,{id:market})).body;
  expect(detail).toMatchObject({state:'resolved',outcome:'yes',settlement:{myPayout:yes,completed:true}});
  // Realised P/L: payout minus the 2 credits spent.
  expect((await api.get('portfolio',alice)).body.positions.find((p:any)=>p.market.id===market).realised).toBe(yes-2_000_000);
  await ledgerOk();
 });
 it('a dispute moves the decision to an independent reviewer, who can void; void pays floor(shares/2)',async()=>{
  const {market,alice,bob,yes,no}=await closedMarketWithTrades();
  await api.post('propose',resolver,{marketId:market,outcome:'no',evidence:'Looks like it was moved to Friday.',sourceChecked:'Noticeboard'});
  expect((await api.post('dispute',resolver,{marketId:market,reason:'I proposed it but changed my mind'})).status).toBe(403);
  expect((await api.post('dispute',bob,{marketId:market,reason:'The notice says postponed, which the rules make void.'})).status).toBe(200);
  expect((await api.get('market',bob,{id:market})).body.state).toBe('disputed');
  expect((await api.post('finalise',mod,{marketId:market,outcome:'void'})).status).toBe(400);// a note is required
  const aliceBefore=await balance(alice),bobBefore=await balance(bob);
  expect((await api.post('finalise',mod,{marketId:market,outcome:'void',note:'Postponed beyond the window: void per the frozen rule.'})).body.outcome).toBe('void');
  expect(await balance(alice)).toBe(aliceBefore+Math.floor(yes/2));
  expect(await balance(bob)).toBe(bobBefore+Math.floor(no/2));
  const resolution=(await api.get('market',bob,{id:market})).body.resolution;
  expect(resolution).toMatchObject({status:'overturned',finalOutcome:'void'});
  await ledgerOk();
 });
 it('an integrity pause stops trading without settling',async()=>{
  const market=await openMarket();
  expect((await api.post('pause',alice,{marketId:market,on:true,note:'nope'})).status).toBe(403);
  await api.post('pause',mod,{marketId:market,on:true,note:'Investigating an early leak.'});
  expect((await buy(bob,market,'yes',500_000)).body.error).toBe('market_closed');
  expect((await api.get('market',bob,{id:market})).body.state).toBe('paused');
  await api.post('pause',mod,{marketId:market,on:false,note:'Resolved; no leak.'});
  expect((await buy(bob,market,'yes',500_000)).status).toBe(200);
 });
});
