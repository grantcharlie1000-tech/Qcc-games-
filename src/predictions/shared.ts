/**
 * Predictions: types, limits, validation and formatting shared by the browser and the server. Pure; no DOM, no node.
 *
 * Amounts in every API body are integer micro-units (1 credit = 1,000,000; 1 share = 1,000,000). They stay far
 * below 2^53, so JSON numbers carry them exactly; the server does all arithmetic in BigInt.
 */
export const MICRO=1_000_000;
export const PRICING_VERSION=1;
export const TRADE_MIN=100_000;// 0.10 credits
export const TRADE_MAX=100*MICRO;// one request; the position cap below is the real exposure control
export const POSITION_CAP=25*MICRO;// outstanding cost basis per account per market
export const QUICK_AMOUNTS=[500_000,1_000_000,2_000_000,5_000_000] as const;
export const DEFAULT_TOLERANCE_BP=100;// 1% worse than quoted
export const MAX_TOLERANCE_BP=500;
export const QUOTE_TTL_SECONDS=30;
export const PENDING_SUBMISSIONS_MAX=3;
export const CATEGORIES=['school','local','sport','games','technology','culture','science','community'] as const;
export type Category=typeof CATEGORIES[number];
export const CATEGORY_LABEL:Record<Category,string>={school:'School',local:'Marlborough',sport:'Sport',games:'Games',technology:'Technology',culture:'Culture',science:'Science',community:'Community'};
export type Audience='school'|'public';
export type Side='yes'|'no';
export type Outcome='yes'|'no'|'void';
export type Operation='buy'|'sell';
/** Stored states. "closed" is not stored: it is an open market whose close time has passed (server time). */
export type StoredState='pending'|'changes_requested'|'rejected'|'open'|'paused'|'proposed'|'disputed'|'resolved'|'void';
export type MarketState=StoredState|'closed';
export const REPORT_REASONS=['personal','harmful','ambiguous','duplicate','already_known','other'] as const;
export type ReportReason=typeof REPORT_REASONS[number];

export interface MarketRules {
 question:string;category:Category;audience:Audience;
 yesRule:string;noRule:string;voidRule:string;source:string;sourceFallback:string;disclosure:string;
 closeAt:string;resolveAt:string;
}
export interface MarketSummary {
 id:string;question:string;category:Category;audience:Audience;state:MarketState;
 closeAt:string;resolveAt:string;publishedAt:string|null;
 /** Marginal YES price in parts per million. */
 yesPpm:number;traders:number;trades:number;fixture:boolean;outcome:Outcome|null;
}
export interface Position {side:Side;shares:number;costBasis:number;realised:number}
export interface Resolution {
 id:string;outcome:Outcome;evidence:string;sourceChecked:string;status:'proposed'|'disputed'|'accepted'|'overturned';
 proposedAt:string;challengeUntil:string;disputeReason:string|null;reviewNote:string|null;finalOutcome:Outcome|null;
}
export interface HistoryPoint {at:string;yesPpm:number}
export interface ActivityItem {at:string;side:Side;op:Operation;credits:number;yesPpm:number}
export interface EvidenceItem {id:string;author:string;body:string;link:string|null;at:string}
export interface Settlement {outcome:Outcome;totalPayout:number;claims:number;completed:boolean;myPayout:number|null}
export interface MarketDetail extends MarketSummary {
 rules:MarketRules;rulesHash:string|null;liquidity:number;reserve:number;
 positions:Position[];history:HistoryPoint[];activity:ActivityItem[];evidence:EvidenceItem[];
 resolution:Resolution|null;settlement:Settlement|null;
 author:string|null;mine:boolean;reviewNote:string|null;
 /** What the signed-in account may do here; the server enforces each one independently. */
 can:{trade:boolean;propose:boolean;dispute:boolean;finalise:boolean;pause:boolean;evidence:boolean;report:boolean};
}
export interface Me {
 enabled:boolean;signedIn:boolean;username:string|null;eligible:boolean;
 roles:('moderator'|'resolver')[];balance:number|null;nextGrantAt:string;weeklyGrant:number;
 tradingPaused:boolean;launched:boolean;
}
export interface Quote {
 id:string;marketId:string;side:Side;op:Operation;
 /** Buy: credits budget. Sell: microshares. */
 amount:number;
 shares:number;credits:number;minOut:number;toleranceBp:number;
 priceBeforePpm:number;priceAfterPpm:number;
 payoutIfRight:number;voidPayout:number;expiresAt:string;balance:number;
}
export interface Receipt {
 id:string;operationKey:string;marketId:string;question:string;side:Side;op:Operation;
 shares:number;credits:number;priceBeforePpm:number;priceAfterPpm:number;balanceAfter:number;at:string;
}
export interface LedgerRow {at:string;kind:string;amount:number;question:string|null;marketId:string|null;note:string}
export interface PortfolioPosition extends Position {market:MarketSummary}
export interface Portfolio {balance:number;positions:PortfolioPosition[];ledger:LedgerRow[];nextGrantAt:string;weeklyGrant:number;openCost:number;realised:number}
export interface RankingRow {username:string;realised:number;markets:number;openCost:number}
export interface Submission {id:string;question:string;state:MarketState;reviewNote:string|null;createdAt:string;rules:MarketRules}
export interface ReviewQueue {pending:Submission[];toResolve:MarketSummary[];proposed:(MarketSummary&{resolution:Resolution})[];reports:{marketId:string;question:string;reason:string;count:number}[]}

