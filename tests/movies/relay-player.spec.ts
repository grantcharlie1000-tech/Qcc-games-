import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fulfillRelayVideo} from './relay-fixtures';
const path='/movies/player.html?type=movie&id=157336&provider=framextv';
const providers=['framextv','vidlink','vixsrc','vidsrc'];
async function media(page:Page){
 await page.route('**/api/media?*',route=>fulfillRelayVideo(route));
}
function playback(provider:string){return {provider,source:{url:'/api/media?token='+provider,type:'webm'},subtitles:[]};}
test('plays actual relayed video without a request to a third-party provider',async({page,baseURL})=>{
 const outside:string[]=[];page.on('request',request=>{if(new URL(request.url()).origin!==new URL(baseURL!).origin)outside.push(request.url());});
 await media(page);await page.route('**/api/playback?*',r=>r.fulfill({json:playback('framextv')}));
 await page.goto(path);await expect(page.getByLabel('Source',{exact:true})).toHaveValue('framextv');
 await expect(page.getByLabel('Source',{exact:true}).locator('option')).toHaveText(['FrameXTV','VidLink','VixSrc','VidSrc']);
 await page.getByRole('button',{name:'Play stream',exact:true}).click();
 await expect.poll(()=>page.locator('video').evaluate(video=>(video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
 expect(outside).toEqual([]);
});
test('concrete resolve errors try each fallback once and stop with a useful recovery control',async({page})=>{
 const attempts:string[]=[];await page.route('**/api/playback?*',route=>{attempts.push(new URL(route.request().url()).searchParams.get('provider')!);return route.fulfill({status:502,json:{error:'source_unavailable',message:'Unavailable'}});});
 await page.goto(path);await expect(page.getByRole('status')).toContainText('No source is available');
 expect(attempts).toEqual(providers);await expect(page.getByRole('button',{name:'Try another source'})).toBeEnabled();
});
test('switching source keeps the current position and stays paused when the viewer paused',async({page})=>{
 await media(page);await page.route('**/api/playback?*',r=>r.fulfill({json:playback(new URL(r.request().url()).searchParams.get('provider')!)}));
 await page.goto(path);await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).readyState)).toBeGreaterThan(0);
 await page.locator('video').evaluate(v=>{(v as HTMLVideoElement).currentTime=.7;(v as HTMLVideoElement).pause();});
 await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeCloseTo(.7,1);
 await page.getByLabel('Source',{exact:true}).selectOption('vixsrc');
 await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeCloseTo(.7,1);
 expect(await page.locator('video').evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
});
test('switching an active source resumes playback from the current position',async({page})=>{
 await media(page);await page.route('**/api/playback?*',r=>r.fulfill({json:playback(new URL(r.request().url()).searchParams.get('provider')!)}));
 await page.goto(path);await page.getByRole('button',{name:'Play stream',exact:true}).click();
 await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
 const before=await page.locator('video').evaluate(v=>(v as HTMLVideoElement).currentTime);
 await page.getByLabel('Source',{exact:true}).selectOption('vidlink');
 await expect(page.locator('video')).toHaveAttribute('src','/api/media?token=vidlink');
 await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).paused)).toBe(false);
 await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeGreaterThan(before);
});
test('switching again while a source loads preserves the intention to keep playing',async({page})=>{
 let pending:any;await media(page);await page.route('**/api/playback?*',route=>{
  const provider=new URL(route.request().url()).searchParams.get('provider')!;
  if(provider==='vidlink'){pending=route;return;}
  return route.fulfill({json:playback(provider)});
 });
 await page.goto(path);await page.getByRole('button',{name:'Play stream',exact:true}).click();
 await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
 await page.getByLabel('Source',{exact:true}).selectOption('vidlink');await expect.poll(()=>Boolean(pending)).toBe(true);
 await page.getByLabel('Source',{exact:true}).selectOption('vidsrc');
 await expect(page.locator('video')).toHaveAttribute('src','/api/media?token=vidsrc');
 await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).paused)).toBe(false);
 await pending.fulfill({json:playback('vidlink')}).catch(()=>{});
 await expect(page.locator('video')).toHaveAttribute('src','/api/media?token=vidsrc');
});
test('a media failure switches to the next source and plays its real fixture',async({page})=>{
 const attempts:string[]=[];await page.route('**/api/playback?*',r=>{const provider=new URL(r.request().url()).searchParams.get('provider')!;attempts.push(provider);return r.fulfill({json:playback(provider)});});
 await page.route('**/api/media?*',r=>new URL(r.request().url()).searchParams.get('token')==='framextv'?r.fulfill({status:502,body:'No video'}):fulfillRelayVideo(r));
 await page.goto(path);await expect(page.getByLabel('Source',{exact:true})).toHaveValue('vidlink');
 await page.getByRole('button',{name:'Play stream',exact:true}).click();await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
 expect(attempts).toEqual(['framextv','vidlink']);
});
test('never loads an upstream URL returned by a malformed playback response',async({page,baseURL})=>{
 const outside:string[]=[];page.on('request',r=>{if(new URL(r.url()).origin!==new URL(baseURL!).origin)outside.push(r.url());});
 await page.route('**/api/playback?*',r=>r.fulfill({json:{provider:new URL(r.request().url()).searchParams.get('provider'),source:{url:'https://vidlink.pro/movie/1',type:'mp4'},subtitles:[]}}));
 await page.goto(path);await expect(page.getByRole('status')).toContainText('No source is available');expect(outside).toEqual([]);
});
test('changing source cancels a pending resolution and ignores its stale answer',async({page})=>{
 let first:any;await media(page);await page.route('**/api/playback?*',async r=>{const provider=new URL(r.request().url()).searchParams.get('provider')!;if(provider==='framextv'){first=r;return;}await r.fulfill({json:playback(provider)});});
 await page.goto(path);await expect.poll(()=>Boolean(first)).toBe(true);await page.getByLabel('Source',{exact:true}).selectOption('vidsrc');
 await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).readyState)).toBeGreaterThan(0);
 await first.fulfill({json:playback('framextv')}).catch(()=>{});
 await expect(page.getByLabel('Source',{exact:true})).toHaveValue('vidsrc');await expect(page.locator('video')).toHaveAttribute('src','/api/media?token=vidsrc');
});
test('a source resolved after twenty-one seconds is accepted without an early fallback',async({page})=>{
 let pending:any;const attempts:string[]=[];
 await page.clock.install({time:new Date('2026-10-26T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-26T12:00:01Z'));await media(page);
 await page.route('**/api/playback?*',route=>{attempts.push(new URL(route.request().url()).searchParams.get('provider')!);if(attempts.length===1)pending=route;});
 await page.goto(path);await expect.poll(()=>Boolean(pending)).toBe(true);
 await page.clock.runFor(21000);await pending.fulfill({json:playback('framextv')}).catch(()=>{});
 await expect(page.getByRole('button',{name:'Play stream',exact:true})).toBeEnabled();
 expect(attempts).toEqual(['framextv']);await expect(page.getByLabel('Source',{exact:true})).toHaveValue('framextv');
});
test('a hung resolution is cancelled at fifty seconds and each fallback is bounded',async({page})=>{
 const attempts:string[]=[];await page.clock.install({time:new Date('2026-10-26T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-26T12:00:01Z'));
 await page.route('**/api/playback?*',route=>{attempts.push(new URL(route.request().url()).searchParams.get('provider')!);});
 await page.goto(path);
 for(let count=1;count<=providers.length;count++){
  await expect.poll(()=>attempts.length).toBe(count);
  await page.clock.runFor(49999);expect(attempts.length).toBe(count);
  await page.clock.runFor(1);
 }
 await expect(page.getByRole('status')).toContainText('No source is available');expect(attempts).toEqual(providers);
});
test('paused healthy playback is not replaced by a timer',async({page})=>{
 const attempts:string[]=[];await media(page);await page.route('**/api/playback?*',r=>{const provider=new URL(r.request().url()).searchParams.get('provider')!;attempts.push(provider);return r.fulfill({json:playback(provider)});});
 await page.goto(path);await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).readyState)).toBeGreaterThan(0);
 await page.clock.install();await page.clock.runFor(65000);expect(attempts).toEqual(['framextv']);await expect(page.getByLabel('Source',{exact:true})).toHaveValue('framextv');
});
test('invalid title coordinates never reach the playback API',async({page})=>{
 const attempts:string[]=[];page.on('request',r=>{if(r.url().includes('/api/playback'))attempts.push(r.url());});
 await page.goto('/movies/player.html?type=tv&id=1&provider=vidsrc&season=-1&episode=1');
 await expect(page.getByRole('status')).toContainText('valid movie or episode');expect(attempts).toEqual([]);
});

