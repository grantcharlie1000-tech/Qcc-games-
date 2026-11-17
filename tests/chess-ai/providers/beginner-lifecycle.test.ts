import {afterEach, describe, expect, it, vi} from 'vitest';
import {createProvider, moveBudget} from '../../../src/chess-ai/providers/beginner';
import {Chess} from '../../../src/chess-ai/providers/beginner/vendor/chess.js';
import type {ChessAIMoveRequest} from '../../../src/chess-ai/types';

class TestWorker {
  static instances:TestWorker[]=[];
  onmessage:((event:MessageEvent)=>void)|null=null;
  onerror:((event:ErrorEvent)=>void)|null=null;
  onmessageerror:(()=>void)|null=null;
  terminated=false;
  sent:unknown[]=[];
  constructor(){TestWorker.instances.push(this);queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}} as MessageEvent));}
  postMessage(data:unknown){this.sent.push(data);}
  terminate(){this.terminated=true;}
  message(data:unknown){this.onmessage?.({data} as MessageEvent);}
}
function request(signal=new AbortController().signal,revision=1):ChessAIMoveRequest {
  const c=new Chess();return {fen:c.fen(),startFen:c.fen(),legalMovesUci:c.moves({verbose:true}).map(m=>m.lan),moveHistoryUci:[],positionRevision:revision,thinkingTimeMs:10,opponentId:'elo-300',signal};
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();TestWorker.instances=[];});
describe('beginner worker ownership',()=>{
  it('delivers a legal worker reply immediately without spending the unused thinking allowance',async()=>{
    vi.stubGlobal('Worker',TestWorker);vi.useFakeTimers();
    const provider=createProvider();await provider.initialize({signal:new AbortController().signal,onProgress:()=>{}});
    let delivered=false;
    const pending=provider.chooseMove({...request(),opponentId:'elo-500',thinkingTimeMs:500}).then(result=>{delivered=true;return result;});
    await vi.advanceTimersByTimeAsync(0);
    const worker=TestWorker.instances[0],sent=worker.sent[0] as {id:number;revision:number};
    worker.message({type:'result',id:sent.id,revision:sent.revision,result:{moveUci:'e2e4'}});
    await vi.advanceTimersByTimeAsync(1);
    expect(delivered).toBe(true);
    provider.cancel();await pending.catch(()=>{});provider.dispose();
  });
  it('uses more of Brooks existing pacing window without changing the lower-tier budget',async()=>{
    vi.stubGlobal('Worker',TestWorker);
    for(const [opponentId,budget] of [['elo-900',200],['elo-700',75]] as const) {
      const provider=createProvider();await provider.initialize({signal:new AbortController().signal,onProgress:()=>{}});
      const pending=provider.chooseMove({...request(),opponentId,thinkingTimeMs:500});
      const rejected=expect(pending).rejects.toThrow();
      await new Promise(resolve=>setTimeout(resolve,0));
      const message=TestWorker.instances.at(-1)!.sent[0] as {input:{thinkingTimeMs:number}};
      provider.cancel();await rejected;provider.dispose();
      expect(message.input.thinkingTimeMs).toBe(budget);
    }
  });
  it('does not initialize without Workers',async()=>{
    vi.stubGlobal('Worker',undefined);
    await expect(createProvider().initialize({signal:new AbortController().signal,onProgress:()=>{}})).rejects.toThrow();
  });
  it('aborts outstanding work and terminates only its own worker',async()=>{
    vi.stubGlobal('Worker',TestWorker);
    const a=createProvider(),b=createProvider();
    await Promise.all([a.initialize({signal:new AbortController().signal,onProgress:()=>{}}),b.initialize({signal:new AbortController().signal,onProgress:()=>{}})]);
    const pending=a.chooseMove(request());const assertion=expect(pending).rejects.toThrow();
    a.cancel();await assertion;
    expect(TestWorker.instances[0].terminated).toBe(true);
    expect(TestWorker.instances[1].terminated).toBe(false);
    a.dispose();a.dispose();b.dispose();
  });
  it('restarts after cancellation and ignores a late result from the old worker',async()=>{
    vi.stubGlobal('Worker',TestWorker);
    const p=createProvider();await p.initialize({signal:new AbortController().signal,onProgress:()=>{}});
    const old=TestWorker.instances[0];
    const first=p.chooseMove(request());const rejected=expect(first).rejects.toThrow();p.cancel();await rejected;
    const second=p.chooseMove(request(undefined,2));
    await new Promise(r=>setTimeout(r,0));
    old.message({type:'result',id:1,revision:1,result:{moveUci:'a2a3'}});
    const fresh=TestWorker.instances[1];
    const sent=fresh.sent[0] as {id:number;revision:number};
    fresh.message({type:'result',id:sent.id,revision:sent.revision,result:{moveUci:'e2e4'}});
    await expect(second).resolves.toEqual({moveUci:'e2e4'});
    p.dispose();
  });
  it('allows a clock-safe reply beyond the soft pacing budget',async()=>{
    vi.stubGlobal('Worker',TestWorker);
    const p=createProvider();await p.initialize({signal:new AbortController().signal,onProgress:()=>{}});
    vi.useFakeTimers();
    const input={...request(),thinkingTimeMs:400,clock:{remainingMs:50,incrementMs:0}};
    expect(moveBudget(input)).toBe(4);
    const pending=p.chooseMove(input);
    await vi.advanceTimersByTimeAsync(5);
    const worker=TestWorker.instances[0],sent=worker.sent[0] as {id:number;revision:number};
    worker.message({type:'result',id:sent.id,revision:sent.revision,result:{moveUci:'e2e4'}});
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({moveUci:'e2e4'});
    expect(worker.terminated).toBe(false);p.dispose();
  });
  it('terminates a stalled worker before the actual chess clock expires',async()=>{
    vi.stubGlobal('Worker',TestWorker);
    const p=createProvider();await p.initialize({signal:new AbortController().signal,onProgress:()=>{}});
    vi.useFakeTimers();
    const input={...request(),thinkingTimeMs:400,clock:{remainingMs:20,incrementMs:0}};
    const pending=p.chooseMove(input);const rejected=expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(17);
    expect(TestWorker.instances[0].terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(2);await rejected;
    expect(TestWorker.instances[0].terminated).toBe(true);p.dispose();
  });
  it('rejects a worker reply delivered after the absolute clock deadline',async()=>{
    vi.stubGlobal('Worker',TestWorker);
    const p=createProvider();await p.initialize({signal:new AbortController().signal,onProgress:()=>{}});
    vi.useFakeTimers();
    const input={...request(),thinkingTimeMs:400,clock:{remainingMs:20,incrementMs:0}};
    const pending=p.chooseMove(input);const rejected=expect(pending).rejects.toThrow();
    await Promise.resolve();
    const worker=TestWorker.instances[0],sent=worker.sent[0] as {id:number;revision:number};
    vi.spyOn(performance,'now').mockReturnValue(100);
    worker.message({type:'result',id:sent.id,revision:sent.revision,result:{moveUci:'e2e4'}});
    await vi.advanceTimersByTimeAsync(1);await rejected;
    expect(worker.terminated).toBe(true);p.dispose();
  });
  it('rejects worker crashes and illegal engine responses',async()=>{
    vi.stubGlobal('Worker',TestWorker);
    const p=createProvider();await p.initialize({signal:new AbortController().signal,onProgress:()=>{}});
    const result=p.chooseMove(request());const rejected=expect(result).rejects.toThrow();
    await new Promise(r=>setTimeout(r,0));
    const worker=TestWorker.instances[0],sent=worker.sent[0] as {id:number;revision:number};
    worker.message({type:'result',id:sent.id,revision:sent.revision,result:{moveUci:'a1a8'}});await rejected;
    const next=p.chooseMove(request(undefined,2));const crash=expect(next).rejects.toThrow();
    await new Promise(r=>setTimeout(r,0));TestWorker.instances[0].onerror?.({message:'crashed',preventDefault(){}} as ErrorEvent);await crash;
    expect(worker.terminated).toBe(true);p.dispose();
  });
});
