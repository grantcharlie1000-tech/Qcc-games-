import {it,expect,vi} from 'vitest';
import {MovieStorage,MOVIES_KEY} from '../../src/movies/storage';
import {AccountMovieStorage} from '../../src/movies/account-storage';
const snapshot={id:'movie-1',kind:'movie' as const,name:'One',year:2000,poster:'https://image.tmdb.org/t/p/w500/one.jpg'};
const token='acct_'+'a'.repeat(64);
const fake=(values=new Map<string,string>())=>({getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k),key:(n:number)=>[...values.keys()][n]??null,get length(){return values.size;}} as unknown as Storage);
const empty={entries:{},cleared:0};
const cloud=(time=75,updated=1000)=>({entries:{'movie-1':{time,updated,snapshot}},cleared:0});
it('without safe migration capability, loads account progress without attaching guest history to another account',async()=>{
 const local=fake();new MovieStorage(()=>local).progress('movie-2',42,undefined,{...snapshot,id:'movie-2'});
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>Response.json(init?.headers&&new Headers(init.headers).get('authorization')==='Bearer '+token?cloud():empty));
 const one=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);
 await one.account!.sync();expect(one.data.progress['movie-1']).toBe(75);expect(one.data.progress['movie-2']).toBeUndefined();
 const two=new AccountMovieStorage({username:'Two',token:'acct_'+'b'.repeat(64)},()=>local,fetcher as typeof fetch);await two.account!.sync();
 expect(two.continueItems()).toEqual([]);expect(new MovieStorage(()=>local).data.progress['movie-2']).toBe(42);
 one.account!.dispose();two.account!.dispose();
});
it('durably retries only this account changes after network failure and keeps completion tombstones',async()=>{
 const local=fake(),fetcher=vi.fn(async()=>{throw new Error('offline');});
 const first=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);
 first.progress('movie-1',0,100,snapshot);await first.account!.sync();first.account!.dispose();
 let sent:any;const online=vi.fn(async(_url:unknown,init?:RequestInit)=>{sent=JSON.parse(init!.body as string);return Response.json(sent);});
 const again=new AccountMovieStorage({username:'One',token},()=>local,online as typeof fetch);await again.account!.sync();
 expect(sent.entries['movie-1']).toMatchObject({time:0,snapshot});expect(again.continueItems()).toEqual([]);again.account!.dispose();
});
it('keeps playback saved during a request and ignores a result after account disposal',async()=>{
 const local=fake();let done!:(r:Response)=>void;
 const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{done=resolve;}));
 const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);
 const syncing=s.account!.sync();s.progress('movie-1',120,500,snapshot);done(Response.json(cloud()));await syncing;
 expect(s.data.progress['movie-1']).toBe(120);
 const waiting=s.account!.sync();s.account!.dispose();done(Response.json(cloud(999,Date.now()+1)));await waiting;
 expect(s.data.progress['movie-1']).toBe(120);
});
it('without safe migration capability, manual Add keeps the original device copy intact',async()=>{
 const local=fake();new MovieStorage(()=>local).progress('movie-1',42,100,snapshot);
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>Response.json(init?.body?JSON.parse(init.body as string):empty));
 const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);await s.account!.sync();
 expect(s.account!.hasDeviceHistory()).toBe(true);expect(s.continueItems()).toEqual([]);
 await s.account!.importDeviceHistory();await s.account!.sync();expect(s.data.progress['movie-1']).toBe(42);
 expect(JSON.parse(local.getItem(MOVIES_KEY)!).progress['movie-1']).toBe(42);s.account!.dispose();
});
it('clear removes account progress and queues a tombstone without clearing guest history',async()=>{
 const local=fake();new MovieStorage(()=>local).progress('movie-2',50,100,{...snapshot,id:'movie-2'});
 let sent:any;const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{sent=init?.body?JSON.parse(init.body as string):cloud();return Response.json(sent);});
 const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);await s.account!.sync();s.clear();await s.account!.sync();
 expect(sent.cleared).toBeGreaterThan(0);expect(sent.entries).toEqual({});expect(s.continueItems()).toEqual([]);
 expect(new MovieStorage(()=>local).data.progress['movie-2']).toBe(50);s.account!.dispose();
});
it('records two positions even within the same clock tick',async()=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(10000),local=fake();let server:any=empty;
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{if(init?.body){const body=JSON.parse(init.body as string);for(const [key,entry] of Object.entries(body.entries) as [string,any][]){if(!server.entries[key]||entry.updated>server.entries[key].updated)server={entries:{...server.entries,[key]:entry},cleared:0};}}return Response.json(server);});
 const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);s.progress('movie-1',20,100,snapshot);await s.account!.sync();s.progress('movie-1',30,100,snapshot);await s.account!.sync();expect(s.data.progress['movie-1']).toBe(30);s.account!.dispose();clock.mockRestore();
});
it('does not import older device history over a newer cloud position',async()=>{
 const local=fake(),clock=vi.spyOn(Date,'now');clock.mockReturnValue(1000);new MovieStorage(()=>local).progress('movie-1',42,100,snapshot);clock.mockReturnValue(3000);
 const fetcher=vi.fn(async()=>Response.json(cloud(90,2000)));
 const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);await s.account!.importDeviceHistory();await s.account!.sync();expect(s.data.progress['movie-1']).toBe(90);s.account!.dispose();clock.mockRestore();
});
it('clear removes a synced position whose clock is slightly ahead',async()=>{
 const local=fake(),future=Date.now()+30000;let server:any=cloud(90,future);
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{if(init?.body){const sent=JSON.parse(init.body as string);if(sent.cleared>=future)server={entries:{},cleared:sent.cleared};}return Response.json(server);});
 const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);await s.account!.sync();s.clear();await s.account!.sync();expect(s.continueItems()).toEqual([]);s.account!.dispose();
});
it('a delayed GET cannot roll back another tab acknowledged completion',async()=>{
 const local=fake();let respond!:(r:Response)=>void;const older=cloud(90,1000);
 const slow=new AccountMovieStorage({username:'One',token},()=>local,vi.fn(()=>new Promise<Response>(r=>{respond=r;})) as typeof fetch);const waiting=slow.account!.sync();
 const fresh=new AccountMovieStorage({username:'One',token},()=>local,vi.fn(async(_url:unknown,init?:RequestInit)=>Response.json(init?.body?JSON.parse(init.body as string):empty)) as typeof fetch);fresh.progress('movie-1',0,100,snapshot);await fresh.account!.sync();
 respond(Response.json(older));await waiting;expect(slow.continueItems()).toEqual([]);fresh.account!.dispose();slow.account!.dispose();
});
it('a full account keeps new titles locally without blocking updates to saved titles',async()=>{
 const local=fake();let server=cloud(90,1000);
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{if(!init?.body)return Response.json(server);const sent=JSON.parse(init.body as string);if(Object.keys(sent.entries).some(k=>k!=='movie-1'))return Response.json({error:'full'},{status:413});server={...server,entries:{...server.entries,...sent.entries}};return Response.json(server);});
 const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);await s.account!.sync();s.progress('movie-2',42,100,{...snapshot,id:'movie-2'});s.progress('movie-1',120,100,snapshot);await s.account!.sync();
 expect(server.entries['movie-1'].time).toBe(120);expect(s.data.progress['movie-2']).toBe(42);expect(s.account!.status).toContain('full');s.account!.dispose();
});
it('retains more than one upload batch of pending positions across reloads',async()=>{
 const local=fake(),offline=vi.fn(async()=>{throw new Error('offline');});const s=new AccountMovieStorage({username:'One',token},()=>local,offline as typeof fetch);
 for(let n=1;n<=201;n++)s.progress('movie-'+n,n,1000,{...snapshot,id:'movie-'+n});s.account!.dispose();
 const accepted=new Set<string>(),online=vi.fn(async(_url:unknown,init?:RequestInit)=>{const sent=JSON.parse(init!.body as string);for(const key of Object.keys(sent.entries))accepted.add(key);return Response.json(sent);});
 const reloaded=new AccountMovieStorage({username:'One',token},()=>local,online as typeof fetch);for(let n=0;n<5;n++)await reloaded.account!.sync();expect(accepted.size).toBe(201);reloaded.account!.dispose();
});

