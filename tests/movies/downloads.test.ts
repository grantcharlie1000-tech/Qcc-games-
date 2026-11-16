import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MovieDownloads,MEDIA_FILES,MEDIA_META} from '../../src/movies/downloads';
import type {LicensedMedia,Title} from '../../src/movies/model';

class MemoryCache {
 private entries=new Map<string,Response>();
 private key(url:RequestInfo|URL){return url instanceof Request?url.url:String(url);}
 async match(url:RequestInfo|URL){return this.entries.get(this.key(url))?.clone();}
 async put(url:RequestInfo|URL,response:Response){this.entries.set(this.key(url),new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers}));}
 async delete(url:RequestInfo|URL){return this.entries.delete(this.key(url));}
 async keys(){return [...this.entries.keys()].map(url=>new Request(url));}
}

const title:Title={
 id:'movie-1',kind:'movie',name:'Licensed sample',year:2026,
 genres:[],overview:'A licensed test film.',poster:'movies/no-artwork.svg',
 source:{type:'third-party'},seasons:[],
};
const license:LicensedMedia={
 key:'movie-1',path:'movies/media/test.mp4',license:'CC0-1.0',credit:'Author',
 evidence:'docs/rights/sample.md',reviewed:true,territory:'Worldwide',expires:'2099-12-31',
};

describe('Movies & TV offline downloads',()=>{
 const buckets=new Map<string,MemoryCache>();
 beforeEach(()=>{
  buckets.clear();
  vi.stubGlobal('location',{href:'https://qcc.example/',origin:'https://qcc.example/'});
  vi.stubGlobal('caches',{open:async(name:string)=>{
   if(!buckets.has(name))buckets.set(name,new MemoryCache());
   return buckets.get(name)!;
  }});
  vi.stubGlobal('navigator',{storage:{estimate:async()=>({usage:0,quota:10_000_000})},serviceWorker:{controller:{postMessage:vi.fn()}}});
 });
 afterEach(()=>vi.unstubAllGlobals());

 it('stores complete licensed video and restores its offline record',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([0,1,2,3]),{
   status:200,headers:{'content-type':'video/mp4','content-length':'4'},
  })));
  const downloads=new MovieDownloads(true);
  await downloads.ready;
  await downloads.download(title,{id:title.id,play:false},license);
  expect(downloads.status('movie-1').state).toBe('ready');
  const saved=await buckets.get(MEDIA_FILES)!.match('https://qcc.example/movies/media/test.mp4');
  expect([...new Uint8Array(await saved!.arrayBuffer())]).toEqual([0,1,2,3]);
  const restored=new MovieDownloads(true);
  await restored.ready;
  expect(restored.source('movie-1')?.path).toBe(license.path);
  expect(restored.downloadedTitles().map(item=>item.id)).toContain(title.id);
 });

 it('does not mark an incomplete transfer as downloaded',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([0,1]),{
   status:200,headers:{'content-type':'video/mp4','content-length':'4'},
  })));
  const downloads=new MovieDownloads(true);
  await downloads.ready;
  await expect(downloads.download(title,{id:title.id,play:false},license)).rejects.toThrow('incomplete');
  expect(downloads.status('movie-1').state).toBe('failed');
  expect((await buckets.get(MEDIA_META)!.keys()).length).toBe(0);
 });

 it('rejects unreviewed and expired sources before downloading',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const downloads=new MovieDownloads(true);await downloads.ready;
  await expect(downloads.download(title,{id:title.id,play:false},{...license,reviewed:false} as unknown as LicensedMedia)).rejects.toThrow('approved');
  await expect(downloads.download(title,{id:title.id,play:false},{...license,expires:'2020-01-01'})).rejects.toThrow('approved');
  expect(fetcher).not.toHaveBeenCalled();
 });

 it('deletes downloaded files and metadata without affecting game caches',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([1,2,3]),{
   status:200,headers:{'content-type':'video/mp4','content-length':'3'},
  })));
  const downloads=new MovieDownloads(true);await downloads.ready;
  await downloads.download(title,{id:title.id,play:false},license);
  await downloads.remove('movie-1');
  expect(downloads.status('movie-1').state).toBe('none');
  expect(await buckets.get(MEDIA_FILES)!.match('https://qcc.example/movies/media/test.mp4')).toBeUndefined();
  expect((await buckets.get(MEDIA_META)!.keys()).length).toBe(0);
 });
});
