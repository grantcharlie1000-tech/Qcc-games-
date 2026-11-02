import {it,expect,vi,beforeEach,afterEach} from 'vitest';
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
import {LeaderboardSync,NOT_OPEN_RETRY_MS} from '../../src/leaderboard/client';
import {LEADERBOARD_NOT_OPEN} from '../../src/leaderboard/shared';
function memory(account=true){const map=new Map<string,unknown>();if(account)map.set('accounts:session',{token:'acct_'+'a'.repeat(64),username:'Ada'});return {read:<T>(key:string,fallback:T)=>(map.get(key)??fallback) as T,write:(key:string,value:unknown)=>{map.set(key,structuredClone(value));return true;}};}
it('exposes storage-full errors and retains queued scores across reload until a successful retry',async()=>{
 const storage=memory();let full=true;const fetcher=vi.fn(async()=>full?Response.json({error:'storage_full',message:'Storage is full right now. Your progress is kept on this device.'},{status:507}):Response.json({}));
 const sync=new LeaderboardSync(storage,fetcher as typeof fetch);sync.queue('snake',100);
 await expect(sync.flush()).rejects.toThrow('Storage is full right now. Your progress is kept on this device.');
 expect(sync.message).toBe('Storage is full right now. Your progress is kept on this device.');
 expect(storage.read('leaderboard:pending:account:ada',{})).toEqual({snake:100});expect(storage.read('leaderboard:sent:account:ada',{})).toEqual({});sync.dispose();
 full=false;const restored=new LeaderboardSync(storage,fetcher as typeof fetch);await restored.flush();expect(fetcher).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(60000);expect(storage.read('leaderboard:pending:account:ada',{})).toEqual({});expect(storage.read('leaderboard:sent:account:ada',{})).toEqual({snake:100});restored.dispose();
});
it.each(['public','personal'])('surfaces the storage-full message when a %s leaderboard read fails',async view=>{
 const storage=memory();storage.write('leaderboard:cache:snake:account:ada',{entries:[],player:null});
 const sync=new LeaderboardSync(storage,(async url=>String(url).includes('view='+view)?Response.json({error:'storage_full',message:'Storage is full right now. Your progress is kept on this device.'},{status:507}):Response.json({entries:[],player:null})) as typeof fetch);
 await expect(sync.load('snake')).rejects.toThrow('Storage is full right now. Your progress is kept on this device.');expect(sync.cached('snake')).toEqual({entries:[],player:null});sync.dispose();
});
it('notifies status consumers of capacity failures and clears the notice for another identity',async()=>{
 const storage=memory(),sync=new LeaderboardSync(storage,(async()=>Response.json({error:'storage_full'},{status:507})) as typeof fetch),status=vi.fn();
 const unsubscribe=sync.onStatus(status);sync.queue('snake',100);await expect(sync.flush()).rejects.toThrow('Storage is full');
 expect(status).toHaveBeenCalledWith('Storage is full right now. Your progress is kept on this device.');
 storage.write('accounts:session',{token:'acct_'+'b'.repeat(64),username:'Bobby'});sync.profile();expect(sync.message).toBe('');expect(status).toHaveBeenLastCalledWith('');
 unsubscribe();sync.queue('snake',200);await expect(sync.flush()).rejects.toThrow('Storage is full');expect(status).toHaveBeenCalledTimes(2);sync.dispose();
});
it('keeps account bests queued through an outage and sends each once',async()=>{const storage=memory();let available=false;const sent:any[]=[];const fetcher=vi.fn(async(_url:any,options:any)=>{if(!available)throw Error('offline');sent.push(JSON.parse(options.body));return Response.json({});});const sync=new LeaderboardSync(storage,fetcher as typeof fetch);sync.queue('snake',100);sync.queue('snake',30);sync.queue('tower',9);await expect(sync.flush()).rejects.toThrow();sync.dispose();available=true;vi.setSystemTime(Date.now()+60000);const restored=new LeaderboardSync(storage,fetcher as typeof fetch);await restored.flush();await restored.flush();expect(sent.map(s=>[s.game,s.score,s.name])).toEqual([['snake',100,'Ada'],['tower',9,'Ada']]);restored.dispose();});
it('never publishes guest scores or replays legacy guest pending scores on login',async()=>{const storage=memory(false);storage.write('leaderboard:profile',{token:'b'.repeat(64),name:'Guest'});storage.write('leaderboard:pending',{snake:900});const fetcher=vi.fn(async()=>Response.json({}));const sync=new LeaderboardSync(storage,fetcher as typeof fetch);expect(sync.profile()).toBeNull();sync.queue('snake',1000);await sync.flush();expect(fetcher).not.toHaveBeenCalled();storage.write('accounts:session',{token:'acct_'+'a'.repeat(64),username:'Ada'});await sync.flush();expect(fetcher).not.toHaveBeenCalled();sync.queue('snake',10);await sync.flush();expect(JSON.parse((fetcher.mock.calls[0] as any)[1].body).score).toBe(10);sync.dispose();});
it('rejects invalid scores and unsupported games locally',async()=>{const fetcher=vi.fn(async()=>Response.json({}));const sync=new LeaderboardSync(memory(),fetcher as typeof fetch);for(const score of [Infinity,0,-1])sync.queue('snake',score);sync.queue('globle',20);await sync.flush();expect(fetcher).not.toHaveBeenCalled();sync.dispose();});
it('retains a higher score arriving during a submission',async()=>{let release!:()=>void;const gate=new Promise<void>(r=>release=r),sent:number[]=[];const sync=new LeaderboardSync(memory(),vi.fn(async(_url:any,options:any)=>{sent.push(JSON.parse(options.body).score);if(sent.length===1)await gate;return Response.json({});}) as typeof fetch);sync.queue('snake',10);const pending=sync.flush();await Promise.resolve();sync.queue('snake',20);release();await pending;await sync.flush();expect(sent).toEqual([10,20]);sync.dispose();});
it('does not move queued scores or late acknowledgements between accounts',async()=>{const storage=memory(),calls:any[]=[];let release!:()=>void;const gate=new Promise<void>(r=>release=r);const sync=new LeaderboardSync(storage,vi.fn(async(_url:any,options:any)=>{calls.push(options);if(calls.length===1)await gate;return Response.json({});}) as typeof fetch);sync.queue('snake',100);const pending=sync.flush();await Promise.resolve();storage.write('accounts:session',{token:'acct_'+'b'.repeat(64),username:'Bobby'});sync.queue('snake',20);release();await pending;await sync.flush();expect(calls.map(c=>[c.headers.Authorization,JSON.parse(c.body).score])).toEqual([['Bearer acct_'+'a'.repeat(64),100],['Bearer acct_'+'b'.repeat(64),20]]);expect(storage.read('leaderboard:sent:account:ada',{})).toEqual({});sync.dispose();});
it('does not send queued account scores after logout even if a guest identity remains',async()=>{const storage=memory(),fetcher=vi.fn(async()=>Response.json({}));const sync=new LeaderboardSync(storage,fetcher as typeof fetch);sync.queue('snake',100);storage.write('accounts:session',null);storage.write('leaderboard:profile',{token:'b'.repeat(64),name:'Guest'});await sync.flush();expect(fetcher).not.toHaveBeenCalled();sync.dispose();});
it('keeps expired-session scores local and asks for login without marking them sent',async()=>{const storage=memory(),sync=new LeaderboardSync(storage,vi.fn(async()=>Response.json({error:'Please log in again.'},{status:401})) as typeof fetch);sync.queue('snake',100);await expect(sync.flush()).rejects.toThrow('Log in again');expect(storage.read('leaderboard:pending:account:ada',{})).toEqual({snake:100});expect(storage.read('leaderboard:sent:account:ada',{})).toEqual({});sync.dispose();});
it('notifies ranking consumers only after successful sync',async()=>{let available=false;const sync=new LeaderboardSync(memory(),vi.fn(async()=>{if(!available)throw Error('offline');return Response.json({});}) as typeof fetch),changed=vi.fn();const unsubscribe=sync.onSynced(changed);sync.queue('snake',10);await expect(sync.flush()).rejects.toThrow();expect(changed).not.toHaveBeenCalled();available=true;vi.setSystemTime(Date.now()+60000);await sync.flush();expect(changed).toHaveBeenCalledWith('snake');unsubscribe();sync.queue('snake',20);await sync.flush();expect(changed).toHaveBeenCalledTimes(1);sync.dispose();});
it('ignores malformed cached rankings',()=>{const storage=memory(false);storage.write('leaderboard:cache:snake',{entries:'corrupt',player:null});const sync=new LeaderboardSync(storage);expect(sync.cached('snake')).toBeNull();sync.dispose();});
it('asks for login on expiry and clears recovery state for a new identity',async()=>{
 const storage=memory();const sync=new LeaderboardSync(storage,vi.fn(async()=>Response.json({error:'Please log in again.'},{status:401})) as typeof fetch);
 await expect(sync.load('snake')).rejects.toThrow('Log in again');expect(sync.needsLogin).toBe(true);
 storage.write('accounts:session',{token:'acct_'+'b'.repeat(64),username:'Bobby'});sync.profile();expect(sync.needsLogin).toBe(false);sync.dispose();
});