export const ERROR_TEXT:Record<string,string>={
 predictions_disabled:'Predictions is not open yet.',
 not_eligible:'Join Predictions to make a prediction.',
 market_closed:'Trading on this question has closed.',
 trading_paused:'Trading is paused right now. Your credits and positions are safe.',
 price_moved:'The price moved. Check the updated numbers before confirming.',
 quote_expired:'That quote expired. Here is a fresh one.',
 insufficient_credits:"You don't have enough credits for that.",
 insufficient_shares:"You don't hold that many shares.",
 position_cap:'That would take you over the 25-credit limit for one question.',
 idempotency_conflict:'That request was already used for a different prediction. Start again.',
 conflict_of_interest:"You can't do that on a question you created or hold a position in.",
 forbidden:"You don't have permission to do that.",
 duplicate_question:'A question like this is already open or waiting for review.',
 too_many_pending:'You already have 3 questions waiting for review.',
 not_found:"This question doesn't exist or isn't visible to you.",
};

// ---- Formatting ----
/** Credits for display: two decimals by default, all six when `exact`. Integer arithmetic; no float rounding drift. */
export function formatCredits(micro:number,exact=false):string {
 const negative=micro<0,abs=Math.abs(Math.trunc(micro));
 const whole=Math.floor(abs/MICRO),frac=abs%MICRO;
 const text=exact?`${whole}.${String(frac).padStart(6,'0')}`:(()=>{const cents=Math.round(abs/10_000);return `${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`;})();
 return (negative&&text.replace(/[0.]/g,'')!==''?'−':'')+text;
}
export const formatShares=(micro:number)=>formatCredits(micro,true);
export function formatPercent(ppm:number,digits=0):string {return `${(ppm/1e4).toFixed(digits)}%`;}
/** Parses a typed credit amount ("2", "0.5", "1.25") into microcredits without floats. Returns null when invalid. */
export function parseCredits(text:string):number|null {
 const match=/^\s*(\d{1,6})(?:[.,](\d{0,6}))?\s*$/.exec(text);
 if(!match)return null;
 return Number(match[1])*MICRO+Number(((match[2]??'')+'000000').slice(0,6));
}
export function displayState(state:MarketState):string {
 return {pending:'Waiting for review',changes_requested:'Changes requested',rejected:'Not approved',open:'Open',paused:'Paused',closed:'Waiting for result',
  proposed:'Result proposed',disputed:'Under review',resolved:'Resolved',void:'Void'}[state];
}

// ---- Submission validation (the server re-runs all of it) ----
const length=(text:string)=>[...text].length;
/**
 * A screen, not a moderator: catches obviously unsuitable subjects before a human review. Markets predict events,
 * never identifiable pupils' bodies, relationships, health, discipline, grades or harm.
 */
