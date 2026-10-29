import * as store from '../core/storage';
import {contentHash,stableText} from '../core/content';
import {mergeSaves} from './merge';
import {scoredGame} from '../leaderboard/shared';
import {SAVE_KEYS,MAX_BODY_BYTES,validSave,validRevision,validSessionToken,validUsername,validPassword,type Saves,type SaveRecord,type SaveRevisions,type SyncV2Response} from './shared';
export interface Session {token:string;username:string}
export interface AccountStorage {
 read<T>(key:string,fallback:T):T;write(key:string,value:unknown):boolean;
 remove?(key:string):boolean;invalidate?(key:string):void;keys?():string[];subscribe?(listener:(key:string)=>void):()=>void;
}
export const SYNC_BATCH_MS=3*60*1000;
export const SYNC_STALE_MS=3*60*1000;
const endpoint='/.netlify/functions/accounts',sessionKey='accounts:session';
interface SyncState {cursor:string;revisions:SaveRevisions;hashes:Record<string,string>;pending:string[];batchAt:number;attempt:number;retryAt:number;lastPull:number;blocked:boolean}
const emptyState=():SyncState=>({cursor:'0',revisions:{},hashes:{},pending:[],batchAt:0,attempt:0,retryAt:0,lastPull:0,blocked:false});
const hidden=()=>typeof document!=='undefined'&&document.hidden;
// Ignore only the transfer/shell timestamps, not timestamps that are part of game state.
const fingerprint=(key:string,record:SaveRecord)=>contentHash(key.startsWith('save:')?{version:1,data:(record.value as {data:unknown}).data}:record.value);
const readSaves=(value:unknown):value is Saves=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=SAVE_KEYS.length&&Object.entries(value).every(([key,record])=>validSave(key,record,Infinity));
function readResult(value:any):SyncV2Response {
 const revisions=(map:unknown):map is SaveRevisions=>!!map&&typeof map==='object'&&!Array.isArray(map)&&Object.entries(map).every(([key,rev])=>SAVE_KEYS.includes(key)&&validRevision(rev));
 if(!value||value.protocolVersion!==2||!validRevision(value.cursor)||!readSaves(value.saves)||!readSaves(value.conflicts)||!revisions(value.revisions)||!revisions(value.acks)
  ||Object.keys({...value.saves,...value.conflicts,...value.acks}).some(key=>!validRevision(value.revisions[key])))throw new Error('The saved progress could not be read.');
 return value;
}
class AccountRequestError extends Error {constructor(message:string,readonly retryable:boolean,readonly retryAt=0){super(message);}}
export class AccountsClient {
 message='';beforeIdentityChange=()=>{};
 private listeners=new Set<()=>void>();private muted=false;private epoch=0;private started=false;
 private timer:ReturnType<typeof setTimeout>|undefined;private unsubscribe:(()=>void)|undefined;
 private inFlight:Promise<void>|null=null;private flightEpoch=-1;private pullRequested=false;
 private knownToken:string|null;private state=emptyState();private loggingOut:Promise<void>|null=null;
 constructor(private storage:AccountStorage=store,private fetcher:typeof fetch=globalThis.fetch.bind(globalThis)){
  this.knownToken=this.session()?.token??null;this.loadState();
  this.unsubscribe=storage.subscribe?.(key=>{if(!this.muted&&SAVE_KEYS.includes(key)&&this.session()){this.track(key);this.schedule();}});
 }
 session():Session|null {
  const value=this.storage.read<Session|null>(sessionKey,null);
  return value&&validSessionToken(value.token)&&validUsername(value.username)?value:null;
 }
 onChange(listener:()=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
 private emit(){for(const listener of this.listeners)listener();}
 private remove(key:string){if(this.storage.remove)this.storage.remove(key);else this.storage.write(key,null);}
 private stateKey(){return 'accounts:sync:'+this.session()?.username.toLowerCase();}
 private loadState(){
  this.state=emptyState();if(!this.session())return;
  const saved=this.storage.read<Partial<SyncState>>(this.stateKey(),{});
  this.state.blocked=saved?.blocked===true;
  if(validRevision(saved?.cursor))this.state.cursor=saved.cursor;
  for(const [key,rev] of Object.entries(saved?.revisions??{}))if(SAVE_KEYS.includes(key)&&validRevision(rev))this.state.revisions[key]=rev;
  for(const [key,hash] of Object.entries(saved?.hashes??{}))if(SAVE_KEYS.includes(key)&&typeof hash==='string')this.state.hashes[key]=hash;
  if(Array.isArray(saved?.pending))this.state.pending=saved.pending.filter(key=>SAVE_KEYS.includes(key));
  for(const key of ['batchAt','attempt','retryAt','lastPull'] as const)if(Number.isSafeInteger(saved?.[key])&&saved[key]!>=0)this.state[key]=saved[key]!;
 }
 private persist(){if(this.session())this.storage.write(this.stateKey(),this.state);}
 private track(key?:string){
  const records=this.collect(),pending=new Set(this.state.pending);
  for(const name of key?[key]:SAVE_KEYS){const record=records[name];if(record&&fingerprint(name,record)!==this.state.hashes[name])pending.add(name);else pending.delete(name);}
  this.state.pending=[...pending];if(pending.size&&!this.state.batchAt)this.state.batchAt=Date.now()+SYNC_BATCH_MS;
  if(!pending.size)this.state.batchAt=0;this.persist();
 }
 private schedule(){
  clearTimeout(this.timer);this.timer=undefined;if(!this.session()||hidden()||this.state.blocked)return;
  const due=this.state.retryAt|| (this.state.pending.length?this.state.batchAt:0);if(!due)return;
  this.timer=setTimeout(()=>{this.timer=undefined;void this.flush(false,this.pullRequested).catch(()=>{});},Math.max(0,due-Date.now()));
 }
 guest(){this.storage.write('accounts:guest',true);this.emit();}
 private collect():Saves {
  const result:Saves={};
  for(const key of SAVE_KEYS){
   const value=this.storage.read<unknown>(key,undefined);if(value===undefined||value===null)continue;
   const updated=key.startsWith('save:')?(value as {updated?:number})?.updated??0:this.storage.read('updated:'+key,0);
   const record={value:key.startsWith('save:')&&typeof value==='object'?{...value,updated}:value,updated};
   if(validSave(key,record,Infinity))result[key]=record;
  }
  return result;
 }
 private apply(saves:Saves){
  const current=this.collect();this.muted=true;
  try{for(const [key,record] of Object.entries(saves)){
   const old=current[key];if(stableText(old)===stableText(record))continue;
   this.storage.write(key,record.value);if(!key.startsWith('save:'))this.storage.write('updated:'+key,record.updated);
  }}finally{this.muted=false;}
 }
 private clear(){
  this.muted=true;
  try{
   for(const key of SAVE_KEYS){this.remove(key);this.remove('updated:'+key);}
   for(const key of this.storage.keys?.()??[])if(key.startsWith('leaderboard:cache:')||(key.includes(':account:')&&!key.startsWith('leaderboard:pending:')&&!key.startsWith('leaderboard:retry:')))this.remove(key);
   this.remove('corn-clicker:backups');this.remove('corn-clicker:lock');
  }finally{this.muted=false;}
 }
 private backup(){
  const values:Record<string,unknown>={};
  for(const key of [...SAVE_KEYS,...SAVE_KEYS.map(k=>'updated:'+k),'corn-clicker:backups']){const value=this.storage.read(key,undefined);if(value!==undefined)values[key]=value;}
  this.storage.write('accounts:guest-backup',values);
 }
 private restoreGuest(){
  const values=this.storage.read<Record<string,unknown>>('accounts:guest-backup',{});
  this.muted=true;try{for(const [key,value] of Object.entries(values))if(SAVE_KEYS.includes(key)||key.startsWith('updated:')||key==='corn-clicker:backups')this.storage.write(key,value);}finally{this.muted=false;}
  this.remove('accounts:guest-backup');
 }
 private async response(action:string,method:string,body:unknown,token?:string,keepalive=false){
  const response=await this.fetcher(`${endpoint}?action=${action}`,{method,headers:{...(action.startsWith('sync')?{'X-QCC-Sync':'2'}:{}),...(token?{Authorization:`Bearer ${token}`}:{}) ,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(8000),keepalive});
  if(!response.ok){
   let text='Accounts are unavailable. Your progress stays on this browser.';try{const data=await response.json();if(typeof data.error==='string')text=data.error==='read_only'?'Cloud saves are temporarily read only. Your progress is queued on this browser.':data.error;}catch{}
   const retry=response.headers.get('Retry-After'),seconds=retry!==null?Number(retry):NaN;
   const retryAt=retry===null?0:Number.isFinite(seconds)?Date.now()+Math.max(0,seconds)*1000:Math.max(0,Date.parse(retry)||0);
   throw new AccountRequestError(text,[429,503].includes(response.status),retryAt);
  }
  return response;
 }
 async authenticate(action:'signup'|'login',username:string,password:string):Promise<void>{
  if(!validUsername(username)||!validPassword(password))throw new Error('Use a username of 3–24 letters, digits, underscores, hyphens or dots, and a password of 8–128 characters.');
  const epoch=this.epoch;
  const response=await this.response(action,'POST',{username,password});
  const session=await response.json();if(!validSessionToken(session.token)||!validUsername(session.username))throw new Error('The account response could not be read.');
  let initial:SyncV2Response|undefined;
  if(action==='login')try{initial=readResult(await(await this.response('sync&cursor=0','GET',undefined,session.token)).json());}catch(error){void this.revoke(session.token).catch(()=>{});throw error;}
  if(epoch!==this.epoch){void this.revoke(session.token).catch(()=>{});throw new Error('Account changed. Please try again.');}
  if(this.session())await this.logout();
  this.beforeIdentityChange();this.epoch++;this.backup();const imported=action==='signup'?Object.fromEntries(Object.entries(this.collect()).filter(([key])=>!scoredGame(key.slice(key.indexOf(':')+1)))):{};
  const staged=this.staged(this.storage.read<Saves>('accounts:pending:'+session.username.toLowerCase(),{}));
  this.clear();this.storage.write(sessionKey,{token:session.token,username:session.username});this.knownToken=session.token;this.loadState();
  // A fresh full pull replaces the old acknowledgement baseline, retaining retry deadlines.
  this.state.blocked=false;this.state.cursor='0';this.state.hashes={};this.state.revisions={};this.state.pending=[];
  if(initial)this.reconcile(initial,{});
  this.apply(mergeSaves(this.collect(),mergeSaves(imported,staged)));this.track();
  this.storage.write('accounts:guest',true);this.message='';this.emit();
  try{await this.flush(false,false);}catch{this.message='Signed in. Playing locally until your saves can sync.';this.emit();}
 }
 private staged(value:unknown):Saves {
  const result:Saves={};if(!value||typeof value!=='object'||Array.isArray(value))return result;
  for(const [key,record] of Object.entries(value))if(validSave(key,record,Infinity))result[key]=record;
  return result;
 }
 private stage(username:string){
  const unsent:Saves={};for(const [key,record] of Object.entries(this.collect()))if(fingerprint(key,record)!==this.state.hashes[key])unsent[key]=record;
  const key='accounts:pending:'+username.toLowerCase();if(Object.keys(unsent).length)this.storage.write(key,unsent);else this.remove(key);
 }
 private async revoke(token:string){
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');
  const queue=this.storage.read<string[]>('accounts:revocations',[]);this.storage.write('accounts:revocations',[...new Set([...queue,hash])]);await this.revocations();
 }
 private async revocations(){
  for(const hash of this.storage.read<string[]>('accounts:revocations',[])){
   if(!/^[a-f0-9]{64}$/.test(hash))continue;
   await this.response('logout','POST',{sessionHash:hash},undefined,true);
   this.storage.write('accounts:revocations',this.storage.read<string[]>('accounts:revocations',[]).filter(h=>h!==hash));
  }
 }
 logout():Promise<void>{
  if(this.loggingOut)return this.loggingOut;
  this.loggingOut=this.signOut().finally(()=>{this.loggingOut=null;});return this.loggingOut;
 }
 private async signOut():Promise<void>{
  const epoch=this.epoch,session=this.session();if(!session){this.guest();return;}
  try{await this.flush(false,false);}catch{/* Durable pending progress is staged before clearing this identity. */}
  if(epoch!==this.epoch||this.session()?.token!==session.token)return;
  this.beforeIdentityChange();this.stage(session.username);this.epoch++;clearTimeout(this.timer);this.clear();this.remove(sessionKey);this.knownToken=null;this.state=emptyState();this.restoreGuest();this.guest();this.message='';this.emit();
  try{await this.revoke(session.token);}catch{this.message='Logged out on this browser. Server sign-out will retry when online.';this.emit();}
 }
 /** Manual calls pull too; scheduled/lifecycle callers explicitly request dirty-only work. */
 flush(keepalive=false,pull=true):Promise<void>{
  if((hidden()&&!keepalive)||(!pull&&this.state.blocked))return Promise.resolve();
  if(pull)this.state.blocked=false;this.pullRequested||=pull;
  if(this.inFlight&&this.flightEpoch===this.epoch)return this.inFlight;
  const pending=this.sync(keepalive);const flight=pending.finally(()=>{if(this.inFlight===flight)this.inFlight=null;});this.inFlight=flight;this.flightEpoch=this.epoch;return flight;
 }
 private reconcile(result:SyncV2Response,sent:Saves){
  const local=this.collect(),incoming={...result.saves,...result.conflicts};
  for(const [key,record] of Object.entries(incoming)){
   const own=local[key],dirty=own&&fingerprint(key,own)!==this.state.hashes[key];
   this.apply(dirty?mergeSaves({[key]:record},{[key]:own}):{[key]:record});
   this.state.hashes[key]=fingerprint(key,record);this.state.revisions[key]=result.revisions[key]!;
  }
  for(const [key,revision] of Object.entries(result.acks)){
   const record=sent[key];if(!record)continue;
   // The signature acknowledges exactly the sent content. A later local edit stays dirty.
   this.state.hashes[key]=fingerprint(key,record);this.state.revisions[key]=revision;
  }
  this.state.cursor=result.cursor;this.state.lastPull=Date.now();this.track();
 }
 private async sync(keepalive:boolean){
  clearTimeout(this.timer);this.timer=undefined;
  const session=this.session(),epoch=this.epoch;if(!session)return;
  const current=()=>epoch===this.epoch&&this.session()?.token===session.token;
  if(this.state.retryAt>Date.now()){this.schedule();return;}
  try{
   this.track();const records=this.collect(),saves:Saves={};
   for(const key of this.state.pending){const record=records[key];if(!record)continue;if(validSave(key,record))saves[key]=record;else this.message='A save is too large or incompatible to sync. It stays on this browser; other progress still syncs.';}
   const limit=keepalive?60000:MAX_BODY_BYTES-2048,batches:Saves[]=[];let batch:Saves={};
   const body=(saves:Saves)=>({cursor:this.state.cursor,bases:Object.fromEntries(Object.keys(saves).map(key=>[key,this.state.revisions[key]??'0'])),saves});
   const fits=(saves:Saves)=>new TextEncoder().encode(JSON.stringify(body(saves))).length<limit;
   for(const [key,record] of Object.entries(saves)){
    if(!fits({[key]:record}))continue;
    if(!fits({...batch,[key]:record})){batches.push(batch);batch={};}batch[key]=record;
   }
   if(Object.keys(batch).length)batches.push(batch);
   const pull=this.pullRequested&&!keepalive;this.pullRequested=false;
   if(!batches.length&&pull){const response=await this.response('sync&cursor='+this.state.cursor,'GET',undefined,session.token);if(!current())return;const result=readResult(await response.json());if(!current())return;this.reconcile(result,{});}
   for(const sent of batches){
    const response=await this.response('sync','PUT',body(sent),session.token,keepalive);
    if(!current())return;const result=readResult(await response.json());if(!current())return;this.reconcile(result,sent);
   }
   if(current()){
    this.state.blocked=false;this.state.attempt=0;this.state.retryAt=0;
    // Unsyncable/large keepalive records wait for a real lifecycle/visible batch, never spin.
    this.state.batchAt=this.state.pending.length?Date.now()+SYNC_BATCH_MS:0;this.persist();this.stage(session.username);this.schedule();
    if(batches.length||pull){if(!this.message.includes('too large'))this.message='Progress synced.';this.emit();}
   }
  }catch(error){
   if(current()){
    if(!(error instanceof AccountRequestError)||error.retryable){
     this.state.attempt=Math.min(this.state.attempt+1,12);
     const backoff=Math.min(5*60000,1000*2**(this.state.attempt-1))*(1+Math.random()*.25);
     this.state.retryAt=Math.max(Date.now()+backoff,error instanceof AccountRequestError?error.retryAt:0);
     this.pullRequested=true;
    }else this.state.blocked=true;
    this.persist();this.stage(session.username);this.schedule();this.message=error instanceof Error?error.message:'Progress is waiting to sync.';this.emit();
   }
   throw error;
  }
 }
 private online=()=>{if(hidden())return;void this.revocations().catch(()=>{});void this.flush(false,true).catch(()=>{});};
 private pagehide=()=>{queueMicrotask(()=>void this.flush(true,false).catch(()=>{}));};
 private storageChanged=(event:StorageEvent)=>{
  if(event.key?.startsWith('pocket-arcade:v1:')){const key=event.key.slice('pocket-arcade:v1:'.length);if(SAVE_KEYS.includes(key)||key.startsWith('updated:')){this.storage.invalidate?.(key);if(this.session()){this.track();this.schedule();}return;}}
  if(event.key!==`pocket-arcade:v1:${sessionKey}`&&event.key!==null)return;
  for(const key of [sessionKey,...SAVE_KEYS,...SAVE_KEYS.map(k=>'updated:'+k),'corn-clicker:backups','corn-clicker:lock',...(this.storage.keys?.()??[]).filter(k=>k.startsWith('leaderboard:cache:')||k.includes(':account:'))])this.storage.invalidate?.(key);
  const token=this.session()?.token??null;if(token===this.knownToken)return;
  this.beforeIdentityChange();this.knownToken=token;this.epoch++;this.pullRequested=false;this.loadState();clearTimeout(this.timer);this.emit();if(token&&!hidden())void this.flush(false,true).catch(()=>{});
 };
 private visibility=()=>{
  clearTimeout(this.timer);if(hidden())this.pagehide();
  else if(Date.now()-this.state.lastPull>SYNC_STALE_MS)void this.flush(false,true).catch(()=>{});else this.schedule();
 };
 start(listenPagehide=true){
  if(this.started)return;this.started=true;
  if(typeof window!=='undefined'){window.addEventListener('online',this.online);if(listenPagehide)window.addEventListener('pagehide',this.pagehide);window.addEventListener('storage',this.storageChanged);}
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.visibility);
  this.online();
 }
 dispose(){if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.visibility);clearTimeout(this.timer);this.unsubscribe?.();this.epoch++;
  if(typeof window!=='undefined'){window.removeEventListener('online',this.online);window.removeEventListener('pagehide',this.pagehide);window.removeEventListener('storage',this.storageChanged);}
 }
}
