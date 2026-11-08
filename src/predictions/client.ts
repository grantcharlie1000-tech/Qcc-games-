import {AppApi} from '../apps/api';
import type {Dashboard,DraftInput,EvidenceItem,MarketDetail,MarketSummary,Me,Operation,Outcome,Portfolio,Quote,RankingRow,Receipt,ReportReason,Side,Submission} from './shared';
export const PREDICTIONS_ENDPOINT='/.netlify/functions/predictions';
export interface MarketQuery {view?:string;category?:string;q?:string}
/** Browser client. Every credit-changing call is a server action; nothing here computes a balance. */
export class PredictionsClient {
 readonly api:AppApi;
 constructor(token:()=>string|null,fetcher?:typeof fetch){this.api=new AppApi(PREDICTIONS_ENDPOINT,token,fetcher,10_000);}
 me(signal?:AbortSignal){return this.api.get<Me>('me',{},signal);}
 markets(query:MarketQuery,signal?:AbortSignal){
  const params:Record<string,string>={};for(const [k,v] of Object.entries(query))if(v)params[k]=v;
  return this.api.get<{items:MarketSummary[]}>('markets',params,signal);
 }
 market(id:string,signal?:AbortSignal){return this.api.get<MarketDetail>('market',{id},signal);}
 portfolio(signal?:AbortSignal){return this.api.get<Portfolio>('portfolio',{},signal);}
 rankings(signal?:AbortSignal){return this.api.get<{items:RankingRow[]}>('rankings',{},signal);}
 mine(signal?:AbortSignal){return this.api.get<{items:Submission[]}>('mine',{},signal);}
 dashboard(signal?:AbortSignal){return this.api.get<Dashboard>('dashboard',{},signal);}
 receipt(key:string,signal?:AbortSignal){return this.api.get<Receipt>('receipt',{key},signal);}
 join(){return this.api.post<Me>('join',{});}
 quote(input:{marketId:string;side:Side;op:Operation;amount:number;toleranceBp?:number},signal?:AbortSignal){return this.api.post<Quote>('quote',input,signal);}
 execute(input:{marketId:string;quoteId:string;operationKey:string}){return this.api.post<{receipt:Receipt;replayed:boolean}>('execute',input);}
 submit(draft:DraftInput){return this.api.post<Submission>('submit',draft);}
 authorise(marketId:string,outcome:Outcome,note:string,link:string){return this.api.post<{ok:true;outcome:Outcome;paid:number}>('authorise',{marketId,outcome,note,...(link?{link}:{})});}
 pause(marketId:string,on:boolean,note:string){return this.api.post<{ok:true}>('pause',{marketId,on,note});}
 evidence(marketId:string,body:string,link:string){return this.api.post<EvidenceItem>('evidence',{marketId,body,link});}
 report(marketId:string,reason:ReportReason,note:string){return this.api.post<{ok:true}>('report',{marketId,reason,note});}
}
/** A fresh operation key per prediction; reused only to retry or look up that same prediction. */
export function operationKey():string {
 const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
