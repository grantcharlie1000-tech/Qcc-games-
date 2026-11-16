import {afterEach,expect,it,vi} from 'vitest';
import {sendMovieFailureReport} from '../../src/movies/failure-report';

afterEach(()=>vi.unstubAllGlobals());

it('automatically sends a fixed three-field diagnostic without credentials or a code',async()=>{
 const fetcher=vi.fn(async (_url:string,_init?:RequestInit)=>new Response(null,{status:204}));
 vi.stubGlobal('fetch',fetcher);
 expect(await sendMovieFailureReport('frame-ready-timeout','loaded',true)).toBe(true);
 const [url,init]=fetcher.mock.calls[0];
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(url).toBe('/api/movie-failure-report');
 expect(init).toMatchObject({method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',keepalive:true});
 expect(JSON.parse(String(init?.body))).toEqual({reason:'frame-ready-timeout',stage:'loaded',online:true});
});

it('silently drops an undeliverable report and does not claim it was stored',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:503})));
 expect(await sendMovieFailureReport('frame-error','connecting',true)).toBe(false);
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('offline');}));
 expect(await sendMovieFailureReport('local-media-error','loaded',false)).toBe(false);
});
