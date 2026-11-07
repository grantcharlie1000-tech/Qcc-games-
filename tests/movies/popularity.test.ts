import {describe,it,expect,vi} from 'vitest';
import {PlaybackEvidence,MoviePopularity,POPULARITY_SETTINGS_KEY,POPULARITY_DEDUP_KEY} from '../../src/movies/popularity';
function memory(){const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}
function setup(){const storage=memory(),fetch=vi.fn<typeof globalThis.fetch>(async()=>new Response(null,{status:204}));let now=Date.UTC(2026,10,7,12);let random=0;const client=new MoviePopularity(()=>storage,fetch as typeof globalThis.fetch,()=>now,()=> (++random).toString(16).padStart(32,'0'));client.available=true;return {client,storage,fetch,advance:(ms:number)=>{now+=ms;}};}
async function play(client:MoviePopularity,id='movie-157336'){for(let i=0;i<=60;i++)await client.sample(id,i,i*1000,true);}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
describe('qualifying playback',()=>{
 it('requires sixty seconds of advancing playback, not an initial resumed position',()=>{const e=new PlaybackEvidence();expect(e.sample(3000,0,true)).toBe(false);for(let i=1;i<60;i++)expect(e.sample(3000+i,i*1000,true)).toBe(false);expect(e.sample(3060,60000,true)).toBe(true);});
 it('does not credit seeks, frozen clocks, background gaps or inactive playback',()=>{const e=new PlaybackEvidence();e.sample(0,0,true);e.sample(3000,1000,true);for(let i=2;i<60;i++)e.sample(3000,i*1000,true);expect(e.sample(3100,70000,true)).toBe(false);for(let i=71;i<140;i++)expect(e.sample(3100+i,i*1000,false)).toBe(false);expect(e.sample(3300,150000,true)).toBe(false);});
});
describe('movie contributions',()=>{
 it('cancels hashing work when playback ends or opt-out is toggled',async()=>{
  const {client,fetch}=setup();
  let release!:(value:ArrayBuffer)=>void;
  const digest=vi.spyOn(crypto.subtle,'digest').mockImplementation(()=>new Promise<ArrayBuffer>(resolve=>{release=resolve;}));
  try{
   const pending=play(client);await vi.waitFor(()=>expect(digest).toHaveBeenCalledTimes(1));
   client.setEnabled(false);client.setEnabled(true);release(new ArrayBuffer(32));await pending;
   expect(fetch).not.toHaveBeenCalled();
  }finally{digest.mockRestore();}
 });
 it('defaults on, sends only a movie ID and title-specific token after sustained playback, once per day',async()=>{const {client,fetch}=setup();expect(client.enabled).toBe(true);await play(client);await flush();expect(fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({titleId:'movie-157336',token:expect.stringMatching(/^[a-f0-9]{32}$/)});expect(fetch.mock.calls[0][1]).toMatchObject({credentials:'omit',referrerPolicy:'no-referrer'});client.reset();await play(client);await flush();expect(fetch).toHaveBeenCalledTimes(1);});
 it('does not upload old history or TV, and fails closed when the service is unavailable',async()=>{const {client,storage,fetch}=setup();storage.setItem('qcc:movies:v1',JSON.stringify({progress:{'movie-157336':5000}}));expect(fetch).not.toHaveBeenCalled();await play(client,'tv-1');client.available=false;await play(client);await flush();expect(fetch).not.toHaveBeenCalled();});
 it('opt-out clears short-lived tokens, persists across reload, and requires fresh playback after opt-in',async()=>{const {client,storage,fetch}=setup();await play(client);await flush();client.setEnabled(false);expect(storage.getItem(POPULARITY_DEDUP_KEY)).toBeNull();expect(new MoviePopularity(()=>storage).enabled).toBe(false);await play(client,'movie-2');client.setEnabled(true);client.sample('movie-2',61,61000,true);await flush();expect(fetch).toHaveBeenCalledTimes(1);});
 it.each([true,false])('reports failed preference persistence separately from disabled state when wanted=%s',wanted=>{const storage=memory();storage.setItem(POPULARITY_SETTINGS_KEY,'true');storage.setItem=()=>{throw new Error('full');};const client=new MoviePopularity(()=>storage);expect(client.setEnabled(wanted)).toEqual({enabled:false,saved:false});expect(client.enabled).toBe(false);expect(new MoviePopularity(()=>storage).enabled).toBe(true);});
 it('confirms successful opt-out persistence independently of the checked state',()=>{const {client,storage}=setup();expect(client.setEnabled(false)).toEqual({enabled:false,saved:true});expect(new MoviePopularity(()=>storage).enabled).toBe(false);});
 it('honors another tab opting out and never uses unreadable storage as default-on',async()=>{const {client,storage,fetch}=setup();storage.setItem(POPULARITY_SETTINGS_KEY,'false');await play(client);await flush();expect(fetch).not.toHaveBeenCalled();const blocked=new MoviePopularity(()=>{throw new Error('blocked');});expect(blocked.enabled).toBe(false);});
 it('uses different tokens for different titles and drops yesterday’s dedup data',async()=>{const {client,storage,fetch,advance}=setup();await play(client,'movie-1');await flush();await play(client,'movie-2');await flush();const bodies=fetch.mock.calls.map(call=>JSON.parse(call[1]!.body as string));expect(bodies[0].token).not.toBe(bodies[1].token);advance(86400000);client.reset();await play(client,'movie-3');await flush();const raw=storage.getItem(POPULARITY_DEDUP_KEY)!;expect(raw).not.toContain('movie-1');expect(raw).not.toContain('movie-2');expect(raw).not.toContain('movie-3');expect(JSON.parse(raw).day).toBe(20765);});
 it('does not retry failed submissions in a loop or send while storage writes fail',async()=>{const {client,fetch}=setup();fetch.mockImplementation(async()=>new Response(null,{status:503}));await play(client);await flush();for(let i=61;i<200;i++)client.sample('movie-157336',i,i*1000,true);await flush();expect(fetch).toHaveBeenCalledTimes(1);const storage=memory();storage.setItem=()=>{throw new Error('full');};const blocked=new MoviePopularity(()=>storage,fetch as typeof globalThis.fetch);blocked.available=true;await play(blocked,'movie-2');await flush();expect(fetch).toHaveBeenCalledTimes(1);});
});
