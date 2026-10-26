import * as store from '../core/storage';
import {mergeSaves} from './merge';
import {SAVE_KEYS,MAX_BODY_BYTES,validSave,validSaves,validSessionToken,validUsername,validPassword,type Saves,type SaveRecord} from './shared';
export interface Session {token:string;username:string}
export interface AccountStorage {
 read<T>(key:string,fallback:T):T;write(key:string,value:unknown):boolean;
 remove?(key:string):boolean;invalidate?(key:string):void;keys?():string[];subscribe?(listener:(key:string)=>void):()=>void;
}
const endpoint='/.netlify/functions/accounts';
const sessionKey='accounts:session';
// JSONB may reorder object keys; that does not make an acknowledged save dirty.
const recordText=(value:unknown)=>JSON.stringify(value,(_key,next)=>next&&typeof next==='object'&&!Array.isArray(next)?Object.fromEntries(Object.keys(next).sort().map(key=>[key,next[key]])):next);
export class AccountsClient {
 message='';beforeIdentityChange=()=>{};
 private listeners=new Set<()=>void>();private muted=false;private epoch=0;private started=false;
 private firstChange=0;private lastPull=0;
 private timer:ReturnType<typeof setTimeout>|undefined;private interval:ReturnType<typeof setInterval>|undefined;
 private unsubscribe:(()=>void)|undefined;private inFlight:Promise<void>|null=null;private flightEpoch=-1;
 private knownToken:string|null;private acknowledged:Saves={};private loggingOut:Promise<void>|null=null;
 constructor(private storage:AccountStorage=store,private fetcher:typeof fetch=globalThis.fetch.bind(globalThis)){
  this.knownToken=this.session()?.token??null;
  this.unsubscribe=storage.subscribe?.(key=>{if(!this.muted&&SAVE_KEYS.includes(key)&&this.session())this.schedule();});
 }
 session():Session|null {
  const value=this.storage.read<Session|null>(sessionKey,null);
  return value&&validSessionToken(value.token)&&validUsername(value.username)?value:null;
 }
 onChange(listener:()=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
 private emit(){for(const listener of this.listeners)listener();}
 private remove(key:string){if(this.storage.remove)this.storage.remove(key);else this.storage.write(key,null);}
 private schedule(){this.firstChange||=Date.now();clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=undefined;this.firstChange=0;void this.flush().catch(()=>{});},Math.min(5000,Math.max(0,20000-(Date.now()-this.firstChange))));}
 guest(){this.storage.write('accounts:guest',true);this.emit();}
 private collect(includeOversize=false):Saves {
  const result:Saves={};let skipped=false;
  for(const key of SAVE_KEYS){
   const value=this.storage.read<unknown>(key,undefined);if(value===undefined||value===null)continue;
   const updated=key.startsWith('save:')?(value as {updated?:number})?.updated??0:this.storage.read('updated:'+key,0);
   // Old shell snapshots did not always have a timestamp; zero lets a dated server save win.
   const record={value:key.startsWith('save:')&&typeof value==='object'?{...value,updated}:value,updated};
   if(validSave(key,record,includeOversize?Infinity:undefined))result[key]=record;else skipped=true;
  }
  if(skipped)this.message='A save is too large or incompatible to sync. It stays on this browser; other progress still syncs.';
  return result;
 }
 private apply(saves:Saves){
  this.muted=true;
  try{for(const [key,record] of Object.entries(saves)){this.storage.write(key,record.value);if(!key.startsWith('save:'))this.storage.write('updated:'+key,record.updated);}}
  finally{this.muted=false;}
 }
 private clear(){
  this.muted=true;
  try{
   for(const key of SAVE_KEYS){this.remove(key);this.remove('updated:'+key);}
   for(const key of this.storage.keys?.()??[])if(key.startsWith('leaderboard:cache:')||key.includes(':account:'))this.remove(key);
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
  const response=await this.fetcher(`${endpoint}?action=${action}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(8000),keepalive});
  if(!response.ok){let text='Accounts are unavailable. Your progress stays on this browser.';try{const data=await response.json();if(typeof data.error==='string')text=data.error;}catch{}throw new Error(text);}
  return response;
 }
 async authenticate(action:'signup'|'login',username:string,password:string):Promise<void>{
  if(!validUsername(username)||!validPassword(password))throw new Error('Use a username of 3–24 letters, digits, underscores, hyphens or dots, and a password of 8–128 characters.');
  const epoch=this.epoch,guest=this.storage.read<{token?:string}|null>('leaderboard:profile',null);
  const response=await this.response(action,'POST',{username,password,...(action==='signup'&&/^[a-f0-9]{64}$/.test(guest?.token??'')?{guestToken:guest!.token}:{})});
  const session=await response.json();if(!validSessionToken(session.token)||!validUsername(session.username))throw new Error('The account response could not be read.');
  let remote:Saves={};
  if(action==='login')try{const response=await this.response('sync','GET',undefined,session.token);const result=await response.json();if(!validSaves(result.saves))throw new Error('The saved progress could not be read.');remote=result.saves;}catch(error){void this.revoke(session.token).catch(()=>{});throw error;}
  if(epoch!==this.epoch){void this.response('logout','POST',{},session.token,true).catch(()=>{});throw new Error('Account changed. Please try again.');}
  if(this.session())await this.logout();
  this.beforeIdentityChange();this.epoch++;this.backup();const imported=action==='signup'?this.collect(true):{};
  const staged=this.storage.read<Saves>('accounts:pending:'+session.username.toLowerCase(),{});
  this.clear();this.acknowledged=remote;this.apply(mergeSaves(remote,mergeSaves(imported,this.staged(staged))));this.storage.write(sessionKey,{token:session.token,username:session.username});this.knownToken=session.token;this.storage.write('accounts:guest',true);this.message='';this.emit();
  try{await this.flush();}catch{this.message='Signed in. Playing locally until your saves can sync.';this.emit();}
 }
 private staged(value:unknown):Saves {
  const result:Saves={};if(!value||typeof value!=='object'||Array.isArray(value))return result;
  for(const [key,record] of Object.entries(value))if(validSave(key,record,Infinity))result[key]=record;
  return result;
 }
 private stage(username:string){
  const unsent:Saves={};for(const [key,record] of Object.entries(this.collect(true)))if(recordText(record)!==recordText(this.acknowledged[key]))unsent[key]=record;
  const key='accounts:pending:'+username.toLowerCase();if(Object.keys(unsent).length)this.storage.write(key,unsent);else this.remove(key);
 }
 private async revoke(token:string){
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');
  const queue=this.storage.read<string[]>('accounts:revocations',[]);this.storage.write('accounts:revocations',[...new Set([...queue,hash])]);
  await this.revocations();
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
  try{await this.flush();}catch{/* Local progress remains until account keys are deliberately cleared below. */}
  if(epoch!==this.epoch||this.session()?.token!==session.token)return;
  this.beforeIdentityChange();this.stage(session.username);this.epoch++;clearTimeout(this.timer);this.clear();this.remove(sessionKey);this.knownToken=null;this.restoreGuest();this.guest();this.message='';this.emit();
  try{await this.revoke(session.token);}catch{this.message='Logged out on this browser. Server sign-out will retry when online.';this.emit();}
 }
 flush(keepalive=false):Promise<void>{
  if(this.inFlight&&!keepalive&&this.flightEpoch===this.epoch)return this.inFlight;
  const pending=this.sync(keepalive);if(keepalive)return pending;
  const flight=pending.finally(()=>{if(this.inFlight===flight)this.inFlight=null;});this.inFlight=flight;this.flightEpoch=this.epoch;return flight;
 }
 private async sync(keepalive:boolean){
  clearTimeout(this.timer);this.firstChange=0;
  const session=this.session(),epoch=this.epoch;
  if(!session){await this.revocations();return;}
  const current=()=>epoch===this.epoch&&this.session()?.token===session.token;
  try{
   const saves=Object.fromEntries(Object.entries(this.collect()).filter(([key,record])=>recordText(record)!==recordText(this.acknowledged[key])));
   // Small pagehide batches respect browsers' shared 64 KiB keepalive quota.
   const limit=keepalive?60000:MAX_BODY_BYTES-2048;const batches:Saves[]=[];let batch:Saves={};
   for(const [key,record] of Object.entries(saves)){
    if(new TextEncoder().encode(JSON.stringify({saves:{[key]:record}})).length>limit)continue;
    const next={...batch,[key]:record};if(new TextEncoder().encode(JSON.stringify({saves:next})).length>limit){batches.push(batch);batch={};}batch[key]=record;
   }
   if(Object.keys(batch).length)batches.push(batch);
   if(!batches.length&&!keepalive){const response=await this.response('sync','GET',undefined,session.token);const result=await response.json();if(!validSaves(result.saves))throw new Error('The saved progress could not be read.');if(current()){this.lastPull=Date.now();this.acknowledged=result.saves;this.apply(mergeSaves(result.saves,this.collect()));}}
   for(const saves of batches){
    const response=await this.response('sync','PUT',{saves},session.token,keepalive);
    const result=await response.json();if(!validSaves(result.saves))throw new Error('The saved progress could not be read.');
    if(!current())return;this.lastPull=Date.now();this.acknowledged=result.saves;this.apply(mergeSaves(result.saves,this.collect()));
   }
   if(current()){if(!keepalive)this.stage(session.username);if(!this.message.includes('too large'))this.message='Progress synced.';this.emit();}
  }catch(error){if(current()){this.stage(session.username);this.message=error instanceof Error?error.message:'Progress is waiting to sync.';this.emit();}throw error;}
 }
 private online=()=>{void this.revocations().catch(()=>{});void this.flush().catch(()=>{});};
 private pagehide=()=>{queueMicrotask(()=>void this.flush(true).catch(()=>{}));};
 private storageChanged=(event:StorageEvent)=>{
  if(event.key?.startsWith('pocket-arcade:v1:')){const key=event.key.slice('pocket-arcade:v1:'.length);if(SAVE_KEYS.includes(key)){this.storage.invalidate?.(key);if(this.session())this.schedule();return;}}
  if(event.key!==`pocket-arcade:v1:${sessionKey}`&&event.key!==null)return;
  for(const key of [sessionKey,...SAVE_KEYS,...SAVE_KEYS.map(k=>'updated:'+k),'corn-clicker:backups','corn-clicker:lock',...(this.storage.keys?.()??[]).filter(k=>k.startsWith('leaderboard:cache:')||k.includes(':account:'))])this.storage.invalidate?.(key);
  const token=this.session()?.token??null;if(token===this.knownToken)return;
  this.beforeIdentityChange();this.acknowledged={};this.knownToken=token;this.epoch++;clearTimeout(this.timer);this.emit();
 };
 private visibility=()=>{if(document.hidden)this.pagehide();};
 private tick=()=>{if(typeof document!=='undefined'&&document.hidden)return;if(Date.now()-this.lastPull>=60000)void this.flush().catch(()=>{});};
 start(listenPagehide=true){
  if(this.started)return;this.started=true;
  if(typeof window!=='undefined'){window.addEventListener('online',this.online);if(listenPagehide)window.addEventListener('pagehide',this.pagehide);window.addEventListener('storage',this.storageChanged);}
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.visibility);
  this.interval=setInterval(this.tick,60000);this.online();
 }
 dispose(){if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.visibility);clearTimeout(this.timer);clearInterval(this.interval);this.unsubscribe?.();this.epoch++;
  if(typeof window!=='undefined'){window.removeEventListener('online',this.online);window.removeEventListener('pagehide',this.pagehide);window.removeEventListener('storage',this.storageChanged);}
 }
}
