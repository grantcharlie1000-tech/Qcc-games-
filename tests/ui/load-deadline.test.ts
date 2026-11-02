import {afterEach,expect,it,vi} from 'vitest';
import {loadWithDeadline} from '../../src/ui/load-deadline';
afterEach(()=>vi.useRealTimers());
it('ends a load whose transport ignores abort, and ignores its late result',async()=>{
 vi.useFakeTimers();const parent=new AbortController();let finish!:(value:string)=>void,request!:AbortSignal;
 const pending=loadWithDeadline(signal=>{request=signal;return new Promise<string>(resolve=>{finish=resolve;});},parent.signal,20000,()=>new Error('timeout'));
 const result=expect(pending).rejects.toThrow('timeout');await vi.advanceTimersByTimeAsync(20000);await result;
 expect(request.aborted).toBe(true);finish('late');await Promise.resolve();expect(vi.getTimerCount()).toBe(0);
});
it('settles and releases its deadline when its owner is disposed',async()=>{
 vi.useFakeTimers();const owner=new AbortController();let request!:AbortSignal;
 const pending=loadWithDeadline(signal=>{request=signal;return new Promise(()=>{});},owner.signal,20000,()=>new Error('timeout'));
 const result=expect(pending).rejects.toThrow('left');owner.abort(new Error('left'));await result;
 expect(request.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
it('returns a successful load and removes the pending timer',async()=>{
 vi.useFakeTimers();await expect(loadWithDeadline(async()=>42,new AbortController().signal,20000,()=>new Error('timeout'))).resolves.toBe(42);
 expect(vi.getTimerCount()).toBe(0);
});
it('propagates a synchronous loader failure and cleans up',async()=>{
 vi.useFakeTimers();await expect(loadWithDeadline(()=>{throw Error('invalid');},new AbortController().signal,20000,()=>new Error('timeout'))).rejects.toThrow('invalid');
 expect(vi.getTimerCount()).toBe(0);
});
