import {describe,expect,it,vi} from 'vitest';
import {AppApi,ApiError} from '../../src/apps/api';
import {SocialClient} from '../../src/social/client';
import {ChatClient} from '../../src/chat/client';
import {mediaUrl,uploadImage} from '../../src/media/client';

const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
const mock=(...responses:Array<Response|Error>)=>{const f=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>{const r=responses.shift()!;if(r instanceof Error)throw r;return r;});return f;};
const call=(f:ReturnType<typeof mock>,i=0)=>({url:String(f.mock.calls[i]![0]),init:f.mock.calls[i]![1] as RequestInit});

describe('AppApi',()=>{
 it('GET puts action and params in the query and sends the bearer token',async()=>{
  const f=mock(json({ok:1}));const api=new AppApi('/e',()=>'tok',f as any);
  expect(await api.get('feed',{tab:'discover',cursor:'a b'})).toEqual({ok:1});
  const {url,init}=call(f);
  expect(url).toBe('/e?action=feed&tab=discover&cursor=a+b');
  expect(init.method).toBe('GET');expect(init.cache).toBe('no-store');
  expect((init.headers as any).Authorization).toBe('Bearer tok');
  expect(init.signal).toBeInstanceOf(AbortSignal);
 });
 it('POST sends JSON and omits Authorization without a token',async()=>{
  const f=mock(json({ok:1}));await new AppApi('/e',()=>null,f as any).post('like',{id:'1',on:true});
  const {url,init}=call(f);
  expect(url).toBe('/e?action=like');expect(init.method).toBe('POST');expect(init.body).toBe('{"id":"1","on":true}');
  expect((init.headers as any)['Content-Type']).toBe('application/json');expect((init.headers as any).Authorization).toBeUndefined();
 });
 it('maps 429 with Retry-After',async()=>{
  const f=mock(json({error:'rate_limited',message:'Too many requests.'},429,{'Retry-After':'120'}));
  const error=await new AppApi('/e',()=>'t',f as any).post('like',{}).catch(e=>e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({status:429,code:'rate_limited',retryAfter:120,message:"That's a lot of likes. Try again in 2 min."});
 });
 it('surfaces server codes and messages, and handles non-code errors',async()=>{
  const f=mock(json({error:'media_not_configured'},503),json({error:'Please log in again.'},401),new Response('<html>',{status:502}));
  const api=new AppApi('/e',()=>null,f as any);
  expect(await api.get('x').catch(e=>e)).toMatchObject({status:503,code:'media_not_configured',message:'Photos are unavailable right now.',retryAfter:null});
  expect(await api.get('x').catch(e=>e)).toMatchObject({status:401,code:'unauthorized',message:'Please log in again.'});
  expect(await api.get('x').catch(e=>e)).toMatchObject({status:502,code:'http_502'});
 });
 it('maps network failure',async()=>{
  const error=await new AppApi('/e',()=>null,mock(new TypeError('failed')) as any).get('x').catch(e=>e);
  expect(error).toMatchObject({status:0,code:'network'});
 });
 it('times out',async()=>{
  const f=vi.fn((_u:any,init:RequestInit)=>new Promise<Response>((_,reject)=>init.signal!.addEventListener('abort',()=>reject(init.signal!.reason))));
  const error=await new AppApi('/e',()=>null,f as any,20).get('x').catch(e=>e);
  expect(error).toMatchObject({status:0,code:'timeout'});
 });
 it('rethrows the caller abort untouched',async()=>{
  const controller=new AbortController();
  const f=vi.fn((_u:any,init:RequestInit)=>new Promise<Response>((_,reject)=>init.signal!.addEventListener('abort',()=>reject(new DOMException('x','AbortError')))));
  const pending=new AppApi('/e',()=>null,f as any).get('x',{},controller.signal).catch(e=>e);
  controller.abort();
  expect(await pending).toMatchObject({name:'AbortError'});
 });
});

describe('AppApi without AbortSignal.any',()=>{
 const hang=()=>vi.fn((_u:any,init:RequestInit)=>new Promise<Response>((_,reject)=>init.signal!.addEventListener('abort',()=>reject(init.signal!.reason))));
 it('still honours the caller signal and the timeout',async()=>{
  const original=(AbortSignal as any).any;(AbortSignal as any).any=undefined;
  try{
   const controller=new AbortController();
   const pending=new AppApi('/e',()=>null,hang() as any).get('x',{},controller.signal).catch(e=>e);
   controller.abort();
   expect(await pending).toMatchObject({name:'AbortError'});
   expect(await new AppApi('/e',()=>null,hang() as any,20).get('x').catch(e=>e)).toMatchObject({status:0,code:'timeout'});
   const done=controller;expect(done.signal.aborted).toBe(true);
  }finally{(AbortSignal as any).any=original;}
 });
 it('cannot be overridden by params.action',async()=>{
  const f=mock(json({}));await new AppApi('/e',()=>null,f as any).get('feed',{action:'evil'});
  expect(call(f).url).toBe('/e?action=feed');
 });
 it('maps a snap body-read failure to ApiError network',async()=>{
  const body=new Response('x',{status:200});(body as any).blob=()=>Promise.reject(new TypeError('terminated'));
  const error=await new ChatClient(()=>'t',mock(body) as any).openSnap('9').catch(e=>e);
  expect(error).toBeInstanceOf(ApiError);expect(error).toMatchObject({status:0,code:'network'});
 });
});

describe('SocialClient',()=>{
 it('a feed read waits for an in-flight follow, so Following shows the new author',async()=>{
  let release!:()=>void;const order:string[]=[];
  const f=vi.fn(async(url:RequestInfo|URL)=>{const u=String(url);
   if(u.includes('action=follow')){await new Promise<void>(r=>{release=r;});order.push('follow done');return json({followedByMe:true,followers:1});}
   order.push('feed sent');return json({items:[],next:null});});
  const c=new SocialClient(()=>'t',f as any);
  const follow=c.follow('sam',true),feed=c.feed('following');
  await Promise.resolve();await Promise.resolve();
  expect(order).toEqual([]);
  release();await Promise.all([follow,feed]);
  expect(order).toEqual(['follow done','feed sent']);
 });
 it('a failed follow does not block later feed reads',async()=>{
  const f=mock(new Error('offline'),json({items:[],next:null}));const c=new SocialClient(()=>'t',f as any);
  await expect(c.follow('sam',true)).rejects.toThrow();
  await expect(c.feed('discover')).resolves.toEqual({items:[],next:null});
 });
 it('matches the server contract',async()=>{
  const f=mock(...Array.from({length:16},()=>json({})));const c=new SocialClient(()=>'t',f as any);
  await c.me();await c.feed('following','c1');await c.thread('p');await c.profile('sam');await c.posts('sam','likes','c2');await c.search('kiwi');await c.activity();await c.blocks();
  await c.createPost('hi',['m_a'],'r1');await c.deletePost('p');await c.like('p',true);await c.follow('sam',false);await c.block('sam',true);
  await c.report({kind:'post',id:'p',category:'spam'});await c.updateProfile({bio:'x',avatarId:null});await c.deleteAll();
  const seen=f.mock.calls.map((_,i)=>{const {url,init}=call(f,i);return [url,init.body??null];});
  expect(seen).toEqual([
   ['/.netlify/functions/social?action=me',null],
   ['/.netlify/functions/social?action=feed&tab=following&cursor=c1',null],
   ['/.netlify/functions/social?action=thread&id=p',null],
   ['/.netlify/functions/social?action=profile&username=sam',null],
   ['/.netlify/functions/social?action=posts&username=sam&kind=likes&cursor=c2',null],
   ['/.netlify/functions/social?action=search&q=kiwi',null],
   ['/.netlify/functions/social?action=activity',null],
   ['/.netlify/functions/social?action=blocks',null],
   ['/.netlify/functions/social?action=post','{"body":"hi","media":["m_a"],"replyTo":"r1"}'],
   ['/.netlify/functions/social?action=delete_post','{"id":"p"}'],
   ['/.netlify/functions/social?action=like','{"id":"p","on":true}'],
   ['/.netlify/functions/social?action=follow','{"username":"sam","on":false}'],
   ['/.netlify/functions/social?action=block','{"username":"sam","on":true}'],
   ['/.netlify/functions/social?action=report','{"kind":"post","id":"p","category":"spam"}'],
   ['/.netlify/functions/social?action=profile','{"bio":"x","avatarId":null}'],
   ['/.netlify/functions/social?action=delete_all','{"confirm":"DELETE"}']
  ]);
 });
});

describe('ChatClient',()=>{
 it('matches the server contract',async()=>{
  const f=mock(...Array.from({length:13},()=>json({})));const c=new ChatClient(()=>'t',f as any);
  await c.summary();await c.list();await c.messages('sam','42');await c.request('sam');await c.respond('sam',true);await c.removeFriend('sam');
  await c.send('sam',{kind:'text',body:'yo'});await c.save('7',true);await c.unsend('7');await c.retention('sam','week');await c.deleteConversation('sam');
  await c.report('7','spam','n');await c.block('sam');
  const seen=f.mock.calls.map((_,i)=>{const {url,init}=call(f,i);return [url.replace('/.netlify/functions/chat',''),init.body??null];});
  expect(seen).toEqual([
   ['?action=summary',null],['?action=list',null],['?action=messages&with=sam&after=42',null],
   ['?action=request','{"username":"sam"}'],['?action=respond','{"username":"sam","accept":true}'],['?action=remove_friend','{"username":"sam"}'],
   ['?action=send','{"to":"sam","kind":"text","body":"yo"}'],['?action=save','{"id":"7","on":true}'],['?action=unsend','{"id":"7"}'],
   ['?action=retention','{"with":"sam","mode":"week"}'],['?action=delete_conversation','{"with":"sam"}'],
   ['?action=report','{"messageId":"7","category":"spam","note":"n"}'],['?action=block','{"username":"sam"}']
  ]);
 });
 it('openSnap returns a Blob and maps 410 to opened',async()=>{
  const f=mock(new Response(new Uint8Array([1,2,3]),{status:200}),json({error:'opened'},410));
  const c=new ChatClient(()=>'t',f as any);
  const blob=await c.openSnap('9');expect(blob.size).toBe(3);
  expect(call(f).init.method).toBe('POST');
  expect(await c.openSnap('9').catch(e=>e)).toMatchObject({status:410,code:'opened'});
 });
});

class FakeXhr {
 static last:FakeXhr;
 headers:Record<string,string>={};method='';url='';status=0;responseText='';timeout=0;sent:unknown=null;aborted=false;
 upload:{onprogress:null|((e:{lengthComputable:boolean;loaded:number;total:number})=>void)}={onprogress:null};
 onload:null|(()=>void)=null;onerror:null|(()=>void)=null;ontimeout:null|(()=>void)=null;onabort:null|(()=>void)=null;
 responseHeaders:Record<string,string>={};
 constructor(){FakeXhr.last=this;}
 open(method:string,url:string){this.method=method;this.url=url;}
 setRequestHeader(k:string,v:string){this.headers[k]=v;}
 getResponseHeader(k:string){return this.responseHeaders[k]??null;}
 send(body:unknown){this.sent=body;}
 abort(){this.aborted=true;this.onabort?.();}
 finish(status:number,body:unknown){this.status=status;this.responseText=JSON.stringify(body);this.onload?.();}
}
describe('uploadImage and mediaUrl',()=>{
 const Xhr=FakeXhr as unknown as new()=>XMLHttpRequest;
 const id='m_'+'a'.repeat(32);
 it('builds media urls',()=>{expect(mediaUrl('m_x y','thumb')).toBe('/.netlify/functions/media?action=get&id=m_x%20y&v=thumb');});
 it('uploads with headers, progress and result',async()=>{
  const progress:number[]=[];const blob=new Blob(['abc'],{type:'image/jpeg'});
  const pending=uploadImage(blob,'post','tok',{onProgress:p=>progress.push(p),xhr:Xhr});
  const x=FakeXhr.last;
  expect(x.method).toBe('POST');expect(x.url).toBe('/.netlify/functions/media?action=upload&purpose=post');
  expect(x.headers).toEqual({'Content-Type':'image/jpeg',Authorization:'Bearer tok'});
  // The bytes go up as an ArrayBuffer (WebKit request interception cannot read a Blob body).
  await vi.waitFor(()=>expect(x.sent).toBeInstanceOf(ArrayBuffer));
  expect(new TextDecoder().decode(x.sent as ArrayBuffer)).toBe('abc');
  x.upload.onprogress!({lengthComputable:true,loaded:1,total:4});x.upload.onprogress!({lengthComputable:true,loaded:4,total:4});
  x.finish(201,{id,width:10,height:5,bytes:3,thumb:true});
  expect(await pending).toEqual({id,width:10,height:5,thumb:true});expect(progress).toEqual([0.25,1]);
 });
 it('falls back to octet-stream and omits auth without a token',async()=>{
  const pending=uploadImage(new Blob(['x']),'avatar',null,{xhr:Xhr});const x=FakeXhr.last;
  expect(x.headers).toEqual({'Content-Type':'application/octet-stream'});x.finish(201,{id,width:1,height:1,thumb:false});await pending;
 });
 it('maps non-2xx, network errors and aborts',async()=>{
  let p=uploadImage(new Blob(['x']),'post','t',{xhr:Xhr});FakeXhr.last.responseHeaders['Retry-After']='30';FakeXhr.last.finish(429,{error:'rate_limited',message:'x'});
  expect(await p.catch(e=>e)).toMatchObject({status:429,code:'rate_limited',retryAfter:30,message:"You've added a lot of photos today. Try again tomorrow."});
  p=uploadImage(new Blob(['x']),'post','t',{xhr:Xhr});FakeXhr.last.finish(422,{error:'corrupt',message:'Bad photo.'});
  expect(await p.catch(e=>e)).toMatchObject({status:422,code:'corrupt',message:'Bad photo.'});
  p=uploadImage(new Blob(['x']),'post','t',{xhr:Xhr});FakeXhr.last.onerror!();
  expect(await p.catch(e=>e)).toMatchObject({status:0,code:'network'});
  const controller=new AbortController();
  p=uploadImage(new Blob(['x']),'post','t',{xhr:Xhr,signal:controller.signal});controller.abort();
  const error=await p.catch(e=>e);expect(error).toBeInstanceOf(DOMException);expect(error.name).toBe('AbortError');expect(FakeXhr.last.aborted).toBe(true);
  controller.abort();
  expect((await uploadImage(new Blob(['x']),'post','t',{xhr:Xhr,signal:controller.signal}).catch(e=>e)).name).toBe('AbortError');
 });
});
