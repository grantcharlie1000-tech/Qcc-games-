import {describe,it,expect} from 'vitest';
import golden from './golden.json';
import {MICRO,buyForBudget,buyCost,sellShares,voidPayout,minimumReserve,pricePpm,priceFixed,costFixed,expFixed,lnFixed,type MakerState,type Side} from '../../src/predictions/lmsr';

const B=20n*MICRO;
const fresh=():MakerState=>({qYes:0n,qNo:0n,b:B});
const micro=(credits:string)=>{const [whole,frac='']=credits.split('.');return BigInt(whole!)*MICRO+BigInt((frac+'000000').slice(0,6));};
const SCALE=10n**40n;

describe('fixed-point primitives',()=>{
 it('exp and ln are inverse and match known constants to 30+ digits',()=>{
  expect(expFixed(0n)).toBe(SCALE);
  // e = 2.7182818284590452353602874713526624977572...
  expect(expFixed(SCALE).toString().slice(0,35)).toBe('27182818284590452353602874713526624');
  // ln 2 = 0.6931471805599453094172321214581765680755...
  expect(lnFixed(2n*SCALE).toString().slice(0,35)).toBe('69314718055994530941723212145817656');
  for(const x of [-45n,-7n,-1n,3n,11n,60n]){
   const back=lnFixed(expFixed(x*SCALE/3n));
   expect(Number((back-x*SCALE/3n)<0n?-(back-x*SCALE/3n):back-x*SCALE/3n)).toBeLessThan(1e7);// absolute error below 1e-33
  }
 });
});

describe('binary LMSR against the reference pack golden values (b = 20)',()=>{
 for(const g of golden.golden_purchases){
  it(`spending ${g.budget_credits} credits on YES from 50%`,()=>{
   const budget=micro(g.budget_credits);
   const buy=buyForBudget(fresh(),'yes',budget);
   expect(buy.shares).toBe(BigInt(g.executed_microshares));
   expect(buy.debit).toBe(BigInt(g.executed_debit_microcredits));
   // New market view, compared to the reference to 1 ppm.
   expect(Math.abs(pricePpm(buy.after)-Math.round(Number(g.executed_yes_percent)*1e4))).toBeLessThanOrEqual(1);
   // Selling everything straight back loses exactly the rounding microcredit.
   expect(sellShares(buy.after,'yes',buy.shares).proceeds).toBe(micro(g.immediate_sell_all_proceeds_credits));
   expect(voidPayout(buy.shares,0n)).toBe(BigInt(g.void_payout_microcredits));
  });
 }
 it('the 2-credit example: 3.818056 shares, ~54.76%, pays 3.818056 if YES, 1.909028 if void',()=>{
  const buy=buyForBudget(fresh(),'yes',2n*MICRO);
  expect(buy.shares).toBe(3_818_056n);
  expect(pricePpm(buy.after)).toBe(547581);
  expect(voidPayout(buy.shares,0n)).toBe(1_909_028n);
 });
 it('minimum reserve is b ln 2 = 13.862944 credits; the pilot 14 credits covers it',()=>{
  expect(minimumReserve(B)).toBe(13_862_944n);
  expect(minimumReserve(B)).toBeLessThan(14n*MICRO);
 });
});

