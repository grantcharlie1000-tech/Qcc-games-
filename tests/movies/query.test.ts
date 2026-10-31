import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {answersRequest,cachedJson,clearQueryCache} from '../../src/movies/query';
import {MovieNetworkError} from '../../src/movies/network';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
// Like fetch, a request in flight rejects only when its signal aborts.
const hangsUntilAborted=(_url:string,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(new DOMException('Request cancelled','AbortError')));});
let fetchMock=vi.fn();

beforeEach(()=>{vi.useFakeTimers();clearQueryCache();fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('serves a fresh copy without a second request',async()=>{
 fetchMock.mockResolvedValueOnce(json({title:'Arrival'}));
 const signal=new AbortController().signal;
 expect(await cachedJson('/api/movies?id=1',signal)).toEqual({data:{title:'Arrival'},stale:false});
 expect(await cachedJson('/api/movies?id=1',signal)).toEqual({data:{title:'Arrival'},stale:false});
 expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('refetches once the stale time has passed',async()=>{
 fetchMock.mockResolvedValueOnce(json({title:'Old'})).mockResolvedValueOnce(json({title:'New'}));
 const signal=new AbortController().signal;
 await cachedJson('/api/movies?id=1',signal);
 await vi.advanceTimersByTimeAsync(900_001);
 expect(await cachedJson('/api/movies?id=1',signal)).toEqual({data:{title:'New'},stale:false});
 expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('uses a per-call stale time, so search copies expire sooner',async()=>{
 fetchMock.mockResolvedValueOnce(json({hits:1})).mockResolvedValueOnce(json({hits:2}));
 const signal=new AbortController().signal;const search={staleTime:300_000};
 await cachedJson('/api/movies?q=arrival',signal,search);
 await vi.advanceTimersByTimeAsync(299_999);
 expect(await cachedJson('/api/movies?q=arrival',signal,search)).toEqual({data:{hits:1},stale:false});
 await vi.advanceTimersByTimeAsync(1);
 expect(await cachedJson('/api/movies?q=arrival',signal,search)).toEqual({data:{hits:2},stale:false});
 expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('retries 502 after 500 ms and 1500 ms, then succeeds',async()=>{
 fetchMock.mockResolvedValueOnce(new Response('',{status:502})).mockResolvedValueOnce(new Response('',{status:502})).mockResolvedValueOnce(json({title:'Ready'}));
 const pending=cachedJson('/api/movies?id=2',new AbortController().signal);
 await vi.advanceTimersByTimeAsync(499);expect(fetchMock).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);expect(fetchMock).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(1499);expect(fetchMock).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(1);
 await expect(pending).resolves.toEqual({data:{title:'Ready'},stale:false});
 expect(fetchMock).toHaveBeenCalledTimes(3);
});
it('retries dropped connections, 429 and 504 responses',async()=>{
 const signal=new AbortController().signal;
 fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(json({id:'network'}));
 fetchMock.mockResolvedValueOnce(new Response('',{status:429})).mockResolvedValueOnce(json({id:'limited'}));
 fetchMock.mockResolvedValueOnce(new Response('',{status:504})).mockResolvedValueOnce(json({id:'gateway'}));
 for(const id of ['network','limited','gateway']){
  const pending=cachedJson(`/api/movies?retry=${id}`,signal);
  await vi.advanceTimersByTimeAsync(500);
  await expect(pending).resolves.toEqual({data:{id},stale:false});
 }
 expect(fetchMock).toHaveBeenCalledTimes(6);
});
it('does not retry 503, 404 or a timeout',async()=>{
 const signal=new AbortController().signal;
 fetchMock.mockResolvedValueOnce(new Response('',{status:503}));
 await expect(cachedJson('/api/movies?id=3',signal)).rejects.toMatchObject({kind:'service',status:503});
 expect(fetchMock).toHaveBeenCalledTimes(1);
 fetchMock.mockResolvedValueOnce(new Response('',{status:404}));
 await expect(cachedJson('/api/movies?id=4',signal)).rejects.toMatchObject({kind:'service',status:404});
 expect(fetchMock).toHaveBeenCalledTimes(2);
 fetchMock.mockImplementationOnce(hangsUntilAborted);
 const timedOut=cachedJson('/api/movies?id=5',signal).catch(error=>error);
 await vi.advanceTimersByTimeAsync(20_000);
 expect(await timedOut).toMatchObject({kind:'timeout'});
 expect(fetchMock).toHaveBeenCalledTimes(3);
});
it('passes a per-call timeout to the request',async()=>{
 fetchMock.mockImplementationOnce(hangsUntilAborted);
 const failed=vi.fn();
 cachedJson('/api/movies?id=10',new AbortController().signal,{timeout:5000}).catch(failed);
 await vi.advanceTimersByTimeAsync(4999);
 expect(failed).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);
 expect(failed).toHaveBeenCalledTimes(1);
 expect(failed.mock.calls[0][0]).toMatchObject({kind:'timeout'});
});
it('returns the cached copy marked stale when every attempt fails',async()=>{
 const signal=new AbortController().signal;
 fetchMock.mockResolvedValueOnce(json({title:'Cached'}));
 await cachedJson('/api/movies?id=6',signal);
 await vi.advanceTimersByTimeAsync(900_001);
 fetchMock.mockImplementation(async()=>new Response('',{status:502}));
 const pending=cachedJson('/api/movies?id=6',signal);
 await vi.advanceTimersByTimeAsync(2000);
 await expect(pending).resolves.toEqual({data:{title:'Cached'},stale:true});
 expect(fetchMock).toHaveBeenCalledTimes(4);
});
it('a 404 with a cached copy rejects instead of serving stale data',async()=>{
 const signal=new AbortController().signal;
 fetchMock.mockResolvedValueOnce(json({title:'Cached'}));
 await cachedJson('/api/movies?id=11',signal);
 await vi.advanceTimersByTimeAsync(900_001);
 fetchMock.mockResolvedValueOnce(new Response('',{status:404}));
 const failure=await cachedJson('/api/movies?id=11',signal).catch(error=>error);
 expect(failure).toBeInstanceOf(MovieNetworkError);
 expect(failure).toMatchObject({kind:'service',status:404});
 expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('a timeout with a cached copy still serves the copy marked stale',async()=>{
 const signal=new AbortController().signal;
 fetchMock.mockResolvedValueOnce(json({title:'Cached'}));
 await cachedJson('/api/movies?id=12',signal);
 await vi.advanceTimersByTimeAsync(900_001);
 fetchMock.mockImplementationOnce(hangsUntilAborted);
 const pending=cachedJson('/api/movies?id=12',signal).catch(error=>error);
 await vi.advanceTimersByTimeAsync(20_000);
 expect(await pending).toEqual({data:{title:'Cached'},stale:true});
 expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('an abort during the backoff rejects and stops retrying',async()=>{
 fetchMock.mockResolvedValueOnce(new Response('',{status:502}));
 const controller=new AbortController();
 const pending=cachedJson('/api/movies?id=7',controller.signal).catch(error=>error);
 await vi.advanceTimersByTimeAsync(200);
 controller.abort();
 expect(((await pending) as Error).name).toBe('AbortError');
 await vi.advanceTimersByTimeAsync(2000);
 expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('an abort during a request never falls back to a cached copy',async()=>{
 fetchMock.mockResolvedValueOnce(json({title:'Cached'}));
 const controller=new AbortController();
 await cachedJson('/api/movies?id=8',controller.signal);
 await vi.advanceTimersByTimeAsync(900_001);
 fetchMock.mockImplementationOnce(hangsUntilAborted);
 const pending=cachedJson('/api/movies?id=8',controller.signal).catch(error=>error);
 controller.abort();
 expect(((await pending) as Error).name).toBe('AbortError');
});
it('an aborted caller is rejected even when a fresh copy exists',async()=>{
 fetchMock.mockResolvedValueOnce(json({title:'Cached'}));
 const controller=new AbortController();
 await cachedJson('/api/movies?id=9',controller.signal);
 controller.abort();
 expect(((await cachedJson('/api/movies?id=9',controller.signal).catch(error=>error)) as Error).name).toBe('AbortError');
 expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('keeps at most 100 URLs',async()=>{
 fetchMock.mockImplementation(async()=>json({}));
 const signal=new AbortController().signal;
 for(let i=0;i<=100;i++)await cachedJson(`/api/movies?id=${i}`,signal);
 await cachedJson('/api/movies?id=1',signal);
 expect(fetchMock).toHaveBeenCalledTimes(101);
 await cachedJson('/api/movies?id=0',signal);
 expect(fetchMock).toHaveBeenCalledTimes(102);
});
it('evicts the least recently stored copy first',async()=>{
 fetchMock.mockImplementation(async()=>json({}));
 const signal=new AbortController().signal;const always={staleTime:0};
 for(let i=0;i<100;i++)await cachedJson(`/api/movies?id=${i}`,signal,always);
 await cachedJson('/api/movies?id=0',signal,always);
 await cachedJson('/api/movies?id=100',signal,always);
 fetchMock.mockClear();
 await cachedJson('/api/movies?id=0',signal);
 await cachedJson('/api/movies?id=1',signal);
 expect(fetchMock.mock.calls.map(([url])=>url)).toEqual(['/api/movies?id=1']);
});

// An answer is used only while the page still wants the request it answers. A genre that was switched away from is dropped.
it('an answer counts only for the request the page still wants',()=>{
 expect(answersRequest('g|movie|Drama','g|movie|Drama')).toBe(true);
 expect(answersRequest('g|movie|Comedy','g|movie|Drama')).toBe(false);
 expect(answersRequest(undefined,'g|movie|Drama')).toBe(false);
 expect(answersRequest('q|all|arrival','g|all|Drama')).toBe(false);
});
