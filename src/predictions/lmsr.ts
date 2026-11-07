/**
 * Binary LMSR market maker in exact integer units (Predictions).
 *
 * Credits and shares are integer micro-units: 1 credit = 1,000,000 microcredits, 1 share = 1,000,000 microshares,
 * and one winning microshare pays one microcredit. Every transcendental step runs in BigInt fixed point with
 * 40 fractional decimal digits, so rounding happens only at the explicit boundaries below:
 *  - buy:  shares rounded DOWN to a microshare, its exact cost recomputed and rounded UP, never above the budget;
 *  - sell: proceeds rounded DOWN;
 *  - void: floor(total microshares / 2).
 * Rounding therefore always favours the market reserve, which keeps it solvent for YES, NO and void.
 *
 *   C(qY,qN) = b ln(e^(qY/b) + e^(qN/b))       pY = 1 / (1 + e^((qN-qY)/b))
 *
 * No floating point is used for any value that reaches the ledger. Pure: imported by the server and by tests.
 */
export const MICRO=1_000_000n;
const DIGITS=40n;
const SCALE=10n**DIGITS;
/** Fixed-point numbers are bigint values scaled by SCALE. */
type Fixed=bigint;

export type Side='yes'|'no';
export interface MakerState {qYes:bigint;qNo:bigint;b:bigint}

const abs=(x:bigint)=>x<0n?-x:x;
/** Division rounding toward negative infinity (BigInt division truncates toward zero). */
function floorDiv(a:bigint,b:bigint):bigint {const q=a/b;return (a%b!==0n&&((a<0n)!==(b<0n)))?q-1n:q;}
function ceilDiv(a:bigint,b:bigint):bigint {return -floorDiv(-a,b);}
const mul=(a:Fixed,b:Fixed):Fixed=>floorDiv(a*b,SCALE);
const div=(a:Fixed,b:Fixed):Fixed=>floorDiv(a*SCALE,b);

/** atanh(z) for |z| <= 1/3 by its odd power series. */
function atanh(z:Fixed):Fixed {
 const z2=mul(z,z);let term=z,sum=z;
 for(let n=3n;;n+=2n){term=mul(term,z2);const add=term/n;if(add===0n)break;sum+=add;}
 return sum;
}
const LN2:Fixed=2n*atanh(div(1n*SCALE,3n*SCALE));

/** e^x, any sign. Range-reduced by powers of two so the Taylor series converges in ~35 terms. */
export function expFixed(x:Fixed):Fixed {
 const k=floorDiv(x+LN2/2n,LN2);
 const r=x-k*LN2;
 let term=SCALE,sum=SCALE;
 for(let n=1n;;n++){term=floorDiv(term*r,SCALE*n);if(term===0n)break;sum+=term;}
 if(k>=0n)return sum<<k;
 return sum>>(-k);
}
/** ln(x) for x > 0. Normalises x into [1,2) by powers of two, then uses ln(y) = 2 atanh((y-1)/(y+1)). */
export function lnFixed(x:Fixed):Fixed {
 if(x<=0n)throw new RangeError('ln of a non-positive number');
 let k=0n,y=x;
 while(y>=2n*SCALE){y>>=1n;k++;}
 while(y<SCALE){y<<=1n;k--;}
 return k*LN2+2n*atanh(div(y-SCALE,y+SCALE));
}
const fromMicro=(value:bigint):Fixed=>value*(SCALE/MICRO);
const floorMicro=(value:Fixed):bigint=>floorDiv(value,SCALE/MICRO);
const ceilMicro=(value:Fixed):bigint=>ceilDiv(value,SCALE/MICRO);

