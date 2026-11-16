import {afterEach,expect,it,vi} from 'vitest';
import {REPORT_CODE_PATTERN,sendMovieFailureReport} from '../../src/movies/failure-report';

const code='random-private-report-code-12345';
afterEach(()=>vi.unstubAllGlobals());

it('requires a nontrivial code and does not call any endpoint without it',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 expect(REPORT_CODE_PATTERN.test('guess')).toBe(false);
 expect(await sendMovieFailureReport('guess','frame-load-timeout','connecting',true)).toBe(false);
 expect(fetcher).not.toHaveBeenCalled();
});

it('posts only four fields to the same-origin endpoint, without cookies or referrer',async()=>{
 const fetcher=vi.fn(async (_url:string,_init?:RequestInit)=>new Response(null,{status:204}));
 vi.stubGlobal('fetch',fetcher);
 expect(await sendMovieFailureReport(code,'frame-ready-timeout','loaded',true)).toBe(true);
 expect(fetcher).toHaveBeenCalledTimes(1);
 const [url,init]=fetcher.mock.calls[0];
 expect(url).toBe('/api/movie-failure-report');
 expect(init).toMatchObject({method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',keepalive:true});
 expect(JSON.parse(String(init?.body))).toEqual({code,reason:'frame-ready-timeout',stage:'loaded',online:true});
});

it('does not claim delivery when the report endpoint rejects or is unreachable',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:503})));
 expect(await sendMovieFailureReport(code,'frame-error','connecting',true)).toBe(false);
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('offline');}));
 expect(await sendMovieFailureReport(code,'frame-error','connecting',false)).toBe(false);
});