it('ignores an old account 401 after switching to a different account',async()=>{
 const storage=memory();let release!:()=>void;const gate=new Promise<void>(r=>release=r);const sync=new LeaderboardSync(storage,vi.fn(async()=>{await gate;return Response.json({},{status:401});}) as typeof fetch);
 const pending=sync.load('snake');storage.write('accounts:session',{token:'acct_'+'b'.repeat(64),username:'Bobby'});release();await expect(pending).rejects.toThrow('Player changed');expect(sync.needsLogin).toBe(false);sync.dispose();
});

it('loads a public board without credentials and fetches personal rank privately',async()=>{
 const requests:{url:string;options:RequestInit}[]=[];const player={rank:1,playerId:'a'.repeat(64),name:'Ada',score:40};
 const sync=new LeaderboardSync(memory(),(async(url,options)=>{requests.push({url:String(url),options:options!});return Response.json(String(url).includes('view=personal')?{player}:{entries:[player]});}) as typeof fetch);
 expect(await sync.load('snake')).toEqual({entries:[player],player});const pub=requests.find(r=>r.url.includes('view=public'))!;expect(pub).toBeDefined();expect(pub.options.credentials).toBe('omit');expect(new Headers(pub.options.headers).has('Authorization')).toBe(false);expect(requests.find(r=>r.url.includes('view=personal'))?.options.cache).toBe('no-store');sync.dispose();
});
it('batches improving scores for three minutes and retains the newest score',async()=>{
 vi.useFakeTimers();try{const sent:number[]=[];const sync=new LeaderboardSync(memory(),(async(_url,options)=>{sent.push(JSON.parse(String(options?.body)).score);return Response.json({});}) as typeof fetch);sync.queue('snake',10);await vi.advanceTimersByTimeAsync(10000);expect(sent).toEqual([]);sync.queue('snake',30);await vi.advanceTimersByTimeAsync(170000);expect(sent).toEqual([30]);sync.dispose();}finally{vi.useRealTimers();}
});
it('persists Retry-After backoff across reload and suppresses premature lifecycle flushes',async()=>{
 vi.useFakeTimers();try{const storage=memory();let requests=0;const fetcher=(async()=>{requests++;return requests===1?Response.json({error:'read_only',retryable:true},{status:503,headers:{'Retry-After':'120'}}):Response.json({});}) as typeof fetch;
 const first=new LeaderboardSync(storage,fetcher);first.queue('snake',100);await expect(first.flush()).rejects.toThrow();first.dispose();const restored=new LeaderboardSync(storage,fetcher);await restored.flush();expect(requests).toBe(1);await vi.advanceTimersByTimeAsync(119999);expect(requests).toBe(1);await vi.advanceTimersByTimeAsync(1);expect(requests).toBe(2);expect(storage.read('leaderboard:pending:account:ada',{})).toEqual({});restored.dispose();}finally{vi.useRealTimers();}
});