test('plays HLS through relayed master, variant and media requests',async({page})=>{
 const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
 await page.route('**/api/playback?*',route=>route.fulfill({json:{provider:new URL(route.request().url()).searchParams.get('provider'),source:{url:'/api/media?token=master',type:'hls'},subtitles:[]}}));
 await page.route('**/api/media?*',route=>{
  const token=new URL(route.request().url()).searchParams.get('token');
  if(token==='master')return route.fulfill({contentType:'application/vnd.apple.mpegurl',body:'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000,RESOLUTION=160x90\n/api/media?token=level\n'});
  if(token==='level')return route.fulfill({contentType:'application/vnd.apple.mpegurl',body:'#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:1.920000,\n/api/media?token=s0\n#EXTINF:0.960000,\n/api/media?token=s1\n#EXTINF:0.120000,\n/api/media?token=s2\n#EXT-X-ENDLIST\n'});
  if(token&&/^s[012]$/.test(token))return fulfillRelayVideo(route,readFileSync(`tests/fixtures/movies-hls-${token[1]}.bin`),'video/mp2t');
  return route.fulfill({status:404});
 });
 await page.goto(path);await page.getByRole('button',{name:'Play stream',exact:true}).click();
 await expect.poll(()=>page.locator('video').evaluate(video=>(video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
 expect(requests.some(url=>url.endsWith('/api/media?token=master'))).toBe(true);
 expect(requests.some(url=>url.endsWith('/api/media?token=level'))).toBe(true);
 expect(requests.some(url=>url.endsWith('/api/media?token=s0'))).toBe(true);
 expect(requests.filter(url=>new URL(url).origin!==new URL(page.url()).origin)).toEqual([]);
});
