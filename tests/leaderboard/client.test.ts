import {it,expect,vi} from 'vitest';
import {LeaderboardSync} from '../../src/leaderboard/client';
function memory(){const map=new Map<string,unknown>();return {read:<T>(key:string,fallback:T)=>(map.get(key)??fallback) as T,write:(key:string,value:unknown)=>{map.set(key,structuredClone(value));return true;}};}
it('keeps best scores queued during an outage and synchronizes once without lowering them',async()=>{
 const storage=memory();let available=false;const sent:any[]=[];
 const fetcher=vi.fn(async(_url:any,options:any)=>{if(!available)throw new Error('offline');sent.push(JSON.parse(options.body));return Response.json({entries:[],player:null});});
 const sync=new LeaderboardSync(storage,fetcher as typeof fetch);
 sync.join('Ada');sync.queue('snake',100);sync.queue('snake',30);sync.queue('tower',9);
 await expect(sync.flush()).rejects.toThrow();
 sync.dispose();available=true;
 const restored=new LeaderboardSync(storage,fetcher as typeof fetch);await restored.flush();
 expect(sent.map(s=>[s.game,s.score,s.name])).toEqual([['snake',100,'Ada'],['tower',9,'Ada']]);
 await restored.flush();expect(sent).toHaveLength(2);restored.dispose();
});
it('does not publish until the player joins, and rejects unsupported games and invalid scores',async()=>{
 const fetcher=vi.fn(async()=>Response.json({entries:[],player:null}));const sync=new LeaderboardSync(memory(),fetcher as typeof fetch);
 sync.queue('snake',100);await sync.flush();expect(fetcher).not.toHaveBeenCalled();
 sync.join('Ada');sync.queue('globle',100);sync.queue('snake',Infinity);sync.queue('snake',0);await sync.flush();expect(fetcher).not.toHaveBeenCalled();sync.dispose();
});
it('retains a higher score that arrives while an older submission is in flight',async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);const sent:number[]=[];
 const fetcher=vi.fn(async(_url:any,options:any)=>{sent.push(JSON.parse(options.body).score);if(sent.length===1)await gate;return Response.json({entries:[],player:null});});
 const sync=new LeaderboardSync(memory(),fetcher as typeof fetch);sync.join('Ada');sync.queue('snake',10);
 const pending=sync.flush();await Promise.resolve();sync.queue('snake',20);release();await pending;await sync.flush();
 expect(sent).toEqual([10,20]);sync.dispose();
});
it('ignores malformed saved rankings instead of breaking the offline dialog',()=>{
 const storage=memory();storage.write('leaderboard:cache:snake',{entries:'corrupt',player:null});
 const sync=new LeaderboardSync(storage);expect(sync.cached('snake')).toBeNull();sync.dispose();
});
it('notifies visible ranking consumers only after a successful score sync and supports unsubscribe',async()=>{
 let available=false;const sync=new LeaderboardSync(memory(),vi.fn(async()=>{if(!available)throw Error('offline');return Response.json({});}) as typeof fetch);
 const changed=vi.fn();expect(typeof sync.onSynced).toBe('function');const unsubscribe=sync.onSynced(changed);
 sync.join('Ada');sync.queue('snake',10);await expect(sync.flush()).rejects.toThrow();expect(changed).not.toHaveBeenCalled();
 available=true;await sync.flush();expect(changed).toHaveBeenCalledWith('snake');
 unsubscribe();sync.queue('snake',20);await sync.flush();expect(changed).toHaveBeenCalledTimes(1);sync.dispose();
});
it('uses the account identity without importing guest pending scores and ignores late guest responses',async()=>{
 const storage=memory();const calls:any[]=[];let release!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve);
 const sync=new LeaderboardSync(storage,vi.fn(async(_url:any,options:any)=>{calls.push(options);if(calls.length===1)await gate;return Response.json({entries:[],player:null});}) as typeof fetch);
 sync.join('Guest');sync.queue('snake',900);const pending=sync.flush();await Promise.resolve();
 storage.write('accounts:session',{token:'acct_'+'a'.repeat(64),username:'Account'});
 expect(sync.profile()?.name).toBe('Account');
 sync.queue('snake',10);release();await pending;await sync.flush();
 expect(calls).toHaveLength(2);expect(calls[1].headers.Authorization).toBe('Bearer acct_'+'a'.repeat(64));
 expect(JSON.parse(calls[1].body).score).toBe(10);sync.dispose();
});