it('journals concurrent writes so a closing tab cannot lose an unrelated title',async()=>{
 const values=new Map<string,string>();const storage=fake(values);let interleave=false,second:AccountMovieStorage;
 const wrapped={getItem:storage.getItem,setItem:(k:string,v:string)=>{if(interleave&&k.endsWith(':account:one')){interleave=false;second.progress('movie-2',60,100,{...snapshot,id:'movie-2'});second.account!.dispose();}storage.setItem(k,v);},removeItem:storage.removeItem,key:storage.key,get length(){return storage.length;}} as Storage;
 const offline=vi.fn(async()=>{throw new Error('offline');}),first=new AccountMovieStorage({username:'One',token},()=>wrapped,offline as typeof fetch);second=new AccountMovieStorage({username:'One',token},()=>storage,offline as typeof fetch);
 interleave=true;first.progress('movie-1',30,100,snapshot);first.account!.dispose();
 let sent:any;const restored=new AccountMovieStorage({username:'One',token},()=>storage,vi.fn(async(_url:unknown,init?:RequestInit)=>{sent=JSON.parse(init!.body as string);return Response.json(sent);}) as typeof fetch);await restored.account!.sync();expect(Object.keys(sent.entries).sort()).toEqual(['movie-1','movie-2']);restored.account!.dispose();
});
it('a full account still updates an existing title behind fifty rejected additions',async()=>{
 const local=fake();let server=cloud(90,1000);const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{if(!init?.body)return Response.json(server);const sent=JSON.parse(init.body as string);if(Object.keys(sent.entries).some(k=>k!=='movie-1'))return Response.json({error:'full'},{status:413});server={...server,entries:{...server.entries,...sent.entries}};return Response.json(server);});
 const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);await s.account!.sync();for(let n=2;n<=55;n++)s.progress('movie-'+n,42,100,{...snapshot,id:'movie-'+n});s.progress('movie-1',180,200,snapshot);await s.account!.sync();expect(server.entries['movie-1'].time).toBe(180);s.account!.dispose();
});
it('an acknowledged clear watermark does not remain queued during a later flush',async()=>{
 const local=fake();const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>Response.json(init?.body?JSON.parse(init.body as string):empty));
 const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);s.clear();await s.account!.flush();fetcher.mockClear();await s.account!.flush();expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1]?.method).toBe('GET');s.account!.dispose();
});
const serialMigrationLock=()=>{let tail=Promise.resolve();return (work:()=>Promise<void>)=>{const next=tail.then(work);tail=next.catch(()=>{});return next;};};
it('automatically merges the first account once and keeps its source snapshot owned across switches',async()=>{
 const local=fake(),clock=vi.spyOn(Date,'now').mockReturnValue(1000);new MovieStorage(()=>local).progress('movie-1',42,100,snapshot);clock.mockReturnValue(5000);const lock=serialMigrationLock();
 const states:Record<string,any>={};const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{const who=new Headers(init?.headers).get('Authorization')!;let state=states[who]??empty;if(init?.body){const sent=JSON.parse(init.body as string);state={entries:{...state.entries,...sent.entries},cleared:0};states[who]=state;}return Response.json(state);});
 const one=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch,lock);await one.account!.sync();await one.account!.flush();expect(one.data.progress['movie-1']).toBe(42);expect(one.data.meta['movie-1'].updated).toBe(1000);one.account!.dispose();
 new MovieStorage(()=>local).progress('movie-2',60,100,{...snapshot,id:'movie-2'});
 const other=new AccountMovieStorage({username:'Other',token:'acct_'+'b'.repeat(64)},()=>local,fetcher as typeof fetch,lock);await other.account!.sync();expect(other.continueItems()).toEqual([]);expect(other.account!.status).toContain('another account');other.account!.dispose();
 const back=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch,lock);await back.account!.sync();expect(back.data.progress['movie-2']).toBeUndefined();expect(new MovieStorage(()=>local).data.progress['movie-1']).toBe(42);back.account!.dispose();clock.mockRestore();
});
it('serializes first-account claims across tabs so only one account receives guest history',async()=>{
 const local=fake(),lock=serialMigrationLock();new MovieStorage(()=>local).progress('movie-1',42,100,snapshot);const sent:string[]=[];
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{if(init?.body){sent.push(new Headers(init.headers).get('Authorization')!);return Response.json(JSON.parse(init.body as string));}return Response.json(empty);});
 const one=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch,lock),other=new AccountMovieStorage({username:'Other',token:'acct_'+'b'.repeat(64)},()=>local,fetcher as typeof fetch,lock);await Promise.all([one.account!.sync(),other.account!.sync()]);await Promise.all([one.account!.flush(),other.account!.flush()]);expect(new Set(sent).size).toBe(1);expect([one,other].filter(s=>s.continueItems().length>0)).toHaveLength(1);one.account!.dispose();other.account!.dispose();
});
it('does not claim or upload history when refresh fails, storage cannot claim, or the identity closes',async()=>{
 const local=fake(),lock=serialMigrationLock();new MovieStorage(()=>local).progress('movie-1',42,100,snapshot);const offline=vi.fn(async()=>{throw new Error('offline');});const first=new AccountMovieStorage({username:'One',token},()=>local,offline as typeof fetch,lock);await first.account!.sync();expect(local.getItem('qcc:movies:v1:cloud-migration:v1')).toBeNull();first.account!.dispose();
 const blocked={getItem:local.getItem,key:local.key,removeItem:local.removeItem,get length(){return local.length;},setItem:(k:string,v:string)=>{if(k==='qcc:movies:v1:cloud-migration:v1')throw new Error('quota');local.setItem(k,v);}} as Storage;
 const online=vi.fn(async(_url:unknown,init?:RequestInit)=>Response.json(init?.body?JSON.parse(init.body as string):empty));const second=new AccountMovieStorage({username:'One',token},()=>blocked,online as typeof fetch,lock);await second.account!.sync();expect(online.mock.calls.every(c=>!c[1]?.body)).toBe(true);expect(second.continueItems()).toEqual([]);second.account!.dispose();
 let respond!:(r:Response)=>void;const waiting=new AccountMovieStorage({username:'One',token},()=>local,vi.fn(()=>new Promise<Response>(r=>{respond=r;})) as typeof fetch,lock);const sync=waiting.account!.sync();waiting.account!.dispose();respond(Response.json(empty));await sync;expect(local.getItem('qcc:movies:v1:cloud-migration:v1')).toBeNull();
});
it('resumes only the claimed snapshot after a failed journal write, not later guest activity',async()=>{
 const local=fake(),lock=serialMigrationLock();new MovieStorage(()=>local).progress('movie-1',42,100,snapshot);let rejectJournal=true;const store={getItem:local.getItem,key:local.key,removeItem:local.removeItem,get length(){return local.length;},setItem:(k:string,v:string)=>{if(rejectJournal&&k.includes(':pending:'))throw new Error('quota');local.setItem(k,v);}} as Storage;
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>Response.json(init?.body?JSON.parse(init.body as string):empty));const first=new AccountMovieStorage({username:'One',token},()=>store,fetcher as typeof fetch,lock);await first.account!.sync();first.account!.dispose();expect(JSON.parse(local.getItem('qcc:movies:v1:cloud-migration:v1')!).done).toBe(false);
 new MovieStorage(()=>local).progress('movie-2',60,100,{...snapshot,id:'movie-2'});rejectJournal=false;
 const again=new AccountMovieStorage({username:'One',token},()=>store,fetcher as typeof fetch,lock);await again.account!.sync();await again.account!.flush();expect(again.data.progress['movie-1']).toBe(42);expect(again.data.progress['movie-2']).toBeUndefined();expect(JSON.parse(local.getItem('qcc:movies:v1:cloud-migration:v1')!).done).toBe(true);again.account!.dispose();
});

