/**
 * Predictions API: same-origin `/.netlify/functions/predictions?action=…`.
 *
 * The server and database are the only authority for credits. The browser sends intentions (quote this, execute
 * that quote under this operation key); it never sends a balance, a price it computed, or a share count it chose.
 *
 * Lock order, used by every writer so concurrent operations cannot deadlock each other:
 *   1. markets, ascending id   2. wallets, ascending account id   3. positions
 * Grants lock only a wallet. Trades lock their market, then the wallet. Authorising a result locks its market, then
 * the holders' wallets in id order. Serialisation/deadlock failures are retried with the same operation key.
 */
import {createHash,randomUUID} from 'node:crypto';
import type {Database} from '../leaderboard/server';
import {resolveAccount,type Account} from '../accounts/server';
import {writeFrozen,readOnlyResponse} from '../accounts/write-freeze';
import {HttpError,respond,readJson,sameOrigin,rateLimit,errorResponse} from '../../server/api';
import {buyForBudget,sellShares,voidPayout,pricePpm,type MakerState} from './lmsr';
import {
 AUTHOR_OPEN_MAX,CATEGORIES,DEFAULT_TOLERANCE_BP,MAX_TOLERANCE_BP,POSITION_CAP,PRICING_VERSION,QUOTE_TTL_SECONDS,TRADE_MAX,TRADE_MIN,REPORT_REASONS,
 canonicalRules,isGlobal,parseLink,validateDraft,type ActivityItem,type AuthoriseItem,type Dashboard,type DraftInput,type EvidenceItem,type Exposure,type HistoryPoint,
 type LedgerRow,type MarketDetail,type MarketRules,type MarketState,type MarketSummary,type Me,type Outcome,type PayoutRecord,type Portfolio,type Position,type Quote,
 type RankingRow,type Receipt,type Resolution,type Settlement,type Side,type Operation,type StoredState,type Submission,
} from './shared';