const PROHIBITED=/\b(sex|sexual|sexuality|gay|lesbian|pregnan\w*|dating|date with|crush|kiss\w*|hook ?up|break ?up|boyfriend|girlfriend|relationship|virgin|nude\w*|weight|fat|ugly|sexy|medical|sick|ill(?:ness)?|hospital|diagnos\w*|adhd|autis\w*|depress\w*|anxiety|suicid\w*|self[- ]?harm|cutting|die|dies|death|dead|kill\w*|murder\w*|shoot\w*|stab\w*|injur\w*|hurt|fight\w*|punch\w*|assault\w*|abuse\w*|bully\w*|arrest\w*|police|crime|criminal|steal\w*|drunk|drugs?|vape\w*|vaping|smok\w*|weed|suspen\w*|expel\w*|stand[- ]?down|detention|discipline\w*|grades?|exam results?|ncea results?|humiliat\w*|embarrass\w*|cheat\w*|rumou?r\w*|alleg\w*)\b/i;
export function prohibitedSubject(text:string):boolean {return PROHIBITED.test(text);}
export interface DraftInput {
 question:string;category:string;audience:string;yesRule:string;noRule:string;voidRule:string;
 source:string;sourceFallback:string;disclosure:string;closeAt:string;resolveAt:string;
}
export type DraftErrors=Partial<Record<keyof DraftInput,string>>;
const FIELD_LIMITS:Record<keyof DraftInput,[number,number]>={
 question:[15,160],category:[1,20],audience:[1,10],yesRule:[10,400],noRule:[10,400],voidRule:[10,400],
 source:[5,300],sourceFallback:[0,300],disclosure:[0,300],closeAt:[1,40],resolveAt:[1,40],
};
/** Every message says what to do, not just that something is wrong. */
export function validateDraft(input:DraftInput,now:number):DraftErrors {
 const errors:DraftErrors={};
 for(const key of Object.keys(FIELD_LIMITS) as (keyof DraftInput)[]){
  const value=input[key];
  if(typeof value!=='string'){errors[key]='Fill this in.';continue;}
  const [min,max]=FIELD_LIMITS[key],n=length(value.trim());
  if(n<min)errors[key]=min<=1?'Fill this in.':`Use at least ${min} characters.`;
  else if(n>max)errors[key]=`Keep this under ${max} characters.`;
 }
 if(!errors.question&&!/\?\s*$/.test(input.question))errors.question='Write it as a yes/no question ending with a question mark.';
 if(!errors.category&&!(CATEGORIES as readonly string[]).includes(input.category))errors.category='Choose a category.';
 if(!errors.audience&&input.audience!=='school'&&input.audience!=='public')errors.audience='Choose who can see it.';
 if(!errors.source&&!/[a-z]{3}/i.test(input.source))errors.source='Name a source that can verify the result.';
 const close=Date.parse(input.closeAt),resolve=Date.parse(input.resolveAt);
 if(!errors.closeAt){
  if(!Number.isFinite(close))errors.closeAt='Choose when trading closes.';
  else if(close<now+3_600_000)errors.closeAt='Trading must stay open for at least an hour after review.';
  else if(close>now+120*86_400_000)errors.closeAt='Pick a close time within 120 days.';
 }
 if(!errors.resolveAt){
  if(!Number.isFinite(resolve))errors.resolveAt='Choose when the result will be known.';
  else if(Number.isFinite(close)&&resolve<close)errors.resolveAt='The result time must be after trading closes.';
  else if(Number.isFinite(close)&&resolve>close+30*86_400_000)errors.resolveAt='The result should be known within 30 days of closing.';
 }
 const text=[input.question,input.yesRule,input.noRule].join(' ');
 if(!errors.question&&prohibitedSubject(text))errors.question="Questions about people's bodies, relationships, health, discipline, grades or harm aren't allowed. Ask about an event instead.";
 if(!errors.yesRule&&!errors.noRule&&input.yesRule.trim().toLowerCase()===input.noRule.trim().toLowerCase())errors.noRule='The NO rule must describe a different result from YES.';
 return errors;
}
/** Canonical, order-stable text of the frozen rules; hashed on approval and shown in the rules record. */
export function canonicalRules(rules:MarketRules):string {
 const keys:(keyof MarketRules)[]=['question','category','audience','yesRule','noRule','voidRule','source','sourceFallback','disclosure','closeAt','resolveAt'];
 return JSON.stringify(keys.map(key=>[key,rules[key]]));
}
/** Same-question detection key: lower case letters and digits only. Mirrors the database's generated column. */
export function questionKey(question:string):string {return question.toLowerCase().replace(/[^a-z0-9]+/g,'');}
