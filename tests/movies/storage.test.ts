import {it,expect,vi} from 'vitest';
import {MovieStorage,MOVIES_KEY,snapshotOf,keepsResume} from '../../src/movies/storage';
import type {Title} from '../../src/movies/model';
const fake=(values=new Map<string,string>())=>({getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)} as unknown as Storage);
const remote:Title={id:'movie-157336',kind:'movie',name:'Interstellar',year:2014,genres:['Science Fiction'],overview:'A team travels through a wormhole.',poster:'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',seasons:[]};
it('keeps list and progress local under a separate key',()=>{
 const values=new Map<string,string>();
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)} as unknown as Storage;
 const s=new MovieStorage(()=>storage);s.toggle('movie-1');s.progress('movie-1',42);
 expect([...values.keys()]).toEqual([MOVIES_KEY]);
 expect(new MovieStorage(()=>storage).data).toMatchObject({list:['movie-1'],progress:{'movie-1':42}});
 s.clear();expect(s.data).toEqual({list:[],progress:{},titles:{},meta:{}});
});
it('retains changes in memory when storage is blocked',()=>{
 const s=new MovieStorage(()=>{throw new Error('blocked');});s.toggle('movie-1');s.progress('movie-1',10);
 expect(s.durable).toBe(false);expect(s.data.list).toEqual(['movie-1']);expect(s.data.progress['movie-1']).toBe(10);
});
it('loads the earlier list and progress shape without snapshots or a server',()=>{
 const s=new MovieStorage(()=>fake(new Map([[MOVIES_KEY,JSON.stringify({list:['movie-1'],progress:{'movie-1':42}})]])));
 expect(s.data).toMatchObject({list:['movie-1'],progress:{'movie-1':42}});
 expect(s.snapshot('movie-1')).toBeUndefined();expect(s.data.provider).toBeUndefined();expect(s.durable).toBe(true);
});
it('keeps a snapshot for a listed remote title across reloads',()=>{
 const values=new Map<string,string>(),storage=fake(values);
 new MovieStorage(()=>storage).toggle(remote.id,snapshotOf(remote));
 expect(new MovieStorage(()=>storage).snapshot(remote.id)).toEqual({id:'movie-157336',kind:'movie',name:'Interstellar',year:2014,poster:remote.poster,backdrop:remote.backdrop});
});
it('drops invalid snapshots, meta and unknown servers when loading',()=>{
 const stored={list:['movie-1','movie-2','movie-5'],progress:{'movie-1':5},provider:'unknown',
  titles:{
   'movie-1':{id:'movie-1',kind:'movie',name:'One',year:2001,poster:'https://image.tmdb.org/t/p/w185/a.jpg'},
   'movie-2':{id:'movie-2',kind:'movie',name:'Two',year:2002,poster:'javascript:alert(1)'},
   'movie-3':{id:'movie-3',kind:'movie',name:'Three',year:2003,poster:'https://image.tmdb.org/t/p/w185/c.jpg'},
   'tv-4':{id:'tv-4',kind:'movie',name:'Four',year:2004,poster:'https://image.tmdb.org/t/p/w185/d.jpg'},
   'movie-5':{id:'movie-5',kind:'movie',name:'Five',year:2005,poster:'https://image.tmdb.org/t/p/w185/e.jpg',backdrop:'https://example.test/e.jpg'}},
  meta:{'movie-1':{duration:6000,updated:9},'movie-2':{duration:-5,updated:1},'movie-3':{updated:'soon'},'bad key':{updated:2}}};
 const s=new MovieStorage(()=>fake(new Map([[MOVIES_KEY,JSON.stringify(stored)]])));
 expect(Object.keys(s.data.titles)).toEqual(['movie-1']);
 expect(s.data.meta).toEqual({'movie-1':{duration:6000,updated:9}});
 expect(s.data.provider).toBeUndefined();
});
it('orders continue items newest first and reads episode keys',()=>{
 const clock=vi.spyOn(Date,'now'),s=new MovieStorage(()=>fake());
 clock.mockReturnValue(1000);s.progress('movie-1',100,7200);
 clock.mockReturnValue(3000);s.progress('tv-19885:s1:e2',50,2400);
 clock.mockReturnValue(2000);s.progress('tv-7:s2:e4',30);s.progress('tv-19885:s1:e3',0);
 clock.mockRestore();
 expect(s.continueItems()).toEqual([
  {key:'tv-19885:s1:e2',id:'tv-19885',season:1,episode:2,time:50,duration:2400,updated:3000},
  {key:'tv-7:s2:e4',id:'tv-7',season:2,episode:4,time:30,updated:2000},
  {key:'movie-1',id:'movie-1',time:100,duration:7200,updated:1000}]);
});
it('clear removes list, progress, snapshots, meta and server',()=>{
 const values=new Map<string,string>(),storage=fake(values),s=new MovieStorage(()=>storage);
 s.toggle(remote.id,snapshotOf(remote));s.progress(remote.id,42,8640);s.setProvider('vidlink');
 s.clear();
 expect(s.data).toEqual({list:[],progress:{},titles:{},meta:{}});
 expect(new MovieStorage(()=>storage).data).toEqual({list:[],progress:{},titles:{},meta:{}});
});
it('blocked storage keeps snapshots and the server in memory and reports durable=false',()=>{
 const s=new MovieStorage(()=>{throw new Error('blocked');});
 s.toggle(remote.id,snapshotOf(remote));s.setProvider('vidlink');
 expect(s.durable).toBe(false);expect(s.snapshot(remote.id)).toEqual(snapshotOf(remote));expect(s.data.provider).toBe('vidlink');
});
it('forgets a snapshot once its title leaves the list without progress',()=>{
 const s=new MovieStorage(()=>fake());
 s.toggle(remote.id,snapshotOf(remote));s.toggle(remote.id);
 expect(s.snapshot(remote.id)).toBeUndefined();
 s.progress(remote.id,30,8640,snapshotOf(remote));
 expect(s.snapshot(remote.id)).toEqual(snapshotOf(remote));
});
// Only unlisted snapshots count toward the cap. Each title here is in progress, so its snapshot is live but not listed.
it('keeps at most 200 unlisted snapshots, dropping the oldest',()=>{
 const s=new MovieStorage(()=>fake());
 for(let n=1;n<=201;n++)s.progress(`movie-${n}`,30,undefined,snapshotOf({...remote,id:`movie-${n}`,name:`Film ${n}`}));
 expect(Object.keys(s.data.titles)).toHaveLength(200);
 expect(s.snapshot('movie-1')).toBeUndefined();
 expect(s.snapshot('movie-201')?.name).toBe('Film 201');
});
// A listed title is never evicted: My list must render it however many other titles were opened.
it('never evicts the snapshot of a listed title, even when it is the oldest of 201',()=>{
 const s=new MovieStorage(()=>fake());
 s.toggle('movie-1',snapshotOf({...remote,id:'movie-1',name:'Listed Film'}));
 for(let n=2;n<=201;n++)s.progress(`movie-${n}`,30,undefined,snapshotOf({...remote,id:`movie-${n}`,name:`Film ${n}`}));
 expect(s.snapshot('movie-1')?.name).toBe('Listed Film');
 expect(s.data.list).toEqual(['movie-1']);
 expect(Object.keys(s.data.titles)).toHaveLength(201);
 s.progress('movie-202',30,undefined,snapshotOf({...remote,id:'movie-202',name:'Film 202'}));
 expect(s.snapshot('movie-2')).toBeUndefined();
 expect(s.snapshot('movie-1')?.name).toBe('Listed Film');
});
// A position of zero is not progress, so it keeps no snapshot alive.
it('does not keep a snapshot alive for a zero position',()=>{
 const s=new MovieStorage(()=>fake());
 s.progress(remote.id,0,8640,snapshotOf(remote));
 expect(s.snapshot(remote.id)).toBeUndefined();
});
it('keeps the valid list entries and drops only the invalid one when loading',()=>{
 const values=new Map([[MOVIES_KEY,JSON.stringify({list:['movie-1',5,'movie-2',{id:'movie-3'}],progress:{}})]]);
 const s=new MovieStorage(()=>fake(values));
 expect(s.data.list).toEqual(['movie-1','movie-2']);
 expect(JSON.parse(values.get(MOVIES_KEY)!).list).toEqual(['movie-1','movie-2']);
});
it('caps stored times at 30 days on load and on write',()=>{
 const values=new Map([[MOVIES_KEY,JSON.stringify({list:[],progress:{'movie-1':1e300}})]]);
 const s=new MovieStorage(()=>fake(values));
 expect(s.data.progress['movie-1']).toBe(30*86400);
 s.progress('movie-2',1e9);
 expect(s.data.progress['movie-2']).toBe(30*86400);
 expect(JSON.parse(values.get(MOVIES_KEY)!).progress['movie-2']).toBe(30*86400);
});
// Another page writes the same key. A reload adopts that value, and a reload that finds nothing new keeps this page's copy.
it('reload adopts another page\'s write, and changes nothing when storage is unchanged',()=>{
 const storage=fake(new Map());
 const here=new MovieStorage(()=>storage);
 new MovieStorage(()=>storage).toggle('movie-2');
 expect(here.reload()).toBe(true);
 expect(here.data.list).toEqual(['movie-2']);
 expect(here.reload()).toBe(false);
});
it('reload keeps this page\'s unsaved changes while storage refuses writes',()=>{
 const values=new Map([[MOVIES_KEY,'{"list":[],"progress":{}}']]);
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:()=>{throw new Error('full');}} as unknown as Storage;
 const s=new MovieStorage(()=>storage);
 s.toggle('movie-1');
 expect(s.reload()).toBe(false);
 expect(s.data.list).toEqual(['movie-1']);
 expect(s.durable).toBe(false);
});
it('reload keeps the data and reports durable=false when storage cannot be read',()=>{
 let current=fake(new Map([[MOVIES_KEY,'{"list":["movie-4"],"progress":{}}']]));
 const s=new MovieStorage(()=>current);
 current={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}} as unknown as Storage;
 expect(s.reload()).toBe(false);
 expect(s.durable).toBe(false);
 expect(s.data.list).toEqual(['movie-4']);
});
// Storage that reads but refuses writes keeps the list, snapshot and server in memory, and says so.
it('keeps the list, snapshot and server in memory when only writes fail',()=>{
 const storage={getItem:()=>null,setItem:()=>{throw new Error('full');}} as unknown as Storage;
 const s=new MovieStorage(()=>storage);
 s.toggle(remote.id,snapshotOf(remote));s.setProvider('vidlink');
 expect(s.durable).toBe(false);
 expect(s.data.list).toEqual([remote.id]);
 expect(s.snapshot(remote.id)).toEqual(snapshotOf(remote));
 expect(s.data.provider).toBe('vidlink');
});
it('remembers only known servers',()=>{
 const storage=fake(),s=new MovieStorage(()=>storage);
 s.setProvider('vixsrc');s.setProvider('nope' as never);
 expect(new MovieStorage(()=>storage).data.provider).toBe('vixsrc');
});
it('ignores positions for an unresolved episode route',()=>{
 const s=new MovieStorage(()=>fake());
 s.progress('tv-19885:sundefined:eundefined',42);
 expect(s.data.progress).toEqual({});expect(s.data.meta).toEqual({});expect(s.continueItems()).toEqual([]);
});
it('drops stored progress and meta keys that are not resolved media keys',()=>{
 const stored={list:[],progress:{'movie-1':10,'tv-19885:sundefined:eundefined':42,'tv-19885:s1:e2':20,foo:5},titles:{},meta:{'movie-1':{updated:1},'tv-19885:sundefined:eundefined':{updated:2}}};
 const s=new MovieStorage(()=>fake(new Map([[MOVIES_KEY,JSON.stringify(stored)]])));
 expect(s.data.progress).toEqual({'movie-1':10,'tv-19885:s1:e2':20});
 expect(s.data.meta).toEqual({'movie-1':{updated:1}});
});
it('leaves unreadable storage untouched and reports durable=false',()=>{
 const values=new Map([[MOVIES_KEY,'{not json']]);
 const s=new MovieStorage(()=>fake(values));
 expect(values.get(MOVIES_KEY)).toBe('{not json');expect(s.durable).toBe(false);
});
it('keeps a known duration when a later position omits it',()=>{
 const s=new MovieStorage(()=>fake());
 s.progress('movie-1',100,7200);s.progress('movie-1',160);
 expect(s.data.meta['movie-1']).toEqual({duration:7200,updated:expect.any(Number)});
});
// Only an early report while the media plays keeps a resume point. A finished title and a late report always write.
it.each<[number|undefined,number,boolean,boolean]>([
 [120,3,false,true],
 [15,3,false,true],
 [120,14.9,false,true],
 [120,3,true,false],
 [10,3,false,false],
 [undefined,3,false,false],
 [120,15,false,false],
 [120,200,false,false],
])('keepsResume(saved %s, time %s, ended %s) is %s',(saved,time,ended,keeps)=>{
 expect(keepsResume(saved,time,ended)).toBe(keeps);
});
it('preserves stored preferences after a transient read failure until a mutation',()=>{
 let value='{"list":["movie-7"],"progress":{}}';
 const storage={getItem:()=>{throw new Error('temporary');},setItem:(_k:string,v:string)=>{value=v;}} as unknown as Storage;
 const s=new MovieStorage(()=>storage);
 expect(s.durable).toBe(false);expect(value).toBe('{"list":["movie-7"],"progress":{}}');
 s.toggle('movie-1');expect(s.durable).toBe(true);expect(JSON.parse(value).list).toEqual(['movie-1']);
});
it('does not overwrite malformed saved JSON during initialization',()=>{
 let value='{broken';
 const storage={getItem:()=>value,setItem:(_k:string,v:string)=>{value=v;}} as unknown as Storage;
 const s=new MovieStorage(()=>storage);
 expect(s.durable).toBe(false);expect(value).toBe('{broken');
});