type Query=Database['query'];
type Row=Record<string,any>;
const BODY_LIMIT=8*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{16,64}$/;
const ts=(column:string)=>`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const bad=(message='Invalid request.')=>new HttpError(400,'invalid_request',message);
const fail=(status:number,code:string,message='')=>new HttpError(status,code,message||code);
const notFound=()=>fail(404,'not_found',"This question doesn't exist or isn't visible to you.");
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const big=(value:unknown)=>BigInt(value as string|number);
const num=(value:unknown)=>Number(value);
const isObject=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const id=(value:unknown):string=>{if(typeof value!=='string'||!UUID.test(value))throw notFound();return value.toLowerCase();};
const text=(value:unknown,min:number,max:number,label:string):string=>{
 if(typeof value!=='string')throw bad(`${label} is required.`);
 const trimmed=value.trim(),n=[...trimmed].length;
 if(n<min||n>max)throw bad(`${label} must be ${min} to ${max} characters.`);
 return trimmed;
};
const RETRYABLE=new Set(['40001','40P01']);

interface Config {enabled:boolean;tradingPaused:boolean;launched:boolean;showFixtures:boolean;weeklyGrant:bigint;reserve:bigint;b:bigint;maxOpen:number}
async function config(query:Query):Promise<Config> {
 const row=(await query(`SELECT enabled,trading_paused,launch_at IS NOT NULL AND launch_at<=now() AS launched,show_fixtures,weekly_grant,market_reserve,liquidity_b,max_open_markets FROM predictions_config WHERE id`)).rows[0];
 if(!row)throw new Error('Predictions config missing');
 return {enabled:row.enabled,tradingPaused:row.trading_paused,launched:!!row.launched,showFixtures:row.show_fixtures,weeklyGrant:big(row.weekly_grant),
  reserve:big(row.market_reserve),b:big(row.liquidity_b),maxOpen:num(row.max_open_markets)};
}

/** Runs `work` in one transaction; retries serialisation failures and deadlocks (same inputs, same keys). */
export async function transaction<T>(db:Database,work:(query:Query)=>Promise<T>):Promise<T> {
 for(let attempt=0;;attempt++){
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   const result=await work(client.query.bind(client) as Query);
   await client.query('COMMIT');return result;
  }catch(error){
   await client.query('ROLLBACK').catch(()=>{});
   if(attempt<4&&RETRYABLE.has((error as {code?:string})?.code??''))continue;
   throw error;
  }finally{client.release();}
 }
}

// ---- Ledger ----
interface PostingLine {book:'issuance'|'treasury'|'wallet'|'reserve';owner:string|null;amount:bigint}
/** Appends one balanced journal transaction. The posting trigger updates wallet and reserve caches and enforces >= 0. */
export async function post(query:Query,entry:{kind:string;accountId:string|null;marketId:string|null;actor:string;reason:string},lines:PostingLine[]):Promise<number> {
 const live=lines.filter(line=>line.amount!==0n);
 if(live.reduce((sum,line)=>sum+line.amount,0n)!==0n)throw new Error('Unbalanced journal');
 const journal=(await query('INSERT INTO predictions_journal(kind,account_id,market_id,actor,reason) VALUES ($1,$2,$3,$4,$5) RETURNING id',
  [entry.kind,entry.accountId,entry.marketId,entry.actor,entry.reason])).rows[0].id;
 for(const [index,line] of live.entries())
  await query('INSERT INTO predictions_postings(journal_id,line,book,owner,amount) VALUES ($1,$2,$3,$4,$5)',[journal,index+1,line.book,line.owner,line.amount.toString()]);
 return num(journal);
}
async function audit(query:Query,actor:Account|null,action:string,marketId:string|null,note=''){
 await query('INSERT INTO predictions_audit(actor_id,actor,action,market_id,note) VALUES ($1,$2,$3,$4,$5)',[actor?.id??null,actor?.username??'system',action,marketId,note.slice(0,1000)]);
}
async function outbox(query:Query,eventKey:string,kind:string,marketId:string|null,accountId:string|null,payload:Record<string,unknown>={}){
 await query('INSERT INTO predictions_outbox(event_key,kind,market_id,account_id,payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_key) DO NOTHING',[eventKey,kind,marketId,accountId,JSON.stringify(payload)]);
}

// ---- Eligibility and weekly grants ----
async function isEligible(query:Query,accountId:string):Promise<boolean> {
 return (await query('SELECT 1 FROM predictions_eligibility WHERE account_id=$1 AND eligible_from<=now() AND eligible_until IS NULL',[accountId])).rows.length>0;
}
/**
 * The one idempotent grant operation, shared by the scheduled job and the lazy repair on wallet reads and trades.
 * Locks the wallet, then issues every missing allowance for Auckland weeks that overlap an eligibility interval,
 * starting no earlier than launch. A week partly eligible gets one allowance; a wholly ineligible week gets none.
 * UNIQUE(account_id, week_start) is the final guard against a second grant.
 */
export async function repairGrants(query:Query,accountId:string):Promise<number> {
 const wallet=await query('SELECT account_id FROM predictions_wallets WHERE account_id=$1 FOR UPDATE',[accountId]);
 if(!wallet.rows.length)return 0;
 const weeks=(await query(`WITH cfg AS (SELECT launch_at,weekly_grant FROM predictions_config WHERE id),
  spans AS (
   SELECT greatest(e.eligible_from,cfg.launch_at) AS lo,least(COALESCE(e.eligible_until-interval '1 microsecond',now()),now()) AS hi
   FROM predictions_eligibility e,cfg WHERE e.account_id=$1 AND cfg.launch_at IS NOT NULL
  ),
  weeks AS (
   SELECT DISTINCT w::date AS week_start FROM spans,
   generate_series(date_trunc('week',lo AT TIME ZONE 'Pacific/Auckland'),date_trunc('week',hi AT TIME ZONE 'Pacific/Auckland'),interval '7 days') AS w
   WHERE lo<=hi
  )
  SELECT to_char(week_start,'YYYY-MM-DD') AS week_start,(SELECT weekly_grant FROM cfg) AS amount FROM weeks
  WHERE NOT EXISTS(SELECT 1 FROM predictions_grants g WHERE g.account_id=$1 AND g.week_start=weeks.week_start) ORDER BY 1`,[accountId])).rows;
 for(const week of weeks){
  const amount=big(week.amount);
  const journal=await post(query,{kind:'grant',accountId,marketId:null,actor:'system',reason:`Weekly allowance for the week of ${week.week_start}`},
   [{book:'issuance',owner:null,amount:-amount},{book:'wallet',owner:accountId,amount}]);
  await query('INSERT INTO predictions_grants(account_id,week_start,amount,journal_id) VALUES ($1,$2,$3,$4)',[accountId,week.week_start,amount.toString(),journal]);
  await outbox(query,`grant:${accountId}:${week.week_start}`,'grant',null,accountId,{week:week.week_start});
 }
 return weeks.length;
}
/** Scheduled job: one short transaction per eligible account, so one failure never blocks the rest. */
export async function runGrantJob(db:Database):Promise<{accounts:number;grants:number;failed:number}> {
 const cfg=await config(db.query);
 if(!cfg.enabled||!cfg.launched||await writeFrozen(db))return {accounts:0,grants:0,failed:0};
 const accounts=(await db.query('SELECT DISTINCT e.account_id FROM predictions_eligibility e JOIN predictions_wallets w ON w.account_id=e.account_id ORDER BY 1')).rows;
 let grants=0,failed=0;
 for(const row of accounts){
  try{grants+=await transaction(db,query=>repairGrants(query,row.account_id));}catch{failed++;}
 }
 return {accounts:accounts.length,grants,failed};
}

// ---- Market reading ----
const MARKET_COLUMNS=`m.id,m.question,m.category,m.audience,m.state,m.fixture,m.outcome,m.q_yes,m.q_no,m.liquidity_b,m.reserve,m.version,m.rules_hash,
 m.yes_rule,m.no_rule,m.void_rule,m.source,m.source_fallback,m.disclosure,m.author_id,
 ${ts('m.close_at')} AS close_at,${ts('m.resolve_at')} AS resolve_at,${ts('m.published_at')} AS published_at,${ts('m.created_at')} AS created_at,
 m.close_at<=clock_timestamp() AS past_close,
 (SELECT count(DISTINCT t.account_id)::int FROM predictions_trades t WHERE t.market_id=m.id) AS traders,
 (SELECT count(*)::int FROM predictions_trades t WHERE t.market_id=m.id) AS trades`;
/** Audience predicate: school-only markets need a currently eligible member; fixtures only when configured. */
const visibleTo=(viewer:string)=>`(m.audience='public' OR EXISTS(SELECT 1 FROM predictions_eligibility ve WHERE ve.account_id=${viewer} AND ve.eligible_from<=now() AND ve.eligible_until IS NULL))
 AND (NOT m.fixture OR (SELECT show_fixtures FROM predictions_config WHERE id))`;
function stateOf(row:Row):MarketState {return row.state==='open'&&row.past_close?'closed':row.state as StoredState;}
const maker=(row:Row):MakerState=>({qYes:big(row.q_yes),qNo:big(row.q_no),b:big(row.liquidity_b)});
function summary(row:Row):MarketSummary {
 return {id:row.id,question:row.question,category:row.category,audience:row.audience,state:stateOf(row),closeAt:row.close_at,resolveAt:row.resolve_at,
  publishedAt:row.published_at??null,yesPpm:pricePpm(maker(row)),traders:num(row.traders),trades:num(row.trades),fixture:!!row.fixture,outcome:row.outcome??null};
}
function rulesOf(row:Row):MarketRules {
 return {question:row.question,category:row.category,audience:row.audience,yesRule:row.yes_rule,noRule:row.no_rule,voidRule:row.void_rule,
  source:row.source,sourceFallback:row.source_fallback,disclosure:row.disclosure,closeAt:row.close_at,resolveAt:row.resolve_at};
}
function resolutionOf(row:Row|undefined):Resolution|null {
 if(!row)return null;
 return {id:row.id,outcome:row.outcome,note:row.note,link:row.link??null,authorisedAt:row.authorised_at};
}
const RESOLUTION_COLUMNS=`r.id,r.outcome,r.note,r.link,${ts('r.authorised_at')} AS authorised_at`;

async function roles(query:Query,accountId:string):Promise<'moderator'[]> {
 return (await query('SELECT role FROM predictions_roles WHERE account_id=$1 ORDER BY role',[accountId])).rows.map(row=>row.role);
}
/** True when the account created the market or has ever traded it: it may not authorise its result. */
async function conflicted(query:Query,marketId:string,accountId:string):Promise<boolean> {
 const row=(await query(`SELECT EXISTS(SELECT 1 FROM predictions_markets WHERE id=$1 AND author_id=$2)
  OR EXISTS(SELECT 1 FROM predictions_trades WHERE market_id=$1 AND account_id=$2) AS conflicted`,[marketId,accountId])).rows[0];
 return !!row.conflicted;
}
function canonicalHash(row:Row):string {return sha(canonicalRules(rulesOf(row)));}

// ---- Quotes ----
interface Computed {shares:bigint;credits:bigint;after:MakerState}
function compute(state:MakerState,side:Side,op:Operation,amount:bigint):Computed {
 if(op==='buy'){const buy=buyForBudget(state,side,amount);return {shares:buy.shares,credits:buy.debit,after:buy.after};}
 const sell=sellShares(state,side,amount);return {shares:amount,credits:sell.proceeds,after:sell.after};
}
const minOut=(expected:bigint,toleranceBp:number)=>expected*BigInt(10_000-toleranceBp)/10_000n;

export function createPredictionsHandler(db:Database):(request:Request)=>Promise<Response> {
 const tx=<T>(work:(query:Query)=>Promise<T>)=>transaction(db,work);

 async function requireEligible(query:Query,account:Account|null):Promise<Account> {
  if(!account)throw fail(401,'unauthorized','Please log in again.');
  if(!await isEligible(query,account.id))throw fail(403,'not_eligible');
  return account;
 }
 async function requireModerator(query:Query,account:Account|null):Promise<Account> {
  if(!account)throw fail(401,'unauthorized','Please log in again.');
  if(!(await roles(query,account.id)).includes('moderator'))throw fail(403,'forbidden');
  return account;
 }
 async function marketRow(query:Query,viewer:string|null,marketId:string,lock=false):Promise<Row> {
  const row=(await query(`SELECT ${MARKET_COLUMNS} FROM predictions_markets m WHERE m.id=$2 AND (
    ${visibleTo('$1')} OR m.author_id=$1
    OR EXISTS(SELECT 1 FROM predictions_roles pr WHERE pr.account_id=$1 AND pr.role='moderator'))${lock?' FOR UPDATE OF m':''}`,[viewer,marketId])).rows[0];
  if(!row)throw notFound();
  return row;
 }

 // ---- GET ----
 async function me(account:Account|null,cfg:Config):Promise<Me> {
  const next=(await db.query(`SELECT ${ts(`(date_trunc('week',now() AT TIME ZONE 'Pacific/Auckland')+interval '7 days') AT TIME ZONE 'Pacific/Auckland'`)} AS next`)).rows[0].next;
  const base:Me={enabled:cfg.enabled,signedIn:!!account,username:account?.username??null,eligible:false,roles:[],balance:null,nextGrantAt:next,
   weeklyGrant:num(cfg.weeklyGrant),tradingPaused:cfg.tradingPaused,launched:cfg.launched};
  if(!account)return base;
  const eligible=await isEligible(db.query,account.id);
  // Lazy repair converges with the scheduled job on the same grant records.
  if(eligible&&cfg.enabled&&!await writeFrozen(db))await tx(query=>repairGrants(query,account.id));
  const wallet=(await db.query('SELECT balance FROM predictions_wallets WHERE account_id=$1',[account.id])).rows[0];
  return {...base,eligible,roles:await roles(db.query,account.id),balance:wallet?num(wallet.balance):null};
 }
 async function markets(viewer:string|null,params:URLSearchParams):Promise<{items:MarketSummary[]}> {
  const view=params.get('view')??'all',category=params.get('category')??'',q=(params.get('q')??'').trim().slice(0,60);
  const where=[visibleTo('$1')];const values:unknown[]=[viewer];
  if(category){if(!(CATEGORIES as readonly string[]).includes(category))throw bad('Unknown category.');values.push(category);where.push(`m.category=$${values.length}`);}
  if(q){values.push(q.replace(/[\\%_]/g,match=>'\\'+match));where.push(`m.question ILIKE '%'||$${values.length}||'%'`);}
  let order='m.published_at DESC';
  if(view==='closing'){where.push(`m.state='open' AND m.close_at>now() AND m.close_at<=now()+interval '7 days'`);order='m.close_at ASC';}
  else if(view==='new'){where.push(`m.state='open' AND m.close_at>now()`);order='m.published_at DESC';}
  else if(view==='school'){where.push(`m.audience='school'`);}
  else if(view==='resolved'){where.push(`m.state IN ('resolved','void')`);order='m.updated_at DESC';}
  else if(view==='waiting'){where.push(`(m.state='paused' OR (m.state='open' AND m.close_at<=now()))`);order='m.close_at ASC';}
  else if(view==='all'){where.push(`m.state NOT IN ('resolved','void')`);order=`(m.state='open' AND m.close_at>now()) DESC,m.close_at ASC`;}
  else throw bad('Unknown view.');
  const rows=(await db.query(`SELECT ${MARKET_COLUMNS} FROM predictions_markets m WHERE ${where.join(' AND ')} ORDER BY ${order},m.id LIMIT 60`,values)).rows;
  return {items:rows.map(summary)};
 }
 async function market(account:Account|null,params:URLSearchParams):Promise<MarketDetail> {
  const viewer=account?.id??null,row=await marketRow(db.query,viewer,id(params.get('id')));
  const marketId=row.id as string;
  const [history,activity,evidence,resolution,settlement,positions]=await Promise.all([
   db.query(`SELECT ${ts('created_at')} AS at,price_after_ppm FROM (SELECT created_at,price_after_ppm,market_sequence FROM predictions_trades WHERE market_id=$1 ORDER BY market_sequence DESC LIMIT 200) t ORDER BY market_sequence`,[marketId]),
   db.query(`SELECT ${ts('created_at')} AS at,side,op,credits,price_after_ppm FROM predictions_trades WHERE market_id=$1 ORDER BY market_sequence DESC LIMIT 20`,[marketId]),
   db.query(`SELECT e.id,e.body,e.link,${ts('e.created_at')} AS at,COALESCE(a.username,'Deleted account') AS author FROM predictions_evidence e LEFT JOIN accounts a ON a.id=e.author_id
    WHERE e.market_id=$1 AND NOT e.hidden ORDER BY e.created_at DESC LIMIT 30`,[marketId]),
   db.query(`SELECT ${RESOLUTION_COLUMNS} FROM predictions_resolutions r WHERE r.market_id=$1`,[marketId]),
   db.query(`SELECT s.outcome,s.total_payout,s.completed_at IS NOT NULL AS completed,(SELECT count(*)::int FROM predictions_claims c WHERE c.market_id=s.market_id) AS claims,
    (SELECT amount FROM predictions_claims c WHERE c.market_id=s.market_id AND c.account_id=$2) AS mine FROM predictions_settlements s WHERE s.market_id=$1`,[marketId,viewer]),
   viewer?db.query('SELECT side,shares,cost_basis,realised FROM predictions_positions WHERE market_id=$1 AND account_id=$2 ORDER BY side DESC',[marketId,viewer]):Promise.resolve({rows:[]}),
  ]);
  const state=stateOf(row),cfg=await config(db.query);
  const held=viewer?await roles(db.query,viewer):[];
  const eligible=viewer?await isEligible(db.query,viewer):false;
  const isConflicted=viewer?await conflicted(db.query,marketId,viewer):true;
  const res=resolution.rows[0];
  const s=settlement.rows[0];
  const settled:Settlement|null=s?{outcome:s.outcome,totalPayout:num(s.total_payout),claims:num(s.claims),completed:!!s.completed,myPayout:s.mine===null||s.mine===undefined?null:num(s.mine)}:null;
  const mod=held.includes('moderator');
  return {
   ...summary(row),rules:rulesOf(row),rulesHash:row.rules_hash??null,liquidity:num(row.liquidity_b),reserve:num(row.reserve),
   positions:positions.rows.map((p):Position=>({side:p.side,shares:num(p.shares),costBasis:num(p.cost_basis),realised:num(p.realised)})),
   history:history.rows.map((h):HistoryPoint=>({at:h.at,yesPpm:num(h.price_after_ppm)})),
   activity:activity.rows.map((a):ActivityItem=>({at:a.at,side:a.side,op:a.op,credits:num(a.credits),yesPpm:num(a.price_after_ppm)})),
   evidence:evidence.rows.map((e):EvidenceItem=>({id:e.id,author:e.author,body:e.body,link:e.link??null,at:e.at})),
   resolution:resolutionOf(res),settlement:settled,
   mine:!!viewer&&row.author_id===viewer,
   can:{
    trade:eligible&&cfg.enabled&&!cfg.tradingPaused&&state==='open',
    authorise:mod&&!isConflicted&&(state==='closed'||state==='paused'),
    pause:mod&&(state==='open'||state==='closed'||state==='paused'),
    evidence:eligible&&['open','closed','paused'].includes(state),
    report:eligible&&!['resolved','void'].includes(state),
   },
  };
 }
 async function portfolio(account:Account,cfg:Config):Promise<Portfolio> {
  const who=await me(account,cfg);
  if(!who.eligible&&who.balance===null)throw fail(403,'not_eligible');
  const positions=(await db.query(`SELECT p.side,p.shares,p.cost_basis,p.realised,${MARKET_COLUMNS} FROM predictions_positions p JOIN predictions_markets m ON m.id=p.market_id
   WHERE p.account_id=$1 AND (p.shares>0 OR p.realised<>0 OR p.cost_basis>0) ORDER BY (m.state IN ('resolved','void')),m.close_at LIMIT 100`,[account.id])).rows;
  const ledger=(await db.query(`SELECT ${ts('j.created_at')} AS at,j.kind,p.amount,j.reason,m.question,m.id AS market_id FROM predictions_postings p JOIN predictions_journal j ON j.id=p.journal_id
   LEFT JOIN predictions_markets m ON m.id=j.market_id WHERE p.book='wallet' AND p.owner=$1 ORDER BY j.id DESC LIMIT 50`,[account.id])).rows;
  return {
   balance:who.balance??0,nextGrantAt:who.nextGrantAt,weeklyGrant:who.weeklyGrant,
   positions:positions.map(row=>({side:row.side,shares:num(row.shares),costBasis:num(row.cost_basis),realised:num(row.realised),market:summary(row)})),
   ledger:ledger.map((row):LedgerRow=>({at:row.at,kind:row.kind,amount:num(row.amount),question:row.question??null,marketId:row.market_id??null,note:row.reason})),
   openCost:positions.reduce((sum,row)=>sum+(num(row.shares)>0?num(row.cost_basis):0),0),
   realised:positions.reduce((sum,row)=>sum+num(row.realised),0),
  };
 }
 async function rankings():Promise<{items:RankingRow[]}> {
  // Realised trading profit only: sales and settlements minus cost basis. Grants and issuance are excluded.
  const rows=(await db.query(`SELECT a.username,sum(p.realised)::bigint AS realised,count(DISTINCT p.market_id)::int AS markets,
    COALESCE(sum(p.cost_basis) FILTER (WHERE p.shares>0),0)::bigint AS open_cost
   FROM predictions_positions p JOIN accounts a ON a.id=p.account_id JOIN predictions_markets m ON m.id=p.market_id
   WHERE NOT m.fixture OR (SELECT show_fixtures FROM predictions_config WHERE id)
   GROUP BY a.username HAVING bool_or(p.realised<>0) ORDER BY sum(p.realised) DESC,a.username LIMIT 50`)).rows;
  return {items:rows.map(row=>({username:row.username,realised:num(row.realised),markets:num(row.markets),openCost:num(row.open_cost)}))};
 }
 async function receipt(account:Account,params:URLSearchParams):Promise<Receipt> {
  const key=params.get('key')??'';if(!KEY.test(key))throw bad('Invalid operation key.');
  const row=(await db.query(`SELECT t.*,${ts('t.created_at')} AS at,m.question FROM predictions_trades t JOIN predictions_markets m ON m.id=t.market_id WHERE t.account_id=$1 AND t.operation_key=$2`,[account.id,key])).rows[0];
  if(!row)throw fail(404,'not_found','No prediction was recorded with that reference.');
  return receiptOf(row);
 }
 function receiptOf(row:Row):Receipt {
  return {id:row.id,operationKey:row.operation_key,marketId:row.market_id,question:row.question,side:row.side,op:row.op,shares:num(row.shares),credits:num(row.credits),
   priceBeforePpm:num(row.price_before_ppm),priceAfterPpm:num(row.price_after_ppm),balanceAfter:num(row.balance_after),at:row.at};
 }
 const submissionOf=(row:Row):Submission=>({id:row.id,question:row.question,state:stateOf(row),createdAt:row.created_at,rules:rulesOf(row)});
 async function mine(account:Account):Promise<{items:Submission[]}> {
  const rows=(await db.query(`SELECT ${MARKET_COLUMNS} FROM predictions_markets m WHERE m.author_id=$1 ORDER BY m.created_at DESC LIMIT 30`,[account.id])).rows;
  return {items:rows.map(submissionOf)};
 }
 /**
  * The moderator dashboard: every closed (or paused) question waiting for a result, with what each outcome would pay,
  * the recent authorisations, and open reports. Authorising is a separate POST; this only reads.
  */
 async function dashboard(account:Account):Promise<Dashboard> {
  await requireModerator(db.query,account);
  const rows=(await db.query(`SELECT ${MARKET_COLUMNS},
    (m.author_id=$1 OR EXISTS(SELECT 1 FROM predictions_trades t WHERE t.market_id=m.id AND t.account_id=$1)) AS conflicted,
    (SELECT count(*)::int FROM predictions_reports r WHERE r.market_id=m.id AND r.status='open') AS open_reports
   FROM predictions_markets m WHERE (m.state='open' AND m.close_at<=now()) OR m.state='paused' ORDER BY m.close_at LIMIT 100`,[account.id])).rows;
  const exposure=new Map<string,Exposure>();
  if(rows.length){
   const sums=(await db.query(`SELECT market_id,COALESCE(sum(yes),0)::bigint AS yes,COALESCE(sum(no),0)::bigint AS no,count(*) FILTER (WHERE yes+no>0)::int AS holders,COALESCE(sum((yes+no)/2),0)::bigint AS void
    FROM (SELECT market_id,account_id,COALESCE(sum(shares) FILTER (WHERE side='yes'),0) AS yes,COALESCE(sum(shares) FILTER (WHERE side='no'),0) AS no
     FROM predictions_positions WHERE market_id=ANY($1::uuid[]) GROUP BY market_id,account_id) p GROUP BY market_id`,[rows.map(r=>r.id)])).rows;
   for(const sum of sums)exposure.set(sum.market_id,{holders:num(sum.holders),yesPayout:num(sum.yes),noPayout:num(sum.no),voidPayout:num(sum.void)});
  }
  const toAuthorise=rows.map((row):AuthoriseItem=>({...summary(row),rules:rulesOf(row),global:isGlobal(row.category,row.audience),
   exposure:exposure.get(row.id)??{holders:0,yesPayout:0,noPayout:0,voidPayout:0},reports:num(row.open_reports),canAuthorise:!row.conflicted}));
  const recent=(await db.query(`SELECT m.id AS market_id,m.question,r.outcome,r.note,r.link,${ts('r.authorised_at')} AS authorised_at,a.username,s.total_payout,
    (SELECT count(*)::int FROM predictions_claims c WHERE c.market_id=m.id) AS claims
   FROM predictions_resolutions r JOIN predictions_markets m ON m.id=r.market_id JOIN predictions_settlements s ON s.market_id=m.id
   LEFT JOIN accounts a ON a.id=r.authorised_by ORDER BY r.authorised_at DESC LIMIT 25`)).rows;
  const reports=(await db.query(`SELECT r.market_id,m.question,r.reason,count(*)::int AS count FROM predictions_reports r JOIN predictions_markets m ON m.id=r.market_id
   WHERE r.status='open' AND m.state IN ('open','paused') GROUP BY r.market_id,m.question,r.reason ORDER BY count(*) DESC LIMIT 50`)).rows;
  const counts=(await db.query(`SELECT (SELECT count(*)::int FROM predictions_markets WHERE state IN ('open','paused') AND (NOT fixture OR (SELECT show_fixtures FROM predictions_config WHERE id))) AS open,
   (SELECT COALESCE(sum(total_payout),0)::bigint FROM predictions_settlements) AS paid`)).rows[0];
  return {toAuthorise,
   recent:recent.map((row):PayoutRecord=>({marketId:row.market_id,question:row.question,outcome:row.outcome,totalPayout:num(row.total_payout),claims:num(row.claims),authorisedAt:row.authorised_at,
    authorisedBy:row.username??null,note:row.note,link:row.link??null})),
   reports:reports.map(row=>({marketId:row.market_id,question:row.question,reason:row.reason,count:num(row.count)})),
   counts:{open:num(counts.open),awaiting:toAuthorise.length,paidTotal:num(counts.paid)}};
 }

 // ---- POST ----
 async function join(account:Account):Promise<Me> {
  if(!account)throw fail(401,'unauthorized');
  await rateLimit(db.query,'predictions:join:'+account.id,10,3600);
  await tx(async query=>{
   // An enablement event. Recorded once; a later visit never creates a second interval or signup bonus.
   await query('INSERT INTO predictions_wallets(account_id) VALUES ($1) ON CONFLICT DO NOTHING',[account.id]);
   await query('SELECT account_id FROM predictions_wallets WHERE account_id=$1 FOR UPDATE',[account.id]);
   const open=await query('SELECT 1 FROM predictions_eligibility WHERE account_id=$1 AND eligible_until IS NULL',[account.id]);
   if(!open.rows.length){
    // People cannot end their own eligibility, so any ended interval (whatever its method) was ended by an operator:
    // it is a suspension, and only an operator can restore it by inserting a new open interval.
    const suspended=await query(`SELECT 1 FROM predictions_eligibility WHERE account_id=$1 AND eligible_until IS NOT NULL LIMIT 1`,[account.id]);
    if(suspended.rows.length)throw fail(403,'forbidden','Your Predictions access is paused. Ask a moderator.');
    await query(`INSERT INTO predictions_eligibility(account_id,method,note) VALUES ($1,'opt_in','Accepted the Predictions rules')`,[account.id]);
    await audit(query,account,'join',null);
   }
   await repairGrants(query,account.id);
  });
  return me(account,await config(db.query));
 }
 async function quote(account:Account,data:Record<string,unknown>,cfg:Config):Promise<Quote> {
  await requireEligible(db.query,account);
  const marketId=id(data.marketId),side=data.side,op=data.op;
  if(side!=='yes'&&side!=='no')throw bad('Choose YES or NO.');
  if(op!=='buy'&&op!=='sell')throw bad('Choose buy or sell.');
  const amount=data.amount,tolerance=data.toleranceBp===undefined?DEFAULT_TOLERANCE_BP:data.toleranceBp;
  if(!Number.isSafeInteger(amount)||(amount as number)<=0)throw bad('Enter an amount.');
  if(!Number.isInteger(tolerance)||(tolerance as number)<0||(tolerance as number)>MAX_TOLERANCE_BP)throw bad('Invalid price tolerance.');
  if(op==='buy'&&((amount as number)<TRADE_MIN||(amount as number)>TRADE_MAX))throw bad('Spend between 0.10 and 100 credits.');
  await rateLimit(db.query,'predictions:quote:'+account.id,120,60);
  return tx(async query=>{
   const row=await marketRow(query,account.id,marketId);
   assertTradable(row,cfg);
   await repairGrants(query,account.id);
   const balance=big((await query('SELECT balance FROM predictions_wallets WHERE account_id=$1',[account.id])).rows[0]?.balance??0);
   const state=maker(row),value=BigInt(amount as number);
   if(op==='sell'){
    const held=big((await query('SELECT shares FROM predictions_positions WHERE market_id=$1 AND account_id=$2 AND side=$3',[marketId,account.id,side])).rows[0]?.shares??0);
    if(value>held)throw fail(409,'insufficient_shares');
   }
   const result=compute(state,side,op,value);
   if(result.shares===0n)throw bad('That amount is too small to buy a share.');
   const expected=op==='buy'?result.shares:result.credits;
   const quoteId=randomUUID(),minimum=minOut(expected,tolerance as number);
   await query('DELETE FROM predictions_quotes WHERE account_id=$1 AND (expires_at<now() OR created_at<now()-interval \'1 hour\')',[account.id]);
   const expires=(await query(`INSERT INTO predictions_quotes(id,account_id,market_id,side,op,amount,expected,min_out,tolerance_bp,market_version,rules_hash,pricing_version,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()+($13*interval '1 second')) RETURNING ${ts('expires_at')} AS expires_at`,
    [quoteId,account.id,marketId,side,op,value.toString(),expected.toString(),minimum.toString(),tolerance,row.version,row.rules_hash,PRICING_VERSION,QUOTE_TTL_SECONDS])).rows[0].expires_at;
   return {id:quoteId,marketId,side,op,amount:Number(value),shares:Number(result.shares),credits:Number(result.credits),minOut:Number(minimum),toleranceBp:tolerance as number,
    priceBeforePpm:pricePpm(state,side),priceAfterPpm:pricePpm(result.after,side),
    payoutIfRight:Number(op==='buy'?result.shares:0n),voidPayout:Number(voidPayout(result.shares,0n)),expiresAt:expires,balance:Number(balance)};
  });
 }
 function assertTradable(row:Row,cfg:Config){
  if(cfg.tradingPaused)throw fail(409,'trading_paused');
  if(row.state!=='open'||row.past_close)throw fail(409,'market_closed');
  if(row.fixture&&!cfg.showFixtures)throw notFound();
 }
 /**
  * Execute a quote exactly once. Inside one transaction: lock market then wallet; replay a committed operation key;
  * re-check eligibility, status and server time; recompute against current state; enforce the quote's minimum
  * output; check funds/ownership and the position cap; post balanced entries; update shares; commit one receipt.
  */
 async function execute(account:Account,data:Record<string,unknown>,cfg:Config):Promise<{receipt:Receipt;replayed:boolean}> {
  const quoteId=id(data.quoteId),marketId=id(data.marketId),key=data.operationKey;
  if(typeof key!=='string'||!KEY.test(key))throw bad('Invalid operation key.');
  const requestHash=sha(JSON.stringify({quoteId,marketId}));
  await rateLimit(db.query,'predictions:trade:'+account.id,40,60);
  try{
   return await tx(async query=>{
    const row=(await query(`SELECT ${MARKET_COLUMNS} FROM predictions_markets m WHERE m.id=$1 FOR UPDATE OF m`,[marketId])).rows[0];
    if(!row)throw notFound();
    const replay=await replayed(query,account.id,key,requestHash);if(replay)return {receipt:replay,replayed:true};
    if(!await isEligible(query,account.id))throw fail(403,'not_eligible');
    assertTradable(row,cfg);
    await repairGrants(query,account.id);// locks the wallet (step 2 of the lock order)
    const q=(await query(`SELECT *,expires_at<=clock_timestamp() AS expired FROM predictions_quotes WHERE id=$1 AND account_id=$2 AND market_id=$3`,[quoteId,account.id,marketId])).rows[0];
    if(!q)throw fail(409,'quote_expired');
    if(q.expired)throw fail(409,'quote_expired');
    if(q.rules_hash!==row.rules_hash||num(q.pricing_version)!==PRICING_VERSION)throw fail(409,'quote_expired');
    const side=q.side as Side,op=q.op as Operation,amount=big(q.amount);
    const wallet=(await query('SELECT balance FROM predictions_wallets WHERE account_id=$1 FOR UPDATE',[account.id])).rows[0];
    if(!wallet)throw fail(403,'not_eligible');
    const position=(await query('SELECT shares,cost_basis FROM predictions_positions WHERE market_id=$1 AND account_id=$2 AND side=$3 FOR UPDATE',[marketId,account.id,side])).rows[0];
    const heldShares=big(position?.shares??0),heldBasis=big(position?.cost_basis??0);
    const state=maker(row);
    if(op==='sell'&&amount>heldShares)throw fail(409,'insufficient_shares');
    const result=compute(state,side,op,amount);
    const output=op==='buy'?result.shares:result.credits;
    if(result.shares===0n||output<big(q.min_out))throw fail(409,'price_moved');
    if(op==='buy'){
     if(result.credits>big(wallet.balance))throw fail(409,'insufficient_credits');
     const exposure=big((await query('SELECT COALESCE(sum(cost_basis),0) AS total FROM predictions_positions WHERE market_id=$1 AND account_id=$2',[marketId,account.id])).rows[0].total);
     if(exposure+result.credits>BigInt(POSITION_CAP))throw fail(409,'position_cap');
    }
    const journal=await post(query,{kind:op,accountId:account.id,marketId,actor:account.username,reason:`${op==='buy'?'Bought':'Sold'} ${side.toUpperCase()}`},op==='buy'
     ?[{book:'wallet',owner:account.id,amount:-result.credits},{book:'reserve',owner:marketId,amount:result.credits}]
     :[{book:'reserve',owner:marketId,amount:-result.credits},{book:'wallet',owner:account.id,amount:result.credits}]);
    const updated=(await query(`UPDATE predictions_markets SET q_yes=$2,q_no=$3,version=version+1,sequence=sequence+1,updated_at=now() WHERE id=$1 RETURNING sequence,reserve`,
     [marketId,result.after.qYes.toString(),result.after.qNo.toString()])).rows[0];
    // Solvency is a hard invariant: the reserve must cover the larger side's payout after every trade.
    const worst=result.after.qYes>result.after.qNo?result.after.qYes:result.after.qNo;
    if(big(updated.reserve)<worst)throw new Error('Reserve invariant violated');
    if(op==='buy'){
     await query(`INSERT INTO predictions_positions(market_id,account_id,side,shares,cost_basis) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (market_id,account_id,side) DO UPDATE SET shares=predictions_positions.shares+EXCLUDED.shares,cost_basis=predictions_positions.cost_basis+EXCLUDED.cost_basis,updated_at=now()`,
      [marketId,account.id,side,result.shares.toString(),result.credits.toString()]);
    }else{
     // Average-cost basis: the sold fraction of the basis is realised against the proceeds.
     const basisOut=amount===heldShares?heldBasis:heldBasis*amount/heldShares;
     await query(`UPDATE predictions_positions SET shares=shares-$4,cost_basis=cost_basis-$5,realised=realised+$6,updated_at=now() WHERE market_id=$1 AND account_id=$2 AND side=$3`,
      [marketId,account.id,side,amount.toString(),basisOut.toString(),(result.credits-basisOut).toString()]);
    }
    const balanceAfter=(await query('SELECT balance FROM predictions_wallets WHERE account_id=$1',[account.id])).rows[0].balance;
    const tradeId=randomUUID();
    const trade=(await query(`INSERT INTO predictions_trades(id,account_id,operation_key,request_hash,market_id,side,op,shares,credits,price_before_ppm,price_after_ppm,market_sequence,balance_after,rules_hash,journal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *,${ts('created_at')} AS at`,
     [tradeId,account.id,key,requestHash,marketId,side,op,result.shares.toString(),result.credits.toString(),pricePpm(state),pricePpm(result.after),updated.sequence,balanceAfter,row.rules_hash,journal])).rows[0];
    await query('DELETE FROM predictions_quotes WHERE id=$1',[quoteId]);
    await outbox(query,`trade:${tradeId}`,'trade',marketId,account.id,{op,side,yesPpm:pricePpm(result.after)});
    return {receipt:receiptOf({...trade,question:row.question}),replayed:false};
   });
  }catch(error){
   // Two copies of the same request raced past the replay check: the loser returns the winner's receipt.
   if((error as {code?:string})?.code==='23505'){
    const replay=await replayed(db.query,account.id,key,requestHash);if(replay)return {receipt:replay,replayed:true};
   }
   throw error;
  }
 }
 async function replayed(query:Query,accountId:string,key:string,requestHash:string):Promise<Receipt|null> {
  const existing=(await query(`SELECT t.*,${ts('t.created_at')} AS at,m.question FROM predictions_trades t JOIN predictions_markets m ON m.id=t.market_id WHERE t.account_id=$1 AND t.operation_key=$2`,[accountId,key])).rows[0];
  if(!existing)return null;
  if(existing.request_hash!==requestHash)throw fail(409,'idempotency_conflict');
  return receiptOf(existing);
 }
 function draftFrom(data:Record<string,unknown>):DraftInput {
  const field=(key:keyof DraftInput)=>typeof data[key]==='string'?(data[key] as string):'';
  return {question:field('question'),category:field('category'),audience:field('audience'),yesRule:field('yesRule'),noRule:field('noRule'),voidRule:field('voidRule'),
   source:field('source'),sourceFallback:field('sourceFallback'),disclosure:field('disclosure'),closeAt:field('closeAt'),resolveAt:field('resolveAt')};
 }
 /**
  * A question opens the moment it is submitted: no moderator review. Validation, the prohibited-subject screen, the
  * per-author and overall open-question limits and the duplicate check still apply. In one transaction the rules are
  * hashed and frozen, the market opens, and its reserve is funded from the treasury.
  */
 async function submit(account:Account,data:Record<string,unknown>,cfg:Config):Promise<Submission> {
  await requireEligible(db.query,account);
  const draft=draftFrom(data),errors=validateDraft(draft,Date.now());
  const first=Object.entries(errors)[0];
  if(first)throw new HttpError(400,'invalid_draft',`${first[0]}: ${first[1]}`);
  await rateLimit(db.query,'predictions:submit:'+account.id,6,86400);
  const marketId=randomUUID();
  const closeAt=new Date(draft.closeAt).toISOString(),resolveAt=new Date(draft.resolveAt).toISOString();
  const rules:MarketRules={question:draft.question.trim(),category:draft.category as MarketRules['category'],audience:draft.audience as MarketRules['audience'],
   yesRule:draft.yesRule.trim(),noRule:draft.noRule.trim(),voidRule:draft.voidRule.trim(),source:draft.source.trim(),sourceFallback:draft.sourceFallback.trim(),
   disclosure:draft.disclosure.trim(),closeAt,resolveAt};
  // A global question's source is a link; store it in its normalised form.
  if(isGlobal(rules.category,rules.audience))rules.source=parseLink(rules.source)??rules.source;
  const hash=sha(canonicalRules(rules));
  try{
   await tx(async query=>{
    // Serialise submissions so concurrent authors cannot both pass the open-question budget check.
    await query('SELECT id FROM predictions_config WHERE id FOR UPDATE');
    const mineOpen=(await query(`SELECT count(*)::int AS n FROM predictions_markets WHERE author_id=$1 AND state IN ('open','paused')`,[account.id])).rows[0].n;
    if(mineOpen>=AUTHOR_OPEN_MAX)throw fail(409,'too_many_open_authored');
    const open=(await query(`SELECT count(*)::int AS n FROM predictions_markets WHERE state IN ('open','paused') AND NOT fixture`)).rows[0].n;
    if(open>=cfg.maxOpen)throw fail(409,'too_many_open');
    await query(`INSERT INTO predictions_markets(id,author_id,state,category,audience,question,yes_rule,no_rule,void_rule,source,source_fallback,disclosure,close_at,resolve_at,liquidity_b,rules_hash)
     VALUES ($1,$2,'open',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
     [marketId,account.id,rules.category,rules.audience,rules.question,rules.yesRule,rules.noRule,rules.voidRule,rules.source,rules.sourceFallback,rules.disclosure,closeAt,resolveAt,cfg.b.toString(),hash]);
    const stored=(await query(`SELECT ${MARKET_COLUMNS} FROM predictions_markets m WHERE m.id=$1`,[marketId])).rows[0];
    if(canonicalHash(stored)!==hash)throw new Error('Stored rules differ from the hashed rules');
    await post(query,{kind:'fund',accountId:null,marketId,actor:account.username,reason:'Market reserve funded on submission'},
     [{book:'treasury',owner:null,amount:-cfg.reserve},{book:'reserve',owner:marketId,amount:cfg.reserve}]);
    await audit(query,account,'submit',marketId);
    await outbox(query,`publish:${marketId}`,'published',marketId,null);
   });
  }catch(error){
   if((error as {code?:string})?.code==='23505')throw fail(409,'duplicate_question');
   throw error;
  }
  const row=(await db.query(`SELECT ${MARKET_COLUMNS} FROM predictions_markets m WHERE m.id=$1`,[marketId])).rows[0];
  return submissionOf(row);
 }
 /**
  * A moderator authorises a result and its payouts in one step. For a global question a YES or NO needs a valid https
  * evidence link; local questions need only the note. In one transaction the market is locked, the authorisation is
  * recorded (UNIQUE market_id), holder snapshots become uniquely keyed claims, each paid with its own journal entry,
  * and the unused reserve returns to the treasury only after every claim is paid. A moderator who created or traded
  * the question cannot authorise it.
  */
 async function authorise(account:Account,data:Record<string,unknown>):Promise<{ok:true;outcome:Outcome;paid:number}> {
  await requireModerator(db.query,account);
  const marketId=id(data.marketId),outcome=data.outcome as Outcome;
  if(!['yes','no','void'].includes(outcome))throw bad('Choose YES, NO or VOID.');
  const note=text(data.note,5,1000,'Note');
  let link:string|null=null;
  if(data.link!==undefined&&data.link!==null&&data.link!==''){
   link=parseLink(data.link);if(!link)throw bad('Use a valid https link.');
  }
  return tx(async query=>{
   const row=(await query(`SELECT ${MARKET_COLUMNS} FROM predictions_markets m WHERE m.id=$1 FOR UPDATE OF m`,[marketId])).rows[0];
   if(!row)throw notFound();
   if(row.state==='resolved'||row.state==='void')throw fail(409,'already_settled');
   const state=stateOf(row);
   if(state!=='closed'&&state!=='paused')throw fail(409,'invalid_state','A result can be authorised only after trading closes.');
   // A market paused before its close time can only be voided; YES/NO waits for the close.
   if(state==='paused'&&!row.past_close&&outcome!=='void')throw fail(409,'invalid_state','Before the close time, a paused question can only be voided.');
   if(await conflicted(query,marketId,account.id))throw fail(403,'conflict_of_interest');
   if(isGlobal(row.category,row.audience)&&outcome!=='void'&&!link)throw fail(400,'link_required');
   const resolutionId=randomUUID();
   await query('INSERT INTO predictions_resolutions(id,market_id,outcome,note,link,authorised_by) VALUES ($1,$2,$3,$4,$5,$6)',[resolutionId,marketId,outcome,note,link,account.id]);
   const paid=await settle(query,account,marketId,resolutionId,outcome);
   await audit(query,account,'authorise_'+outcome,marketId,link?`${note} ${link}`:note);
   return {ok:true,outcome,paid};
  });
 }
 async function settle(query:Query,actor:Account,marketId:string,resolutionId:string,outcome:Outcome):Promise<number> {
  const holders=(await query(`SELECT account_id,COALESCE(sum(shares) FILTER (WHERE side='yes'),0)::bigint AS yes,COALESCE(sum(shares) FILTER (WHERE side='no'),0)::bigint AS no,
   COALESCE(sum(cost_basis),0)::bigint AS basis FROM predictions_positions WHERE market_id=$1 GROUP BY account_id ORDER BY account_id`,[marketId])).rows;
  const claims=holders.map(h=>{
   const yes=big(h.yes),no=big(h.no);
   return {accountId:h.account_id as string,yes,no,amount:outcome==='yes'?yes:outcome==='no'?no:voidPayout(yes,no)};
  });
  const total=claims.reduce((sum,claim)=>sum+claim.amount,0n);
  await query('INSERT INTO predictions_settlements(market_id,outcome,resolution_id,total_payout) VALUES ($1,$2,$3,$4)',[marketId,outcome,resolutionId,total.toString()]);
  for(const claim of claims)
   await query('INSERT INTO predictions_claims(market_id,account_id,yes_shares,no_shares,amount) VALUES ($1,$2,$3,$4,$5)',[marketId,claim.accountId,claim.yes.toString(),claim.no.toString(),claim.amount.toString()]);
  await query(`UPDATE predictions_markets SET state=$2,outcome=$3,version=version+1,updated_at=now() WHERE id=$1`,[marketId,outcome==='void'?'void':'resolved',outcome]);
  return payClaims(query,actor,marketId);
 }
 return createRouter();

 function createRouter(){
  const GET:Record<string,(account:Account|null,params:URLSearchParams,cfg:Config)=>Promise<unknown>>={
   me:(account,_,cfg)=>me(account,cfg),
   markets:(account,params)=>markets(account?.id??null,params),
   market:(account,params)=>market(account,params),
   rankings:()=>rankings(),
   portfolio:(account,_,cfg)=>portfolio(signedIn(account),cfg),
   receipt:(account,params)=>receipt(signedIn(account),params),
   mine:account=>mine(signedIn(account)),
   dashboard:account=>dashboard(signedIn(account)),
  };
  const POST:Record<string,(account:Account,data:Record<string,unknown>,cfg:Config)=>Promise<unknown>>={
   join:account=>join(account),quote,execute,submit,authorise:(account,data)=>authorise(account,data),
   pause:(account,data)=>pause(account,data),
   settle:(account,data)=>retrySettlement(account,data),
   evidence:(account,data)=>addEvidence(account,data),
   report:(account,data)=>report(account,data),
  };
  return async(request:Request):Promise<Response>=>{
   try{
    const params=new URL(request.url).searchParams,action=params.get('action')??'';
    const isGet=Object.hasOwn(GET,action),isPost=Object.hasOwn(POST,action);
    if(!isGet&&!isPost)return respond({error:'not_found'},404);
    if(request.method!==(isGet?'GET':'POST'))return respond({error:'method_not_allowed'},405,{Allow:isGet?'GET':'POST'});
    const cfg=await config(db.query);
    const account=await resolveAccount(db,request);
    if(!cfg.enabled&&action!=='me')throw fail(503,'predictions_disabled');
    if(isGet)return respond(await GET[action]!(account,params,cfg));
    if(!sameOrigin(request))throw fail(403,'forbidden','Cross-origin requests are not allowed.');
    if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))throw fail(415,'unsupported_type','Content-Type must be application/json.');
    if(await writeFrozen(db))return readOnlyResponse();
    const data=await readJson(request,BODY_LIMIT);
    if(!isObject(data))throw bad();
    return respond(await POST[action]!(signedIn(account),data,cfg));
   }catch(error){return errorResponse(error,'predictions_unavailable');}
  };
 }
 function signedIn(account:Account|null):Account {if(!account)throw fail(401,'unauthorized','Please log in again.');return account;}

 async function pause(account:Account,data:Record<string,unknown>):Promise<{ok:true;state:StoredState}> {
  await requireModerator(db.query,account);
  const marketId=id(data.marketId),on=data.on;
  if(typeof on!=='boolean')throw bad();
  const note=text(data.note,5,400,'Reason');
  return tx(async query=>{
   const row=(await query(`SELECT state,close_at<=now() AS past FROM predictions_markets WHERE id=$1 FOR UPDATE`,[marketId])).rows[0];
   if(!row)throw notFound();
   // An integrity pause stops trading; it never settles. Unpausing never reopens trading after the close time.
   if(on&&row.state!=='open')throw fail(409,'invalid_state');
   if(!on&&(row.state!=='paused'))throw fail(409,'invalid_state');
   const state:StoredState=on?'paused':'open';
   await query('UPDATE predictions_markets SET state=$2,version=version+1,updated_at=now() WHERE id=$1',[marketId,state]);
   await audit(query,account,on?'pause':'unpause',marketId,note);
   return {ok:true,state};
  });
 }
 async function payClaims(query:Query,actor:Account|null,marketId:string):Promise<number> {
  const settlement=(await query('SELECT outcome,completed_at FROM predictions_settlements WHERE market_id=$1 FOR UPDATE',[marketId])).rows[0];
  if(!settlement||settlement.completed_at)return 0;
  const unpaid=(await query('SELECT account_id,amount FROM predictions_claims WHERE market_id=$1 AND paid_at IS NULL ORDER BY account_id',[marketId])).rows;
  // Lock holders' wallets in account order (step 2 of the global lock order).
  if(unpaid.length)await query('SELECT account_id FROM predictions_wallets WHERE account_id=ANY($1::uuid[]) ORDER BY account_id FOR UPDATE',[unpaid.map(c=>c.account_id)]);
  const kind=settlement.outcome==='void'?'void_payout':'payout';
  for(const claim of unpaid){
   const amount=big(claim.amount);let journal:number|null=null;
   if(amount>0n)journal=await post(query,{kind,accountId:claim.account_id,marketId,actor:actor?.username??'system',reason:settlement.outcome==='void'?'Void payout: 0.50 per share':`Payout: ${settlement.outcome.toUpperCase()} won`},
    [{book:'reserve',owner:marketId,amount:-amount},{book:'wallet',owner:claim.account_id,amount}]);
   const marked=await query('UPDATE predictions_claims SET journal_id=$3,paid_at=now() WHERE market_id=$1 AND account_id=$2 AND paid_at IS NULL RETURNING account_id',[marketId,claim.account_id,journal]);
   if(marked.rows.length!==1)throw new Error('Claim already paid');
   // Realise what is still held at cost against this payout. Void splits the aggregated payout across the two sides
   // (NO side gets floor(no/2), YES side the rest) so the per-side figures add up to exactly the credited amount.
   await query(`UPDATE predictions_positions SET realised=realised-cost_basis+(CASE
     WHEN $3='void' AND side='no' THEN shares/2 WHEN $3='void' THEN $4-COALESCE((SELECT n.shares/2 FROM predictions_positions n WHERE n.market_id=$1 AND n.account_id=$2 AND n.side='no'),0)
     WHEN side=$3 THEN shares ELSE 0 END),cost_basis=0,shares=0,updated_at=now() WHERE market_id=$1 AND account_id=$2`,[marketId,claim.account_id,settlement.outcome,amount.toString()]);
   await outbox(query,`claim:${marketId}:${claim.account_id}`,'payout',marketId,claim.account_id,{amount:Number(amount)});
  }
  const remaining=(await query('SELECT count(*)::int AS n FROM predictions_claims WHERE market_id=$1 AND paid_at IS NULL',[marketId])).rows[0].n;
  if(remaining===0){
   const reserve=big((await query('SELECT reserve FROM predictions_markets WHERE id=$1',[marketId])).rows[0].reserve);
   if(reserve>0n)await post(query,{kind:'release',accountId:null,marketId,actor:actor?.username??'system',reason:'Unused reserve returned after settlement'},
    [{book:'reserve',owner:marketId,amount:-reserve},{book:'treasury',owner:null,amount:reserve}]);
   await query('UPDATE predictions_settlements SET released=$2,completed_at=now() WHERE market_id=$1',[marketId,reserve.toString()]);
  }
  return unpaid.length;
 }
 async function retrySettlement(account:Account,data:Record<string,unknown>):Promise<{ok:true;paid:number}> {
  await requireModerator(db.query,account);
  const marketId=id(data.marketId);
  const paid=await tx(async query=>{
   await query('SELECT id FROM predictions_markets WHERE id=$1 FOR UPDATE',[marketId]);
   return payClaims(query,account,marketId);
  });
  return {ok:true,paid};
 }
 async function addEvidence(account:Account,data:Record<string,unknown>):Promise<EvidenceItem> {
  await requireEligible(db.query,account);
  const marketId=id(data.marketId),body=text(data.body,3,500,'Evidence');
  let link:string|null=null;
  if(data.link!==undefined&&data.link!==null&&data.link!==''){
   // Stored for a moderator to read; the server never fetches submitted links.
   if(typeof data.link!=='string'||data.link.length>300)throw bad('Use an https link under 300 characters.');
   try{const url=new URL(data.link);if(url.protocol!=='https:'||url.username||url.password)throw new Error();link=url.href;}catch{throw bad('Use an https link.');}
  }
  await rateLimit(db.query,'predictions:evidence:'+account.id,20,3600);
  const row=await marketRow(db.query,account.id,marketId);
  if(['resolved','void'].includes(row.state))throw fail(409,'invalid_state');
  const evidenceId=randomUUID();
  const inserted=(await db.query(`INSERT INTO predictions_evidence(id,market_id,author_id,body,link) VALUES ($1,$2,$3,$4,$5) RETURNING ${ts('created_at')} AS at`,[evidenceId,marketId,account.id,body,link])).rows[0];
  return {id:evidenceId,author:account.username,body,link,at:inserted.at};
 }
 async function report(account:Account,data:Record<string,unknown>):Promise<{ok:true}> {
  await requireEligible(db.query,account);
  const marketId=id(data.marketId),reason=data.reason;
  if(!(REPORT_REASONS as readonly unknown[]).includes(reason))throw bad('Choose a reason.');
  const note=data.note===undefined?'':text(data.note,0,300,'Note');
  await rateLimit(db.query,'predictions:report:'+account.id,20,86400);
  await marketRow(db.query,account.id,marketId);
  await db.query('INSERT INTO predictions_reports(market_id,reporter_id,reason,note) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',[marketId,account.id,reason,note]);
  return {ok:true};
 }
}
