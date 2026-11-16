import {afterEach,describe,expect,it,vi} from 'vitest';
import {handleMovieFailureReport} from '../../server/movie-failure-report';

const origin='https://nceastudy.pages.dev';
const code='random-private-report-code-12345';
const env={
 QCC_MOVIE_REPORT_CODE:code,
 QCC_MOVIE_REPORT_TO:'owner@example.test',
 QCC_MOVIE_REPORT_FROM:'QCC Diagnostics <alerts@example.test>',
 RESEND_API_KEY:'re_test_key',
};
const event={code,reason:'frame-load-timeout',stage:'connecting',online:true};
function post(body:unknown=event,headers:Record<string,string>={}){
 return new Request(origin+'/api/movie-failure-report',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
}
afterEach(()=>vi.unstubAllGlobals());

describe('private opt-in movie failure reports',()=>{
 it('emails only the minimal diagnostics to the server-configured recipient',async()=>{
  const fetcher=vi.fn(async (_url:string,_init?:RequestInit)=>new Response(null,{status:202}));
  vi.stubGlobal('fetch',fetcher);
  const response=await handleMovieFailureReport(post(),env,Date.UTC(2026,10,17,1,2,3));
  expect(response.status).toBe(204);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url,init]=fetcher.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(init).toMatchObject({method:'POST',redirect:'manual',headers:{Authorization:'Bearer re_test_key','Content-Type':'application/json'}});
  const mail=JSON.parse(String(init?.body));
  expect(mail).toMatchObject({from:env.QCC_MOVIE_REPORT_FROM,to:[env.QCC_MOVIE_REPORT_TO],subject:'NCEAstudy playback diagnostic'});
  expect(mail.text).toContain('Reason: frame-load-timeout');
  expect(mail.text).toContain('Stage: connecting');
  expect(mail.text).toContain('Time: 2026-11-17T01:02:03.000Z');
  expect(mail.text).not.toContain(code);
  expect(mail.text).not.toContain('owner@example.test');
 });

 it('refuses to forward when the report code is incorrect',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const response=await handleMovieFailureReport(post({...event,code:'not-the-code-xxxxxxxxxxx'}),env);
  expect(response.status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
 });

 it('rejects missing configuration without sending',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const response=await handleMovieFailureReport(post(),{});
  expect(response.status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
 });

 it('requires same-origin POST with JSON content',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const wrongOrigin=await handleMovieFailureReport(post(event,{Origin:'https://attacker.test'}),env);
  const wrongType=await handleMovieFailureReport(post(event,{'Content-Type':'text/plain'}),env);
  const wrongMethod=await handleMovieFailureReport(new Request(origin+'/api/movie-failure-report'),env);
  expect([wrongOrigin.status,wrongType.status,wrongMethod.status]).toEqual([403,415,405]);
  expect(fetcher).not.toHaveBeenCalled();
 });

 it('rejects extra fields and overlarge payloads without forwarding',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const extra=await handleMovieFailureReport(post({...event,title:'Private viewing title'}),env);
  const tooLarge=await handleMovieFailureReport(post({...event,garbage:'x'.repeat(1100)}),env);
  expect([extra.status,tooLarge.status]).toEqual([400,413]);
  expect(fetcher).not.toHaveBeenCalled();
 });

 it('returns a failure instead of pretending an email was delivered',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:429})));
  const response=await handleMovieFailureReport(post(),env);
  expect(response.status).toBe(502);
 });
});
