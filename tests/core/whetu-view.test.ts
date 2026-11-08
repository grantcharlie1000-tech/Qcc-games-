/** @vitest-environment happy-dom */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Window as HappyWindow} from 'happy-dom';
import {WhetuStudyView} from '../../src/study/whetu-view';
import {StudyPairingError,type StudyPairing} from '../../src/study/whetu-pairing';

const ready={integration:'nceastudy-whetu-v1',ready:true,framePath:'/nceastudy',excludedSubjects:['history','l2-history'],authentication:{embeddedPassword:true,embeddedSignup:true,externalProviderHandoff:true},accountLink:'verified-explicit-v1',revision:'a'.repeat(40)};
const response=(body:unknown=ready)=>Response.json(body,{headers:{'Cache-Control':'private, no-store'}});
const views:WhetuStudyView[]=[];
beforeEach(()=>{
 // Iframe loads are controlled explicitly below. Never contact a real host.
 const settings=(window as unknown as HappyWindow).happyDOM.settings;
 settings.disableIframePageLoading=false;
 settings.enableIframePageLoading=true;
 settings.fetch.interceptor={beforeAsyncRequest:async()=>new Promise(()=>{})};
});
function pair(){return {activate:vi.fn(async()=>{}),status:vi.fn(async()=>true),start:vi.fn(async()=>{}),review:vi.fn(async()=>({qccUsername:'StudyPlayer',whetuLabel:'student@example.test',challenge:'b'.repeat(64)})),confirm:vi.fn(async(_challenge:string)=>{}),cancel:vi.fn(async()=>{})};}
function make(signedIn=()=>true,pairing:StudyPairing=pair()){
 const container=document.createElement('main');document.body.append(container);const openAccounts=vi.fn();
 const view=new WhetuStudyView(container,{signedIn,openAccounts,pairing});views.push(view);view.navigate('#/study');
 return {view,container,openAccounts,pairing};
}
function frameLoaded(frame:HTMLIFrameElement,marker=true){
 const doc=document.implementation.createHTMLDocument();
 if(marker){const meta=doc.createElement('meta');meta.name='whetu-integration';meta.content='nceastudy-whetu-v1';doc.head.append(meta);}
 Object.defineProperty(frame,'contentDocument',{configurable:true,value:doc});frame.dispatchEvent(new Event('load'));
}
afterEach(()=>{for(const view of views.splice(0))view.dispose();document.body.replaceChildren();vi.useRealTimers();vi.unstubAllGlobals();});

