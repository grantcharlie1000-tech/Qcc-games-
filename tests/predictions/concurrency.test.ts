import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {REAL_PG,startDb,makeUser,enable,client,opKey,draft,reconcile,unfrozen,type TestDb,type User} from './db';
import {repairGrants,runGrantJob,transaction} from '../../src/predictions/server';

/**
 * Races that only a real PostgreSQL server can prove: separate connections, row locks, READ COMMITTED.
 * Run with QCC_TEST_PG_URL=postgres://postgres@127.0.0.1:55432/postgres (see docs/PREDICTIONS.md).
 */
describe.skipIf(!REAL_PG)('predictions concurrency (real PostgreSQL)',()=>{
 let t:TestDb,api:ReturnType<typeof client>,mod:User;let n=0;
 const user=async(prefix:string,weeks=0)=>{
  const u=await makeUser(t.pool,`${prefix}_${++n}`);await api.post('join',u,{});
  if(weeks){await t.pool.query(`UPDATE predictions_eligibility SET eligible_from=now()-($2*interval '7 days') WHERE account_id=$1`,[u.id,weeks]);await api.get('me',u);}
  return u;
 };
 const open=async()=>{
  const author=await user('author');
  const sub=await api.post('submit',author,draft());
  return sub.body.id as string;
 };
 const balance=async(u:User)=>Number((await t.pool.query('SELECT balance FROM predictions_wallets WHERE account_id=$1',[u.id])).rows[0].balance);
 const quote=async(u:User,marketId:string,side:'yes'|'no',amount:number)=>(await api.post('quote',u,{marketId,side,op:'buy',amount,toleranceBp:500})).body;
 beforeAll(async()=>{
  t=await startDb();api=client(t.db);await enable(t.pool);
  await t.pool.query('UPDATE predictions_config SET max_open_markets=1000');
  mod=await makeUser(t.pool,'race_mod');
  await t.pool.query(`INSERT INTO predictions_roles(account_id,role,granted_by) VALUES ($1,'moderator','test')`,[mod.id]);
 },60000);
 afterAll(async()=>{await t?.stop();});

 it('one wallet buying in two markets at once cannot overspend',async()=>{
  const u=await user('twomarkets');// exactly 10 credits
  const [a,b]=[await open(),await open()];
  const [qa,qb]=[await quote(u,a,'yes',7_000_000),await quote(u,b,'no',7_000_000)];
  const results=await Promise.all([
   api.post('execute',u,{marketId:a,quoteId:qa.id,operationKey:opKey()}),
   api.post('execute',u,{marketId:b,quoteId:qb.id,operationKey:opKey()}),
  ]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  expect(results.find(r=>r.status===409)!.body.error).toBe('insufficient_credits');
  expect(await balance(u)).toBe(3_000_000);
  expect(await reconcile(t.pool)).toMatchObject({unbalanced:0,walletMismatch:0,reserveMismatch:0,shareMismatch:0,insolvent:0});
 });
 it('the same operation key sent five times at once debits exactly once',async()=>{
  const u=await user('dupes'),m=await open();
  const q=await quote(u,m,'yes',2_000_000),key=opKey();
  const results=await Promise.all(Array.from({length:5},()=>api.post('execute',u,{marketId:m,quoteId:q.id,operationKey:key})));
  expect(results.every(r=>r.status===200)).toBe(true);
  expect(new Set(results.map(r=>r.body.receipt.id)).size).toBe(1);
  expect(results.filter(r=>!r.body.replayed).length).toBe(1);
  expect(await balance(u)).toBe(8_000_000);
  expect((await t.pool.query('SELECT count(*)::int AS n FROM predictions_trades WHERE account_id=$1',[u.id])).rows[0].n).toBe(1);
 });
 it('twelve wallets trading one market concurrently keep shares, reserve and sequence consistent',async()=>{
  const m=await open(),users=await Promise.all(Array.from({length:12},(_,i)=>user('crowd'+i)));
  const quotes=await Promise.all(users.map((u,i)=>quote(u,m,i%3?'yes':'no',1_500_000)));
  const results=await Promise.all(users.map((u,i)=>api.post('execute',u,{marketId:m,quoteId:quotes[i].id,operationKey:opKey()})));
  // Each executes or is refused for a moved price; nothing half-applies.
  for(const r of results)expect([200,409]).toContain(r.status);
  const ok=results.filter(r=>r.status===200).length;
  expect(ok).toBeGreaterThan(0);
  const seq=(await t.pool.query('SELECT array_agg(market_sequence ORDER BY market_sequence) AS s FROM predictions_trades WHERE market_id=$1',[m])).rows[0].s.map(Number);
  expect(seq).toEqual(Array.from({length:ok},(_,i)=>i+1));
  expect(await reconcile(t.pool)).toMatchObject({unbalanced:0,walletMismatch:0,reserveMismatch:0,shareMismatch:0,insolvent:0});
 });
 it('a trade racing the close time either commits before it or is refused',async()=>{
  const u=await user('closer',2),m=await open();
  const q=await quote(u,m,'yes',1_000_000);
  const [trade]=await Promise.all([
   api.post('execute',u,{marketId:m,quoteId:q.id,operationKey:opKey()}),
   unfrozen(t.pool,`UPDATE predictions_markets SET close_at=now(),resolve_at=now() WHERE id=$1`,[m]),
  ]);
  const committed=(await t.pool.query('SELECT count(*)::int AS n FROM predictions_trades WHERE market_id=$1',[m])).rows[0].n;
  expect(trade.status===200?1:0).toBe(committed);
  if(trade.status!==200)expect(trade.body.error).toBe('market_closed');
 });
 it('the scheduled job, two workers and lazy repairs grant each week once',async()=>{
  const users=await Promise.all(Array.from({length:6},(_,i)=>user('grantee'+i)));
  await t.pool.query(`UPDATE predictions_eligibility SET eligible_from=now()-interval '30 days' WHERE account_id=ANY($1::uuid[])`,[users.map(u=>u.id)]);
  await Promise.all([runGrantJob(t.db),runGrantJob(t.db),...users.map(u=>api.get('me',u)),...users.map(u=>transaction(t.db,q=>repairGrants(q,u.id)))]);
  const dupes=(await t.pool.query('SELECT account_id,week_start FROM predictions_grants GROUP BY 1,2 HAVING count(*)>1')).rows;
  expect(dupes).toEqual([]);
  for(const u of users){
   const weeks=(await t.pool.query('SELECT count(*)::int AS n FROM predictions_grants WHERE account_id=$1',[u.id])).rows[0].n;
   expect(await balance(u)).toBe(weeks*10_000_000);
   expect(weeks).toBeGreaterThanOrEqual(5);
  }
 });
 it('two submissions at once cannot exceed the open-question budget',async()=>{
  const open=(await t.pool.query(`SELECT count(*)::int AS n FROM predictions_markets WHERE state IN ('open','paused') AND NOT fixture`)).rows[0].n;
  await t.pool.query('UPDATE predictions_config SET max_open_markets=$1',[open+1]);
  const a=await user('budget_a'),b=await user('budget_b');
  const results=await Promise.all([api.post('submit',a,draft()),api.post('submit',b,draft())]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  await t.pool.query('UPDATE predictions_config SET max_open_markets=1000');
 });
 it('two moderators authorising at once settle exactly once',async()=>{
  const mod2=await makeUser(t.pool,'race_mod2');
  await t.pool.query(`INSERT INTO predictions_roles(account_id,role,granted_by) VALUES ($1,'moderator','test')`,[mod2.id]);
  const m=await open(),u=await user('holder');
  const q=await quote(u,m,'yes',3_000_000);
  const bought=await api.post('execute',u,{marketId:m,quoteId:q.id,operationKey:opKey()});
  await unfrozen(t.pool,`UPDATE predictions_markets SET close_at=now()-interval '1 second',resolve_at=now() WHERE id=$1`,[m]);
  const before=await balance(u);
  const note='Official result posted on the noticeboard.';
  const results=await Promise.all([api.post('authorise',mod,{marketId:m,outcome:'yes',note}),api.post('authorise',mod2,{marketId:m,outcome:'yes',note})]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  expect(await balance(u)).toBe(before+bought.body.receipt.shares);
  expect((await t.pool.query(`SELECT count(*)::int AS n FROM predictions_journal WHERE market_id=$1 AND kind='payout'`,[m])).rows[0].n).toBe(1);
  expect(await reconcile(t.pool)).toMatchObject({unbalanced:0,walletMismatch:0,reserveMismatch:0});
 });
});
