import {ChessAIError,type ChessAIMoveRequest,type ChessAIMoveResponse,type ChessAIProvider} from '../../types';
import {manifest} from './manifest';
import type {ReplyMessage,SearchMessage} from './protocol';

interface Pending {
  id:number;revision:number;legal:readonly string[];hardDeadline:number;
  resolve(value:ChessAIMoveResponse):void;reject(error:unknown):void;unlink():void;
  deadlineTimer?:ReturnType<typeof setTimeout>;
}

/** Conservative clock use, including worker startup and delivery. */
export function moveBudget(request:Pick<ChessAIMoveRequest,'thinkingTimeMs'|'clock'>):number {
  let budget=Math.max(1,Math.min(10_000,request.thinkingTimeMs));
  if(request.clock) budget=Math.max(1,Math.min(budget,request.clock.remainingMs*.08,request.clock.remainingMs-35));
  return budget;
}

/** Soft compute allocations; normal fixed work usually finishes earlier. */
export function searchBudget(opponentId:string,budgetMs:number):number {
  return Math.min(opponentId==='elo-900'?200:75,budgetMs*.65);
}

/** Every factory owns its worker, request sequence, seed and watchdog. */
export function createProvider():ChessAIProvider {
  let worker:Worker|undefined;
  let ready:Promise<void>|undefined;
  let readyReject:((error:unknown)=>void)|undefined;
  let current:Pending|undefined;
  let disposed=false;
  let serial=0;
  let initialized=false;
  const seed=new Uint32Array(1);
  if(typeof globalThis.crypto!=='undefined' && typeof globalThis.crypto.getRandomValues==='function')crypto.getRandomValues(seed);else seed[0]=Math.random()*0xffffffff;
  const aborted=()=>new ChessAIError('aborted','The engine request was cancelled.');
  function settle(error?:unknown,reply?:ChessAIMoveResponse):void {
    const p=current;if(!p)return;current=undefined;
    clearTimeout(p.deadlineTimer);p.unlink();
    if(error)p.reject(error);else p.resolve(reply!);
  }
  function stopWorker(error:unknown):void {
    const old=worker;worker=undefined;ready=undefined;
    old?.terminate();readyReject?.(error);readyReject=undefined;
    settle(error);
  }
  function ensureReady():Promise<void> {
    if(disposed)return Promise.reject(new ChessAIError('disposed','The engine has been closed.'));
    if(ready)return ready;
    if(typeof Worker==='undefined')return Promise.reject(new ChessAIError('unavailable','This browser does not support chess Workers.'));
    let active:Worker;
    try {active=new Worker(new URL('./engine.worker.ts',import.meta.url),{type:'module'});}
    catch(error){return Promise.reject(error);}
    worker=active;
    ready=new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>stopWorker(new ChessAIError('timeout','Beginner Worker startup timed out.')),8000);
      readyReject=(error)=>{clearTimeout(timer);reject(error);};
      active.onerror=(event)=>{event.preventDefault();if(worker===active)stopWorker(new ChessAIError('engine-error',event.message||'Beginner Worker crashed.'));};
      active.onmessageerror=()=>{if(worker===active)stopWorker(new ChessAIError('engine-error','Invalid Worker message.'));};
      active.onmessage=({data}:{data:ReplyMessage})=>{
        if(worker!==active)return;
        if(data.type==='ready'){clearTimeout(timer);readyReject=undefined;resolve();return;}
        const p=current;
        if(!p||data.id!==p.id||data.revision!==p.revision)return;
        if(performance.now()>=p.hardDeadline){stopWorker(new ChessAIError('timeout','The beginner engine exceeded its move allowance.'));return;}
        if(data.type==='error'){settle(new ChessAIError('engine-error',data.message));return;}
        if(!p.legal.includes(data.result?.moveUci)){settle(new ChessAIError('illegal-move','Beginner engine returned an illegal move.'));return;}
        settle(undefined,{moveUci:data.result.moveUci});
      };
    });
    return ready;
  }
  return {
    manifest,
    async initialize({signal,onProgress}){
      if(signal.aborted)throw aborted();
      const abort=()=>stopWorker(aborted());signal.addEventListener('abort',abort,{once:true});
      try {onProgress({phase:'warmup',fraction:0});await ensureReady();if(signal.aborted)throw aborted();initialized=true;onProgress({phase:'warmup',fraction:1});}
      finally {signal.removeEventListener('abort',abort);}
    },
    chooseMove(request){
      if(disposed)return Promise.reject(new ChessAIError('disposed','The engine has been closed.'));
      if(!initialized)return Promise.reject(new ChessAIError('init-failed','Initialize the beginner engine first.'));
      if(request.signal.aborted)return Promise.reject(aborted());
      if(current)stopWorker(new ChessAIError('stale','A newer position replaced the search.'));
      const id=++serial;
      const budget=moveBudget(request);
      return new Promise<ChessAIMoveResponse>((resolve,reject)=>{
        const abort=()=>{if(current?.id===id)stopWorker(aborted());};
        request.signal.addEventListener('abort',abort,{once:true});
        // thinkingTimeMs is a soft target. Leave room for worker delivery while
        // enforcing the real chess clock, including a small flag-fall reserve.
        const hardAllowance=request.clock
          ? Math.max(1,request.clock.remainingMs-Math.min(35,request.clock.remainingMs*.1))
          : budget+250;
        const started=performance.now();
        const p:Pending={id,revision:request.positionRevision,legal:request.legalMovesUci,resolve,reject,
          hardDeadline:started+hardAllowance,unlink:()=>request.signal.removeEventListener('abort',abort)};
        current=p;
        p.deadlineTimer=setTimeout(()=>{if(current===p)stopWorker(new ChessAIError('timeout','The beginner engine exceeded its move allowance.'));},hardAllowance);
        void ensureReady().then(()=>{
          if(current!==p||request.signal.aborted)return;
          const message:SearchMessage={type:'search',id,revision:p.revision,seed:seed[0]^id,
            input:{fen:request.fen,startFen:request.startFen,moveHistoryUci:request.moveHistoryUci,legalMovesUci:request.legalMovesUci,opponentId:request.opponentId,thinkingTimeMs:searchBudget(request.opponentId,budget)}};
          worker!.postMessage(message);
        }).catch(error=>{if(current===p)settle(error);});
      });
    },
    cancel(){stopWorker(aborted());},
    dispose(){if(disposed)return;disposed=true;stopWorker(new ChessAIError('disposed','The engine has been closed.'));},
  };
}