/** C(qY,qN) in fixed-point credits, via the stable form max + b ln(1 + e^(-|qY-qN|/b)). */
export function costFixed(state:MakerState):Fixed {
 const b=fromMicro(state.b),y=fromMicro(state.qYes),n=fromMicro(state.qNo);
 const high=y>n?y:n,gap=abs(y-n);
 return high+mul(b,lnFixed(SCALE+expFixed(-div(gap,b))));
}
/** Marginal price of one side as a fixed-point probability in (0,1). */
export function priceFixed(state:MakerState,side:Side):Fixed {
 const b=fromMicro(state.b);
 const diff=side==='yes'?fromMicro(state.qNo-state.qYes):fromMicro(state.qYes-state.qNo);
 return div(SCALE,SCALE+expFixed(div(diff,b)));
}
/** Price in parts per million, rounded to nearest; for display, charts and receipts only. */
export function pricePpm(state:MakerState,side:Side='yes'):number {
 return Number(floorDiv(priceFixed(state,side)*MICRO+SCALE/2n,SCALE));
}
const add=(state:MakerState,side:Side,shares:bigint):MakerState=>side==='yes'?{...state,qYes:state.qYes+shares}:{...state,qNo:state.qNo+shares};

/** Exact (unrounded) cost of buying `shares` microshares, in fixed-point credits. */
function rawBuyCost(state:MakerState,side:Side,shares:bigint):Fixed {return costFixed(add(state,side,shares))-costFixed(state);}

export interface BuyResult {shares:bigint;debit:bigint;after:MakerState}
/**
 * Spend at most `budget` microcredits on one side. Unrounded shares s = b ln(1 + expm1(d/b)/p); rounded down to a
 * microshare; the cost of those shares is recomputed exactly and rounded up. A rounded-up cost can only exceed the
 * budget by under a microcredit, which removing a microshare always fixes; the loop is bounded regardless.
 */
export function buyForBudget(state:MakerState,side:Side,budget:bigint):BuyResult {
 if(budget<=0n)throw new RangeError('budget must be positive');
 // 1/p written as 1 + e^((q_other - q_side)/b), so a side priced near zero cannot divide by a rounded-to-zero price.
 const b=fromMicro(state.b),other=side==='yes'?state.qNo-state.qYes:state.qYes-state.qNo;
 const growth=expFixed(div(fromMicro(budget),b))-SCALE;
 let shares=floorMicro(mul(b,lnFixed(SCALE+mul(growth,SCALE+expFixed(div(fromMicro(other),b))))));
 for(let guard=0;shares>0n&&guard<8;guard++){
  const debit=ceilMicro(rawBuyCost(state,side,shares));
  if(debit<=budget)return {shares,debit,after:add(state,side,shares)};
  shares--;
 }
 if(shares<=0n)return {shares:0n,debit:0n,after:state};
 throw new Error('Could not fit a purchase inside its budget');
}
/** Cost of buying an exact number of microshares, rounded up. */
export function buyCost(state:MakerState,side:Side,shares:bigint):bigint {
 if(shares<=0n)throw new RangeError('shares must be positive');
 return ceilMicro(rawBuyCost(state,side,shares));
}
export interface SellResult {proceeds:bigint;after:MakerState}
/** Sell `shares` owned microshares back to the maker; proceeds rounded down. Shorting is impossible by construction. */
export function sellShares(state:MakerState,side:Side,shares:bigint):SellResult {
 if(shares<=0n)throw new RangeError('shares must be positive');
 const outstanding=side==='yes'?state.qYes:state.qNo;
 if(shares>outstanding)throw new RangeError('cannot sell more than the outstanding shares');
 const after=add(state,side,-shares);
 return {proceeds:floorMicro(costFixed(state)-costFixed(after)),after};
}
/** Void payout for one account: 0.50 credits per outstanding share of either side, aggregated before rounding. */
export function voidPayout(yesShares:bigint,noShares:bigint):bigint {return (yesShares+noShares)/2n;}
/** b ln 2, the maker's worst-case loss from a fresh 50/50 market, rounded up to a microcredit. */
export function minimumReserve(b:bigint):bigint {return ceilMicro(mul(fromMicro(b),LN2));}