it('increases retry delays after repeated network failures and respects an HTTP-date on 429',async()=>{
 const random=vi.spyOn(Math,'random').mockReturnValue(.5);try{const storage=memory();let requests=0;const sync=new LeaderboardSync(storage,(async()=>{requests++;if(requests<3)throw Error('offline');return Response.json({},{status:429,headers:{'Retry-After':new Date(Date.now()+120000).toUTCString()}});}) as typeof fetch);sync.queue('snake',10);await expect(sync.flush()).rejects.toThrow();expect(storage.read<any>('leaderboard:retry:account:ada',null).nextAt-Date.now()).toBe(30000);await vi.advanceTimersByTimeAsync(30000);expect(storage.read<any>('leaderboard:retry:account:ada',null).nextAt-Date.now()).toBe(60000);await vi.advanceTimersByTimeAsync(60000);expect(storage.read<any>('leaderboard:retry:account:ada',null).nextAt-Date.now()).toBeGreaterThanOrEqual(119000);await sync.flush();expect(requests).toBe(3);expect(storage.read('leaderboard:pending:account:ada',{})).toEqual({snake:10});sync.dispose();}finally{random.mockRestore();}
});
it('does not submit a scheduled batch in a hidden tab and retries after it becomes visible',async()=>{
 const doc=Object.assign(new EventTarget(),{hidden:false});vi.stubGlobal('document',doc);try{const scores:number[]=[];const sync=new LeaderboardSync(memory(),(async(_url,options)=>{scores.push(JSON.parse(String(options?.body)).score);return Response.json({});}) as typeof fetch);sync.queue('snake',10);doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));await sync.flush();expect(scores).toEqual([]);await vi.advanceTimersByTimeAsync(180000);expect(scores).toEqual([]);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(180000);expect(scores).toEqual([10]);sync.dispose();}finally{vi.unstubAllGlobals();}
});

