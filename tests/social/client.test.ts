import {setImmediate as nextTurn} from 'node:timers/promises';
import {describe,expect,it} from 'vitest';
import {SocialClient} from '../../src/social/client';
import type {PostView} from '../../src/social/shared';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const post=(username:string):PostView=>({id:`post-${username}`,author:{username,displayName:username,avatar:null},body:`Post by ${username}`,media:[],replyTo:null,replyToUsername:null,createdAt:'2026-11-05T00:00:00.000Z',likes:0,replies:0,liked:false,mine:false,deleted:false,hidden:false});
function harness(initial:string[]=[]){
 let token:string|null='account-a';
 const following=new Map<string|null,Set<string>>([[token,new Set(initial)]]);
 const writes:Array<{token:string|null;username:string;on:boolean;response:ReturnType<typeof deferred<Response>>}>=[];
 const reads:Array<{token:string|null;tab:string|null;cursor:string|null}>=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const url=new URL(String(input),'https://qcc.test');
  const authorization=new Headers(init?.headers).get('Authorization');
  const identity=authorization?.replace(/^Bearer /,'')??null;
  if(url.searchParams.get('action')==='follow'){
   const {username,on}=JSON.parse(String(init?.body)) as {username:string;on:boolean};
   const response=deferred<Response>();writes.push({token:identity,username,on,response});return response.promise;
  }
  if(url.searchParams.get('action')==='feed'){
   const tab=url.searchParams.get('tab');reads.push({token:identity,tab,cursor:url.searchParams.get('cursor')});
   return json({items:tab==='discover'?[post('public')]:[...(following.get(identity)??[])].map(post),cursor:null});
  }
  throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
 };
 const client=new SocialClient(()=>token,fetcher);
 const complete=(index:number,status=200)=>{
  const write=writes[index]!;
  if(status===200){
   const users=following.get(write.token)??new Set<string>();following.set(write.token,users);
   if(write.on)users.add(write.username);else users.delete(write.username);
   write.response.resolve(json({followedByMe:write.on,followers:write.on?1:0}));
  }else write.response.resolve(json({error:'rate_limited'},status));
 };
 return {client,writes,reads,complete,switchIdentity:(next:string|null)=>{token=next;}};
}

describe('Following reads after pending follow changes',()=>{
 for(const on of [true,false])it(`waits for a pending ${on?'follow':'unfollow'} before reading authoritative posts`,async()=>{
  const h=harness(on?[]:['sam']);
  const write=h.client.follow('sam',on),read=h.client.feed('following','next-page');
  await nextTurn();expect(h.reads).toEqual([]);
  h.complete(0);await write;
  expect((await read).items).toEqual(on?[post('sam')]:[]);
  expect(h.reads).toEqual([{token:'account-a',tab:'following',cursor:'next-page'}]);
 });

 it('waits for all snapshot writes, even if they complete out of order, for concurrent readers',async()=>{
  const h=harness();const first=h.client.follow('sam',true),second=h.client.follow('lee',true);
  const one=h.client.feed('following'),two=h.client.feed('following');
  h.complete(1);await second;await nextTurn();expect(h.reads).toHaveLength(0);
  h.complete(0);await first;
  expect((await one).items.map(p=>p.author.username).sort()).toEqual(['lee','sam']);
  expect(await two).toEqual(await one);expect(h.reads).toHaveLength(2);
 });

 for(const failure of ['denied','network'] as const)it(`preserves a ${failure} follow error and still reads actual state`,async()=>{
  const h=harness();const write=h.client.follow('sam',true).catch(error=>error),read=h.client.feed('following');
  await nextTurn();expect(h.reads).toHaveLength(0);
  if(failure==='denied')h.complete(0,429);else h.writes[0]!.response.reject(new TypeError('Connection failed'));
  expect(await write).toMatchObject(failure==='denied'?{status:429,code:'rate_limited'}:{status:0,code:'network'});
  expect((await read).items).toEqual([]);expect(h.reads).toHaveLength(1);
 });

 it('keeps Discover and Following without pending changes immediate',async()=>{
  const h=harness();const initial=h.client.feed('following');expect(h.reads).toHaveLength(1);await initial;
  const write=h.client.follow('sam',true),discover=h.client.feed('discover');
  expect(h.reads).toHaveLength(2);expect((await discover).items).toEqual([post('public')]);
  h.complete(0);await write;
  const following=h.client.feed('following');expect(h.reads).toHaveLength(3);expect((await following).items).toEqual([post('sam')]);
 });

 it('aborts a waiting read promptly without cancelling the mutation or dispatching a later GET',async()=>{
  const h=harness(),controller=new AbortController(),reason=new DOMException('Left Social','AbortError');
  const write=h.client.follow('sam',true),read=h.client.feed('following',null,controller.signal).catch(error=>error);
  controller.abort(reason);expect(await read).toBe(reason);expect(h.reads).toHaveLength(0);
  h.complete(0);expect(await write).toEqual({followedByMe:true,followers:1});await nextTurn();expect(h.reads).toHaveLength(0);
  expect((await h.client.feed('following')).items).toEqual([post('sam')]);
 });

 it('does not start a read with an already aborted signal while a mutation is pending',async()=>{
  const h=harness(),controller=new AbortController();controller.abort();
  const write=h.client.follow('sam',true);
  expect(await h.client.feed('following',null,controller.signal).catch(error=>error)).toBe(controller.signal.reason);
  expect(h.reads).toHaveLength(0);h.complete(0);await write;
 });

 it('rechecks cancellation after the mutation settles but before dispatching GET',async()=>{
  const h=harness(),controller=new AbortController();
  const write=h.client.follow('sam',true),read=h.client.feed('following',null,controller.signal).catch(error=>error);
  void write.then(()=>controller.abort());h.complete(0);await write;
  expect(await read).toBe(controller.signal.reason);expect(h.reads).toHaveLength(0);
 });

 it('does not delay a new account or send an old waiting read using its credentials',async()=>{
  const h=harness();const write=h.client.follow('sam',true),oldRead=h.client.feed('following').catch(error=>error);
  h.switchIdentity('account-b');const fresh=h.client.feed('following');
  expect(h.reads).toEqual([{token:'account-b',tab:'following',cursor:null}]);expect((await fresh).items).toEqual([]);
  h.complete(0);await write;expect(await oldRead).toMatchObject({name:'AbortError'});expect(h.reads).toHaveLength(1);
 });

 it('keeps a new account mutation tracked when an old account mutation finishes',async()=>{
  const h=harness();const oldWrite=h.client.follow('sam',true),oldRead=h.client.feed('following').catch(error=>error);
  h.switchIdentity('account-b');const newWrite=h.client.follow('lee',true),newRead=h.client.feed('following');
  h.complete(0);await oldWrite;expect(await oldRead).toMatchObject({name:'AbortError'});expect(h.reads).toHaveLength(0);
  h.complete(1);await newWrite;expect((await newRead).items).toEqual([post('lee')]);
  expect(h.reads).toEqual([{token:'account-b',tab:'following',cursor:null}]);
 });

 it('waits only for the mutation snapshot, not for newer writes',async()=>{
  const h=harness();const first=h.client.follow('sam',true),read=h.client.feed('following'),later=h.client.follow('lee',true);
  h.complete(0);await first;expect((await read).items).toEqual([post('sam')]);
  expect(h.reads).toHaveLength(1);h.complete(1);await later;
  expect((await h.client.feed('following')).items.map(p=>p.author.username).sort()).toEqual(['lee','sam']);
 });
});