it('automatic merge keeps original timestamps so a newer cloud write arriving after refresh wins',async()=>{
 const local=fake(),clock=vi.spyOn(Date,'now').mockReturnValue(1000);new MovieStorage(()=>local).progress('movie-1',42,100,snapshot);clock.mockReturnValue(4000);let sent:any;
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{if(!init?.body)return Response.json(empty);sent=JSON.parse(init.body as string);return Response.json(cloud(120,3000));});
 const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch,serialMigrationLock());await s.account!.sync();await s.account!.flush();expect(sent.entries['movie-1'].updated).toBe(1000);expect(s.data.progress['movie-1']).toBe(120);s.account!.dispose();clock.mockRestore();
});
it('automatic merge adopts newer local progress but protects newer cloud completion and clear',async()=>{
 const local=fake(),clock=vi.spyOn(Date,'now').mockReturnValue(2000),guest=new MovieStorage(()=>local);guest.progress('movie-1',42,100,snapshot);guest.progress('movie-2',60,100,{...snapshot,id:'movie-2'});clock.mockReturnValue(5000);let server:any={entries:{'movie-1':{time:10,updated:1000,snapshot},'movie-2':{time:0,updated:3000,snapshot:{...snapshot,id:'movie-2'}}},cleared:0};
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{if(init?.body){const sent=JSON.parse(init.body as string);server={...server,entries:{...server.entries,...sent.entries}};}return Response.json(server);});const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch,serialMigrationLock());await s.account!.sync();await s.account!.flush();expect(s.data.progress['movie-1']).toBe(42);expect(s.data.meta['movie-1'].updated).toBe(2000);expect(s.data.progress['movie-2']).toBe(0);s.account!.dispose();
 const clearedLocal=fake();clearedLocal.setItem(MOVIES_KEY,local.getItem(MOVIES_KEY)!);const calls=vi.fn(async(_url:unknown,_init?:RequestInit)=>Response.json({entries:{},cleared:3000}));const cleared=new AccountMovieStorage({username:'One',token},()=>clearedLocal,calls as typeof fetch,serialMigrationLock());await cleared.account!.sync();await cleared.account!.flush();expect(cleared.continueItems()).toEqual([]);expect(calls.mock.calls.every(c=>!c[1]?.body)).toBe(true);cleared.account!.dispose();clock.mockRestore();
});
it('an empty first signed-in boot claims an empty snapshot so later guests cannot be attributed to another account',async()=>{
 const local=fake(),lock=serialMigrationLock(),fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>Response.json(init?.body?JSON.parse(init.body as string):empty));const one=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch,lock);await one.account!.sync();one.account!.dispose();expect(JSON.parse(local.getItem('qcc:movies:v1:cloud-migration:v1')!)).toMatchObject({owner:'one',done:true,snapshot:{entries:{},cleared:0}});
 new MovieStorage(()=>local).progress('movie-1',42,100,snapshot);const other=new AccountMovieStorage({username:'Other',token},()=>local,fetcher as typeof fetch,lock);await other.account!.sync();expect(other.continueItems()).toEqual([]);expect(fetcher.mock.calls.every(c=>!c[1]?.body)).toBe(true);other.account!.dispose();
});
it('manual Add remains available for a newer same-title device position when automatic locking is unavailable',async()=>{
 const local=fake(),clock=vi.spyOn(Date,'now').mockReturnValue(2000);new MovieStorage(()=>local).progress('movie-1',42,100,snapshot);clock.mockReturnValue(5000);let server=cloud(10,1000);const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{if(init?.body)server=JSON.parse(init.body as string);return Response.json(server);});const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch);await s.account!.sync();expect(s.account!.hasDeviceHistory()).toBe(true);await s.account!.importDeviceHistory();await s.account!.flush();expect(s.data.progress['movie-1']).toBe(42);expect(s.data.meta['movie-1'].updated).toBe(2000);s.account!.dispose();clock.mockRestore();
});
it('clears a transient automatic migration failure notice after a successful retry',async()=>{
 const local=fake();new MovieStorage(()=>local).progress('movie-1',42,100,snapshot);let fail=true;const lock=async(work:()=>Promise<void>)=>{if(fail)throw new Error('lock unavailable');await work();};const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>Response.json(init?.body?JSON.parse(init.body as string):empty));const s=new AccountMovieStorage({username:'One',token},()=>local,fetcher as typeof fetch,lock);await s.account!.sync();expect(s.account!.status).toContain('Add device history');fail=false;await s.account!.sync();await s.account!.flush();expect(s.data.progress['movie-1']).toBe(42);expect(s.account!.status).not.toContain('Add device history');s.account!.dispose();
});
it('completes a claimed migration after cloud acknowledgement even when journal storage stays full',async()=>{
 const local=fake(),lock=serialMigrationLock();new MovieStorage(()=>local).progress('movie-1',42,100,snapshot);let journalAttempts=0,state:any=empty;const store={getItem:local.getItem,key:local.key,removeItem:local.removeItem,get length(){return local.length;},setItem:(k:string,v:string)=>{if(k.includes(':pending:')){journalAttempts++;throw new Error('quota');}local.setItem(k,v);}} as Storage;
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{if(init?.body)state=JSON.parse(init.body as string);return Response.json(state);});const s=new AccountMovieStorage({username:'One',token},()=>store,fetcher as typeof fetch,lock);await s.account!.sync();await s.account!.flush();await s.account!.sync();expect(state.entries['movie-1'].time).toBe(42);expect(JSON.parse(local.getItem('qcc:movies:v1:cloud-migration:v1')!).done).toBe(true);expect(journalAttempts).toBe(1);s.account!.dispose();
});