// Writes this tab could not save are unsaved changes. Another page's data must not replace them until a write of this tab saves.
it('keeps this tab\'s list while its writes are refused, even when another page changes storage',()=>{
 const values=new Map([[MOVIES_KEY,'{"list":[],"progress":{}}']]);
 let refuse=true;
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{if(refuse)throw new Error('full');values.set(k,v);}} as unknown as Storage;
 const s=new MovieStorage(()=>storage);
 s.toggle('movie-1');
 expect(s.durable).toBe(false);
 values.set(MOVIES_KEY,JSON.stringify({list:['movie-2'],progress:{}}));
 expect(s.reload()).toBe(false);
 expect(s.data.list).toEqual(['movie-1']);
 expect(s.durable).toBe(false);
});
it('a later successful write clears the unsaved flag, so another page\'s data is adopted again',()=>{
 const values=new Map([[MOVIES_KEY,'{"list":[],"progress":{}}']]);
 let refuse=true;
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{if(refuse)throw new Error('full');values.set(k,v);}} as unknown as Storage;
 const s=new MovieStorage(()=>storage);
 s.toggle('movie-1');
 refuse=false;
 s.toggle('movie-3');
 expect(s.durable).toBe(true);
 values.set(MOVIES_KEY,JSON.stringify({list:['movie-2'],progress:{}}));
 expect(s.reload()).toBe(true);
 expect(s.data.list).toEqual(['movie-2']);
});
// The first read threw, so this page has no stored text to compare with. Its refused change still holds.
it('keeps a refused change when the first read threw and storage later holds another page\'s data',()=>{
 const values=new Map<string,string>();
 let blocked=true;
 const storage={getItem:(k:string)=>{if(blocked)throw new Error('blocked');return values.get(k)??null;},setItem:()=>{throw new Error('blocked');}} as unknown as Storage;
 const s=new MovieStorage(()=>storage);
 s.toggle('movie-1');
 blocked=false;
 values.set(MOVIES_KEY,JSON.stringify({list:['movie-2'],progress:{}}));
 expect(s.reload()).toBe(false);
 expect(s.data.list).toEqual(['movie-1']);
 expect(s.durable).toBe(false);
});
// A clear from another page while this tab is clean: nothing is unsaved, so the empty list is adopted.
it('a clear from another page adopts the empty list when this tab has no unsaved change',()=>{
 const values=new Map([[MOVIES_KEY,JSON.stringify({list:['movie-1'],progress:{}})]]);
 const s=new MovieStorage(()=>fake(values));
 values.delete(MOVIES_KEY);
 expect(s.reload()).toBe(true);
 expect(s.data.list).toEqual([]);
});