it('parks only a game whose board is not open yet, keeps its score queued and still sends the other games',async()=>{
 const storage=memory();let open=false;const calls:string[]=[];
 const fetcher=vi.fn(async(_url:any,options:any)=>{const {game}=JSON.parse(options.body);calls.push(game);
  if(game==='claimline'&&!open)return Response.json({error:'This leaderboard opens soon.',code:LEADERBOARD_NOT_OPEN},{status:409});return Response.json({});});
 const sync=new LeaderboardSync(storage,fetcher as typeof fetch),synced=vi.fn();sync.onSynced(synced);
 sync.queue('claimline',1234);sync.queue('snake',50);
 await expect(sync.flush()).resolves.toBeUndefined(); // no error for the UI to show
 expect(calls).toEqual(['claimline','snake']);
 expect(storage.read('leaderboard:pending:account:ada',{})).toEqual({claimline:1234});
 expect(storage.read('leaderboard:sent:account:ada',{})).toEqual({snake:50});
 expect(storage.read('leaderboard:retry:account:ada',{attempt:0,nextAt:0})).toEqual({attempt:0,nextAt:0}); // no shared outage backoff
 expect(synced).toHaveBeenCalledWith('snake');expect(synced).not.toHaveBeenCalledWith('claimline');
 // Parked: other games keep syncing immediately and the parked game is not posted again yet.
 sync.queue('tower',9);await sync.flush();expect(calls).toEqual(['claimline','snake','tower']);
 sync.queue('claimline',1500);await sync.flush();expect(calls).toEqual(['claimline','snake','tower']);
 expect(storage.read('leaderboard:pending:account:ada',{})).toEqual({claimline:1500});
 // Once the migration lands the next quiet retry delivers the latest queued best, with no code change.
 open=true;vi.setSystemTime(Date.now()+NOT_OPEN_RETRY_MS+1);await sync.flush();
 expect(calls).toEqual(['claimline','snake','tower','claimline']);
 expect(JSON.parse((fetcher.mock.calls.at(-1) as any)[1].body)).toMatchObject({game:'claimline',score:1500});
 expect(storage.read('leaderboard:pending:account:ada',{})).toEqual({});
 expect(synced).toHaveBeenCalledWith('claimline');
 sync.dispose();
});

it('retries a parked game on its own timer and a fresh page load retries straight away',async()=>{
 const storage=memory();let open=false;const calls:string[]=[];
 const fetcher=vi.fn(async(_url:any,options:any)=>{calls.push(JSON.parse(options.body).game);return open?Response.json({}):Response.json({code:LEADERBOARD_NOT_OPEN},{status:409});});
 const sync=new LeaderboardSync(storage,fetcher as typeof fetch);sync.queue('claimline',700);await sync.flush();expect(calls).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(NOT_OPEN_RETRY_MS-1000);expect(calls).toHaveLength(1); // no batch-interval polling while parked
 open=true;await vi.advanceTimersByTimeAsync(2000);expect(calls).toHaveLength(2);
 expect(storage.read('leaderboard:pending:account:ada',{})).toEqual({});sync.dispose();
 // A new session (page load) is not parked: it tries the stored pending score at once.
 const later=memory();later.write('leaderboard:pending:account:ada',{claimline:900});
 const seen:string[]=[];const again=new LeaderboardSync(later,vi.fn(async(_u:any,o:any)=>{seen.push(JSON.parse(o.body).game);return Response.json({});}) as typeof fetch);
 await again.flush();expect(seen).toEqual(['claimline']);again.dispose();
});

it('treats other failures exactly as before: a 409 without the not-open code and a 503 still back off and report',async()=>{
 for(const response of [()=>Response.json({error:'conflict'},{status:409}),()=>Response.json({error:'down'},{status:503})]){
  const storage=memory();const sync=new LeaderboardSync(storage,vi.fn(async()=>response()) as typeof fetch);
  sync.queue('claimline',10);sync.queue('snake',5);
  await expect(sync.flush()).rejects.toThrow('Scores are saved here');
  expect(storage.read<any>('leaderboard:retry:account:ada',{attempt:0}).attempt).toBe(1);
  expect(storage.read('leaderboard:pending:account:ada',{})).toEqual({claimline:10,snake:5});sync.dispose();
 }
});
