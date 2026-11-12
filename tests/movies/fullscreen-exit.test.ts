/** @vitest-environment happy-dom */
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {Window as HappyWindow} from 'happy-dom';
import {MoviesView} from '../../src/movies/view';
import {MovieStorage} from '../../src/movies/storage';
const views:MoviesView[]=[];
let at=1000;
let localVideo=false;
beforeEach(()=>{
 localStorage.clear();at=1000;localVideo=false;
 const settings=(window as unknown as HappyWindow).happyDOM.settings;settings.disableIframePageLoading=false;settings.enableIframePageLoading=true;settings.fetch.interceptor={beforeAsyncRequest:async()=>new Promise(()=>{})};vi.spyOn(performance,'now').mockImplementation(()=>at);
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL)=>{
  const path=String(url);
  if(path.includes('movies/catalog.json'))return Response.json(JSON.parse(readFileSync('public/movies/catalog.json','utf8')));
  if(path.includes('movies/licenses.json'))return Response.json(localVideo?[{key:'movie-329865',path:'movies/media/fixture.webm',license:'CC0-1.0',credit:'QCC generated test fixture',evidence:'docs/rights/fixture.md',reviewed:true,territory:'Worldwide',expires:'2099-01-01'}]:[]);
  return Response.json({error:'catalog_not_configured'},{status:503});
 }));
});
afterEach(()=>{for(const view of views.splice(0))view.dispose();document.body.replaceChildren();for(const key of ['fullscreenElement','webkitFullscreenElement'])delete (document as unknown as Record<string,unknown>)[key];vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function start(native=false,hash='#/movies/movie-329865/play'){
 localVideo=native;
 const host=document.createElement('main');document.body.append(host);const study=vi.fn();
 const view=new MoviesView(host,new MovieStorage(),study,true);views.push(view);
 await vi.waitFor(()=>expect(host.querySelector('[data-rail="popular-marlborough"]')).not.toBeNull());
 view.navigate(hash);
 await vi.waitFor(()=>expect(document.querySelector('.movies-warning')).not.toBeNull());
 [...document.querySelectorAll<HTMLButtonElement>('.movies-warning button')].find(b=>b.textContent==='Continue')!.click();
 await vi.waitFor(()=>expect(host.querySelector(native?'video':'.movies-provider-frame')).not.toBeNull());
 return {view,host,study,frame:host.querySelector('iframe')!};
}
function fullscreen(element:Element|null,prefixed=false){
 Object.defineProperty(document,prefixed?'webkitFullscreenElement':'fullscreenElement',{configurable:true,value:element});
 document.dispatchEvent(new Event(prefixed?'webkitfullscreenchange':'fullscreenchange'));
}
for(const prefixed of [false,true])it(`${prefixed?'WebKit':'standard'} browser exit keeps playback and never opens Study`,async()=>{
 const {host,frame,study}=await start();fullscreen(frame,prefixed);fullscreen(null,prefixed);
 document.dispatchEvent(new Event('fullscreenchange'));document.dispatchEvent(new Event('webkitfullscreenchange'));
 expect(study).not.toHaveBeenCalled();expect(host.querySelector('iframe')).toBe(frame);expect(frame.isConnected).toBe(true);
});
it('owns Escape before and after fullscreen exit, including held repeats, then releases the windowed shortcut',async()=>{
 const {view,host}=await start();const escape=(repeat=false)=>new KeyboardEvent('keydown',{key:'Escape',repeat});
 expect(view.handleFullscreenEscape(escape())).toBe(false);
 fullscreen(host.querySelector('.movies-screen'));
 expect(view.handleFullscreenEscape(escape())).toBe(true);
 fullscreen(null);at+=1000;
 expect(view.handleFullscreenEscape(escape(true))).toBe(true);
 view.releaseFullscreenEscape();expect(view.handleFullscreenEscape(escape())).toBe(false);
 fullscreen(host.querySelector('iframe'));fullscreen(null);
 expect(view.handleFullscreenEscape(escape())).toBe(true);view.releaseFullscreenEscape();
 fullscreen(host.querySelector('iframe'));fullscreen(null);at+=300;
 expect(view.handleFullscreenEscape(escape())).toBe(false);
});
it('does not take Escape from unrelated fullscreen elements',async()=>{
 const {view}=await start();fullscreen(document.body);fullscreen(null);
 expect(view.handleFullscreenEscape(new KeyboardEvent('keydown',{key:'Escape'}))).toBe(false);
});

it('native iOS fullscreen exits keep the video and release Escape, including repeated sessions',async()=>{
 const {view,host,study}=await start(true);const video=host.querySelector('video')!;
 for(let session=0;session<2;session++){
  video.dispatchEvent(new Event('webkitbeginfullscreen'));
  expect(view.handleFullscreenEscape(new KeyboardEvent('keydown',{key:'Escape'}))).toBe(true);
  video.dispatchEvent(new Event('webkitendfullscreen'));
  expect(study).not.toHaveBeenCalled();expect(host.querySelector('video')).toBe(video);
  view.releaseFullscreenEscape();expect(view.handleFullscreenEscape(new KeyboardEvent('keydown',{key:'Escape'}))).toBe(false);
 }
 video.dispatchEvent(new Event('webkitbeginfullscreen'));
 view.navigate('#/movies');
 video.dispatchEvent(new Event('webkitendfullscreen'));
 video.dispatchEvent(new Event('webkitbeginfullscreen'));
 view.pause();video.dispatchEvent(new Event('webkitendfullscreen'));
 expect(study).not.toHaveBeenCalled();expect(view.handleFullscreenEscape(new KeyboardEvent('keydown',{key:'Escape'}))).toBe(false);
});

it('the fullscreen button exits intentionally without claiming the following Study shortcut',async()=>{
 const {host,view,study,frame}=await start();
 const screen=host.querySelector<HTMLElement>('.movies-screen')!;
 Object.defineProperty(document,'exitFullscreen',{configurable:true,value:async()=>fullscreen(null)});
 fullscreen(screen);host.querySelector<HTMLButtonElement>('[data-action="fullscreen"]')!.click();
 await Promise.resolve();
 expect(study).not.toHaveBeenCalled();expect(host.querySelector('iframe')).toBe(frame);
 expect(view.handleFullscreenEscape(new KeyboardEvent('keydown',{key:'Escape'}))).toBe(false);
 delete (document as unknown as Record<string,unknown>).exitFullscreen;
});

it('browser exit cancels Up next without allowing delayed episode navigation',async()=>{
 const {host,study,frame}=await start(false,'#/movies/tv-19885/season/1/episode/1/play');
 vi.useFakeTimers();fullscreen(host.querySelector('.movies-screen'));
 const hash=location.hash;
 window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:'https://framextv.cc',data:{event:'frameXTV:timeupdate',currentTime:100,duration:100}}));
 const overlay=host.querySelector<HTMLElement>('.movies-next')!;expect(overlay.hidden).toBe(false);
 fullscreen(null);expect(overlay.hidden).toBe(true);
 await vi.advanceTimersByTimeAsync(11000);
 expect(location.hash).toBe(hash);expect(study).not.toHaveBeenCalled();expect(host.querySelector('iframe')).toBe(frame);
});
it('fullscreen exit still cancels a warning after it has paused and removed the previous stream',async()=>{
 const {host,study,view}=await start(false,'#/movies/tv-19885/season/1/episode/1/play');
 fullscreen(host.querySelector('.movies-screen'));
 host.querySelector<HTMLAnchorElement>('[data-episode-nav="next"]')!.click();
 const warning=document.querySelector<HTMLDialogElement>('.movies-warning');expect(warning?.open).toBe(true);
 fullscreen(null);expect(document.querySelector('.movies-warning')).toBeNull();expect(study).not.toHaveBeenCalled();
 expect(view.handleFullscreenEscape(new KeyboardEvent('keydown',{key:'Escape'}))).toBe(true);
});