describe('identities and invariants',()=>{
 it('starts at 50% and YES/NO prices sum to one',()=>{
  expect(pricePpm(fresh())).toBe(500000);
  const s:MakerState={qYes:37_123_456n,qNo:5_000_001n,b:B};
  const sum=priceFixed(s,'yes')+priceFixed(s,'no');
  expect(Number(sum>SCALE?sum-SCALE:SCALE-sum)).toBeLessThan(1e4);// within 1e-36
 });
 it('is symmetric between YES and NO',()=>{
  for(const amount of [100_000n,1_234_567n,9_999_999n]){
   const y=buyForBudget(fresh(),'yes',amount),n=buyForBudget(fresh(),'no',amount);
   expect(y.shares).toBe(n.shares);expect(y.debit).toBe(n.debit);
   expect(pricePpm(y.after,'yes')).toBe(pricePpm(n.after,'no'));
  }
 });
 it('a complete set (one YES + one NO share) costs exactly one credit',()=>{
  const s:MakerState={qYes:12_000_000n,qNo:3_000_000n,b:B};
  const both={...s,qYes:s.qYes+MICRO,qNo:s.qNo+MICRO};
  expect(costFixed(both)-costFixed(s)).toBe(SCALE);
 });
 it('cost is monotonic and price moves in the direction bought',()=>{
  let last=0n;
  for(const shares of [1n,10n,1_000n,1_000_000n,5_000_000n,40_000_000n]){const c=buyCost(fresh(),'yes',shares);expect(c).toBeGreaterThanOrEqual(last);last=c;}
  const s:MakerState={qYes:4_000_000n,qNo:9_000_000n,b:B};
  expect(pricePpm(buyForBudget(s,'yes',MICRO).after)).toBeGreaterThan(pricePpm(s));
  expect(pricePpm(buyForBudget(s,'no',MICRO).after)).toBeLessThan(pricePpm(s));
 });
 it('never charges more than the budget and never pays out a profitable round trip',()=>{
  let seed=99;const rand=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  for(let i=0;i<300;i++){
   const s:MakerState={qYes:BigInt(Math.floor(rand()*200e6)),qNo:BigInt(Math.floor(rand()*200e6)),b:B};
   const side:Side=rand()<.5?'yes':'no',budget=BigInt(1+Math.floor(rand()*30e6));
   const buy=buyForBudget(s,side,budget);
   expect(buy.debit).toBeLessThanOrEqual(budget);
   if(buy.shares>0n)expect(sellShares(buy.after,side,buy.shares).proceeds).toBeLessThanOrEqual(buy.debit);
  }
 });
 it('stays finite and correct at extreme prices',()=>{
  const s:MakerState={qYes:2_000_000_000n,qNo:0n,b:B};// 2,000 YES shares: price within 1e-43 of 1
  expect(pricePpm(s)).toBe(1_000_000);
  const no=buyForBudget(s,'no',MICRO);
  expect(no.shares).toBeGreaterThan(50_000_000n);// a nearly free side buys lots of shares
  expect(no.debit).toBeLessThanOrEqual(MICRO);
  const yes=buyForBudget(s,'yes',MICRO);
  expect(yes.shares).toBeLessThanOrEqual(MICRO);// a nearly certain side costs ~1 credit per share
  expect(yes.shares).toBeGreaterThan(999_000n);
 });
 it('cannot sell more than is outstanding (no shorting)',()=>{
  expect(()=>sellShares(fresh(),'yes',1n)).toThrow(RangeError);
 });
 it('void aggregates both sides before rounding down',()=>{
  expect(voidPayout(3n,0n)).toBe(1n);
  expect(voidPayout(3n,1n)).toBe(2n);
  expect(voidPayout(1_000_001n,1_000_000n)).toBe(1_000_000n);
 });
});

describe('seeded multi-wallet simulation: conservation and reserve solvency',()=>{
 it('keeps every wallet and holding nonnegative and funds YES, NO and void',()=>{
  let seed=7221;const rand=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  const reserve0=14n*MICRO;
  let maker:MakerState=fresh(),vault=reserve0,executed=0;
  const wallets=Array.from({length:25},()=>({credits:100n*MICRO,yes:0n,no:0n}));
  const total0=wallets.reduce((s,w)=>s+w.credits,0n)+vault;
  for(let i=0;i<4000;i++){
   const w=wallets[Math.floor(rand()*wallets.length)]!,side:Side=rand()<.5?'yes':'no';
   if(rand()<.6){
    const budget=BigInt(100_000+Math.floor(rand()*6e6));if(budget>w.credits)continue;
    const buy=buyForBudget(maker,side,budget);if(buy.shares===0n)continue;
    w.credits-=buy.debit;vault+=buy.debit;w[side]+=buy.shares;maker=buy.after;
   }else{
    const held=w[side];if(held===0n)continue;
    const shares=1n+BigInt(Math.floor(rand()*Number(held)));
    const sell=sellShares(maker,side,shares);
    w.credits+=sell.proceeds;vault-=sell.proceeds;w[side]-=shares;maker=sell.after;
   }
   executed++;
   expect(w.credits>=0n&&w.yes>=0n&&w.no>=0n).toBe(true);
   // The vault must cover the worst outcome after every step.
   expect(vault).toBeGreaterThanOrEqual(maker.qYes>maker.qNo?maker.qYes:maker.qNo);
  }
  expect(executed).toBeGreaterThan(2500);
  expect(wallets.reduce((s,w)=>s+w.yes,0n)).toBe(maker.qYes);
  expect(wallets.reduce((s,w)=>s+w.no,0n)).toBe(maker.qNo);
  expect(wallets.reduce((s,w)=>s+w.credits,0n)+vault).toBe(total0);
  const voidTotal=wallets.reduce((s,w)=>s+voidPayout(w.yes,w.no),0n);
  expect(vault).toBeGreaterThanOrEqual(voidTotal);
 });
});
