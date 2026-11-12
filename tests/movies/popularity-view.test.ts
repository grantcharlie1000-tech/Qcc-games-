/** @vitest-environment happy-dom */
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {MoviesView} from '../../src/movies/view';
import {MovieStorage} from '../../src/movies/storage';

import type {Window as HappyWindow} from 'happy-dom';
const views:MoviesView[]=[];
let at=0,title=0;
let titleId='';
let posts:Record<string,unknown>[]=[];
beforeEach(()=>{
 localStorage.clear();posts=[];at=0;titleId=`movie-${++title}`;
 vi.stubGlobal('crypto',webcrypto);vi.spyOn(performance,'now').mockImplementation(()=>at);
 const settings=(window as unknown as HappyWindow).happyDOM.settings;
 settings.disableIframePageLoading=false;settings.enableIframePageLoading=true;
 settings.fetch.interceptor={beforeAsyncRequest:async()=>new Promise(()=>{})};
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(url);
  if(path.includes('/api/movie-popularity')){if(init?.method==='POST'){posts.push(JSON.parse(init.body as string));return new Response(null,{status:204});}return Response.json({titleIds:[],windowDays:7});}
  if(path.includes('movies/catalog.json')){const catalog=JSON.parse(readFileSync('public/movies/catalog.json','utf8'));catalog.titles=[{...catalog.titles[0],id:titleId}];return Response.json(catalog);}
  if(path.includes('movies/licenses.json'))return Response.json([]);
  return Response.json({error:'catalog_not_configured'},{status:503});
 }));
});
afterEach(()=>{for(const view of views.splice(0))view.dispose();document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function start(){
 const container=document.createElement('main');document.body.append(container);
 const view=new MoviesView(container,new MovieStorage(),()=>{},true);views.push(view);
 await vi.waitFor(()=>expect(container.querySelector('[data-rail="popular-marlborough"]')).not.toBeNull());
 view.navigate(`#/movies/${titleId}/play`);
 await vi.waitFor(()=>expect(document.querySelector('.movies-warning')).not.toBeNull());
 const proceed=[...document.querySelectorAll<HTMLButtonElement>('.movies-warning button')].find(button=>button.textContent==='Continue');expect(proceed).toBeDefined();proceed!.click();
 await vi.waitFor(()=>expect(container.querySelector('.movies-provider-frame')).not.toBeNull());
 const frame=container.querySelector<HTMLIFrameElement>('.movies-provider-frame')!;
 frame.dispatchEvent(new Event('load'));
 function report(position:number,source:MessageEventSource|null=frame.contentWindow,origin='https://framextv.cc'){
  window.dispatchEvent(new MessageEvent('message',{origin,source,data:{event:'frameXTV:timeupdate',currentTime:position,duration:12000}}));
 }
 async function play(start:number,seconds:number){for(let delta=5;delta<=seconds;delta+=5){at+=5000;report(start+delta);}await new Promise(resolve=>setTimeout(resolve,0));}
 return {view,container,frame,report,play};
}
it('forwards only current approved iframe progress into fresh popularity evidence',async()=>{
 const {report,play}=await start();
 report(3000);await play(3000,55);expect(posts).toEqual([]);
 await play(3055,5);await vi.waitFor(()=>expect(posts).toHaveLength(1));
 expect(posts[0]).toEqual({titleId,token:expect.stringMatching(/^[a-f0-9]{32}$/)});
});

it('discards partial evidence when the same provider frame loads again',async()=>{
 const {frame,report,play}=await start();
 report(0);await play(0,55);expect(posts).toEqual([]);
 frame.dispatchEvent(new Event('load'));
 report(55);await play(55,5);expect(posts).toEqual([]);
 await play(60,50);expect(posts).toEqual([]);
 await play(110,5);await vi.waitFor(()=>expect(posts).toHaveLength(1));
});
it('does not credit paused or stalled clocks, seeks, or gaps before advancing playback',async()=>{
 const {report,play}=await start();
 report(3000);
 for(let i=0;i<13;i++){at+=5000;report(3000);}
 at+=5000;report(6000);expect(posts).toEqual([]);
 at+=65000;report(6065);expect(posts).toEqual([]);
 await play(6065,55);expect(posts).toEqual([]);
 await play(6120,5);await vi.waitFor(()=>expect(posts).toHaveLength(1));
 await play(6125,65);expect(posts).toHaveLength(1);
});
it('rejects parent, sibling and wrong-origin progress without adding evidence',async()=>{
 const {frame,report,play}=await start();
 const sibling=document.createElement('iframe');document.body.append(sibling);expect(frame.contentWindow).not.toBeNull();
 for(let position=0;position<=65;position+=5){
  at+=5000;
  report(position,window);report(position,sibling.contentWindow);report(position,frame.contentWindow,'https://framextv.cc.evil.test');
 }
 expect(posts).toEqual([]);
 report(65);await play(65,55);expect(posts).toEqual([]);
 await play(120,5);await vi.waitFor(()=>expect(posts).toHaveLength(1));
});
it('honors opt-out before and during a stream and requires fresh playback after opt-in',async()=>{
 const {report,play}=await start();
 localStorage.setItem('qcc:movies:popularity:settings:v1','false');
 report(0);await play(0,65);expect(posts).toEqual([]);
 localStorage.setItem('qcc:movies:popularity:settings:v1','true');
 report(65);await play(65,55);expect(posts).toEqual([]);
 localStorage.setItem('qcc:movies:popularity:settings:v1','false');
 window.dispatchEvent(new StorageEvent('storage',{key:'qcc:movies:popularity:settings:v1',newValue:'false'}));
 await play(120,65);expect(posts).toEqual([]);
 localStorage.setItem('qcc:movies:popularity:settings:v1','true');
 window.dispatchEvent(new StorageEvent('storage',{key:'qcc:movies:popularity:settings:v1',newValue:'true'}));
 report(185);await play(185,55);expect(posts).toEqual([]);
 await play(240,5);await vi.waitFor(()=>expect(posts).toHaveLength(1));
});
it('unloads a hidden stream and ignores its detached window before a fresh resume',async()=>{
 const {container,frame,report,play}=await start();const source=frame.contentWindow;
 report(0);await play(0,55);expect(posts).toEqual([]);
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));
 expect(container.querySelector('.movies-provider-frame')).toBeNull();
 for(let position=60;position<=125;position+=5){at+=5000;report(position,source);}
 expect(posts).toEqual([]);
 hidden.mockReturnValue(false);
 container.querySelector<HTMLButtonElement>('[data-action="resume-stream"]')!.click();
 await vi.waitFor(()=>expect(document.querySelector('.movies-warning')).not.toBeNull());
 document.querySelector<HTMLButtonElement>('.movies-warning .primary')!.click();
 await vi.waitFor(()=>expect(container.querySelector('.movies-provider-frame')).not.toBeNull());
 const resumed=container.querySelector<HTMLIFrameElement>('.movies-provider-frame')!;resumed.dispatchEvent(new Event('load'));
 const fresh=(position:number)=>report(position,resumed.contentWindow);
 fresh(125);for(let delta=5;delta<=55;delta+=5){at+=5000;fresh(125+delta);}expect(posts).toEqual([]);
 at+=5000;fresh(185);await vi.waitFor(()=>expect(posts).toHaveLength(1));
});
it('does not credit advancing reports while the Movies view is inert',async()=>{
 const {container,report,play}=await start();container.setAttribute('inert','');
 report(0);await play(0,65);expect(posts).toEqual([]);
 container.removeAttribute('inert');report(65);await play(65,55);expect(posts).toEqual([]);
 await play(120,5);await vi.waitFor(()=>expect(posts).toHaveLength(1));
});
it('does not reuse saved resume positions or partial evidence after reopening Movies',async()=>{
 const first=await start();first.report(3000);await first.play(3000,55);expect(posts).toEqual([]);first.view.dispose();views.pop();
 const second=await start();second.report(3055);await second.play(3055,55);expect(posts).toEqual([]);
 await second.play(3110,5);await vi.waitFor(()=>expect(posts).toHaveLength(1));
});