describe('first-party Study host lifecycle and explicit linking',()=>{
 it('keeps missing browser authority inside Study without creating a frame or changing QCC identity',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response()));const pairing=pair();
  pairing.activate.mockRejectedValueOnce(new StudyPairingError('Sign in again before opening Study.',409));
  const {container,openAccounts}=make(()=>true,pairing);
  await vi.waitFor(()=>expect(container.textContent).toContain('Sign in to NCEAStudy again'));
  expect(container.querySelector('iframe')).toBeNull();expect(pairing.status).not.toHaveBeenCalled();expect(pairing.start).not.toHaveBeenCalled();
  container.querySelector<HTMLButtonElement>('button')!.click();expect(openAccounts).toHaveBeenCalledOnce();
 });
 it('requires a QCC account before probing or creating any iframe',()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const {container,openAccounts}=make(()=>false);
  expect(container.querySelector('iframe')).toBeNull();expect(fetcher).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Log in or create your NCEAStudy account');
  container.querySelector<HTMLButtonElement>('button')!.click();expect(openAccounts).toHaveBeenCalledOnce();
 });
 it('does not create a frame from the private runtime staged refusal',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response({ready:false,reason:'account-link-protocol-unavailable'})));
  const {container}=make();
  await vi.waitFor(()=>expect(container.textContent).toContain('Study is not available inside this site yet.'));
  expect(container.querySelector('iframe')).toBeNull();expect(container.querySelector('button')?.textContent).toBe('Try again');
 });
 it('loads only the fixed first-party entry and confirms the actual response marker',async()=>{
  const fetcher=vi.fn(async()=>response());vi.stubGlobal('fetch',fetcher);
  const {container,view}=make();view.navigate('#/study');
  await vi.waitFor(()=>expect(container.querySelector('iframe')).not.toBeNull());
  const frame=container.querySelector('iframe')!;
  expect(fetcher).toHaveBeenCalledOnce();expect(frame.getAttribute('src')).toBe('/nceastudy');
  expect(frame.getAttribute('src')).not.toMatch(/acct_|token|username/);
  expect(frame.title).toBe('Whetū Study and account setup');
  expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
  frameLoaded(frame);
  expect(container.querySelector<HTMLElement>('.whetu-study-frame')!.hidden).toBe(false);
  expect(container.querySelector<HTMLElement>('.whetu-study-state')!.hidden).toBe(true);
  view.pause();view.resume();expect(container.querySelector('iframe')).toBe(frame);expect(fetcher).toHaveBeenCalledOnce();
  view.dispose();expect(container.querySelector('iframe')).toBeNull();
 });
 it('rejects a QCC fallback or unmarked app response rather than claiming signup loaded',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response()));const {container}=make();
  await vi.waitFor(()=>expect(container.querySelector('iframe')).not.toBeNull());
  frameLoaded(container.querySelector('iframe')!,false);
  expect(container.textContent).toContain('Study could not open securely.');expect(container.querySelector('iframe')).toBeNull();
 });
 it('ignores a response arriving after navigation disposal',async()=>{
  let resolve!:(response:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(done=>{resolve=done;})));
  const {container,view}=make();view.dispose();resolve(response());await Promise.resolve();await Promise.resolve();
  expect(container.childElementCount).toBe(0);expect(container.querySelector('iframe')).toBeNull();
 });
 it('rechecks account presence after readiness before admitting the frame',async()=>{
  let signedIn=true,resolve!:(response:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(done=>{resolve=done;})));
  const {container}=make(()=>signedIn);signedIn=false;resolve(response());
  await vi.waitFor(()=>expect(container.textContent).toContain('Log in or create your NCEAStudy account'));
  expect(container.querySelector('iframe')).toBeNull();
 });
 it('times out a stalled probe, keeps retry available and never starts a late frame',async()=>{
  vi.useFakeTimers();let resolve!:(response:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(done=>{resolve=done;})));
  const {container}=make();await vi.advanceTimersByTimeAsync(10_000);
  expect(container.textContent).toContain('Study is not available inside this site yet.');
  resolve(response());await Promise.resolve();await Promise.resolve();expect(container.querySelector('iframe')).toBeNull();
 });
 it('times out an unverified frame response without keeping hidden auth DOM alive',async()=>{
  vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(async()=>response()));const {container}=make();
  await vi.advanceTimersByTimeAsync(1);expect(container.querySelector('iframe')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(15_000);expect(container.textContent).toContain('Study could not open securely.');
  expect(container.querySelector('iframe')).toBeNull();
 });
 it('does not start signup until consent, and reviews verified labels before explicit confirmation',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response()));const pairing=pair();pairing.status.mockResolvedValueOnce(false);
  const {container,view}=make(()=>true,pairing);
  await vi.waitFor(()=>expect(container.textContent).toContain('Continue to Whetū account setup'));
  expect(container.querySelector('iframe')).toBeNull();expect(pairing.start).not.toHaveBeenCalled();
  const start=container.querySelector<HTMLButtonElement>('button')!;start.click();start.click();
  await vi.waitFor(()=>expect(container.querySelector('iframe')).not.toBeNull());expect(pairing.start).toHaveBeenCalledOnce();
  const signup=container.querySelector('iframe')!;frameLoaded(signup);
  expect(container.textContent).toContain('Review account link');expect(pairing.review).not.toHaveBeenCalled();
  view.pause();view.resume();expect(container.querySelector('iframe')).toBe(signup);
  container.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(()=>expect(container.textContent).toContain('Link NCEAStudy account “StudyPlayer” with Whetū account “student@example.test”?'));
  expect(pairing.confirm).not.toHaveBeenCalled();
  container.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(()=>expect(pairing.confirm).toHaveBeenCalledWith('b'.repeat(64)));
  await vi.waitFor(()=>expect(container.querySelector('iframe')).not.toBe(signup));
  expect(pairing.status).toHaveBeenCalledTimes(2);
  frameLoaded(container.querySelector('iframe')!);expect(container.querySelector<HTMLElement>('.whetu-study-state')!.hidden).toBe(true);
 });
 it('renders server-verified labels only as text and refuses an unverified confirm result',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response()));const pairing=pair();pairing.status.mockResolvedValue(false);
  pairing.review.mockResolvedValue({qccUsername:'StudyPlayer',whetuLabel:'<img src=x onerror=alert(1)>',challenge:'b'.repeat(64)});
  const {container}=make(()=>true,pairing);
  await vi.waitFor(()=>expect(container.textContent).toContain('Continue to Whetū account setup'));container.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(()=>expect(container.querySelector('iframe')).not.toBeNull());const signup=container.querySelector('iframe')!;frameLoaded(signup);
  container.querySelector<HTMLButtonElement>('button')!.click();await vi.waitFor(()=>expect(container.textContent).toContain('<img src=x'));
  expect(container.querySelector('img')).toBeNull();container.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(()=>expect(container.textContent).toContain('The link is not verified.'));
  expect(container.querySelector('iframe')).toBe(signup);expect(pairing.confirm).toHaveBeenCalledOnce();
 });
 it('never retries an uncertain confirmation and checks the live link instead',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response()));const pairing=pair();pairing.status.mockResolvedValueOnce(false);pairing.confirm.mockRejectedValueOnce(new Error('network'));
  const {container}=make(()=>true,pairing);
  await vi.waitFor(()=>expect(container.textContent).toContain('Continue to Whetū account setup'));container.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(()=>expect(container.querySelector('iframe')).not.toBeNull());frameLoaded(container.querySelector('iframe')!);
  container.querySelector<HTMLButtonElement>('button')!.click();await vi.waitFor(()=>expect(container.textContent).toContain('Confirm account link'));container.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(()=>expect(container.textContent).toContain('Check link status'));expect(pairing.confirm).toHaveBeenCalledOnce();
  container.querySelector<HTMLButtonElement>('button')!.click();await vi.waitFor(()=>expect(pairing.status).toHaveBeenCalledTimes(2));expect(pairing.confirm).toHaveBeenCalledOnce();
 });
 it('disposes a pending signup immediately and queues intent cleanup even with start in flight',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response()));const pairing=pair();pairing.status.mockResolvedValue(false);
  let release!:()=>void;pairing.start.mockImplementation(()=>new Promise<void>(done=>{release=done;}));const {container,view}=make(()=>true,pairing);
  await vi.waitFor(()=>expect(container.textContent).toContain('Continue to Whetū account setup'));container.querySelector<HTMLButtonElement>('button')!.click();
  view.dispose();expect(pairing.cancel).toHaveBeenCalledOnce();release();await Promise.resolve();await Promise.resolve();expect(container.querySelector('iframe')).toBeNull();
 });
 it('removes signup before cancellation and will not restart setup until revocation succeeds',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response()));const pairing=pair();pairing.status.mockResolvedValue(false);pairing.cancel.mockRejectedValueOnce(new Error('offline'));
  const {container}=make(()=>true,pairing);
  await vi.waitFor(()=>expect(container.textContent).toContain('Continue to Whetū account setup'));container.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(()=>expect(container.querySelector('iframe')).not.toBeNull());frameLoaded(container.querySelector('iframe')!);
  [...container.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Cancel linking')!.click();
  expect(container.querySelector('iframe')).toBeNull();await vi.waitFor(()=>expect(container.textContent).toContain('Try closing again'));
  expect(container.textContent).not.toContain('Continue to Whetū account setup');container.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(()=>expect(container.textContent).toContain('Continue to Whetū account setup'));
 });

 it('lets an expired or changed linked session recheck account setup without browser credential messages',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response()));const pairing=pair();const {container}=make(()=>true,pairing);
  await vi.waitFor(()=>expect(container.querySelector('iframe')).not.toBeNull());frameLoaded(container.querySelector('iframe')!);
  const reconnect=container.querySelector<HTMLButtonElement>('.whetu-study-connection')!;expect(reconnect.hidden).toBe(false);
  pairing.status.mockResolvedValueOnce(false);reconnect.click();expect(container.querySelector('iframe')).toBeNull();
  await vi.waitFor(()=>expect(container.textContent).toContain('Continue to Whetū account setup'));expect(pairing.start).not.toHaveBeenCalled();
 });

});
