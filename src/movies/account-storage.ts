import {MovieStorage,MOVIES_KEY} from './storage';
import type {TitleSnapshot} from './storage';
import {mergeMovieProgress,parseMovieProgress,MAX_PROGRESS_ENTRIES} from './progress-shared';
import type {MovieProgressDocument} from './progress-shared';
const empty=():MovieProgressDocument=>({entries:{},cleared:0});
export const DEVICE_HISTORY_MIGRATION_KEY=MOVIES_KEY+':cloud-migration:v1';
export type DeviceHistoryLock=(work:()=>Promise<void>)=>Promise<void>;
interface DeviceHistoryClaim {version:1;owner:string;snapshot:MovieProgressDocument;done:boolean}
const browserMigrationLock=():DeviceHistoryLock|undefined=>typeof window!=='undefined'&&navigator.locks?async work=>{await navigator.locks.request('qcc:movies:cloud-migration:v1',work);}:undefined;
// Account caches and pending writes never share the guest namespace. Only this
// account's scoped progress goes to the authenticated endpoint.
export class AccountMovieStorage extends MovieStorage {
 private pending=empty();private cleared=0;private acknowledgedClear=0;private closed=false;
 private flight:Promise<void>|undefined;private timer:ReturnType<typeof setTimeout>|undefined;
 private abort=new AbortController();private retry=5000;private synced=false;private migrationDone=false;private migrationFlight:Promise<void>|undefined;private migrationNotice='';
 private readonly queueKey:string;
 private journal=new Map<string,MovieProgressDocument>();
 private refresh=()=>{if(typeof document==='undefined'||!document.hidden)void this.account!.sync();};
 constructor(private session:{username:string;token:string},storage:()=>Storage=()=>localStorage,private fetcher:typeof fetch=globalThis.fetch.bind(globalThis),private migrationLock:DeviceHistoryLock|undefined=browserMigrationLock()){
  super(storage,`${MOVIES_KEY}:account:${session.username.toLowerCase()}`,true);
  this.queueKey=this.key+':pending';this.readQueue();this.apply(mergeMovieProgress(this.document(),this.pending));
  this.account={username:session.username,status:'Continue watching is saved on this device. Connecting to your account…',sync:()=>this.syncWithMigration(),flush:()=>this.flush(),dispose:()=>this.dispose(),hasDeviceHistory:()=>this.hasDeviceHistory(),importDeviceHistory:()=>this.importDeviceHistory()};
  if(typeof window!=='undefined'){window.addEventListener('online',this.refresh);window.addEventListener('focus',this.refresh);window.addEventListener('storage',this.external);document.addEventListener('visibilitychange',this.refresh);}
 }
 private readQueue(){try{
  const store=this.storage();this.journal.clear();
  for(let n=0;n<store.length;n++){const key=store.key(n);if(!key?.startsWith(this.queueKey+':'))continue;
   const saved=parseMovieProgress(JSON.parse(store.getItem(key)||'null'));if(saved){this.journal.set(key,saved);this.cleared=Math.max(this.cleared,saved.cleared);if(key.startsWith(this.queueKey+':cleared:'))this.acknowledgedClear=Math.max(this.acknowledgedClear,saved.cleared);else this.pending=mergeMovieProgress(saved,this.pending);}
  }
  this.pending=mergeMovieProgress({entries:{},cleared:this.acknowledgedClear},this.pending);if(this.pending.cleared<=this.acknowledgedClear)this.pending.cleared=0;
 }catch{/* Keep this visit's unsaved queue. */}}
 // Immutable journal records avoid a shared read-modify-write race between tabs.
 // Cache races can be repaired from the journal even if one tab closes at once.
 private persistQueue(document:MovieProgressDocument,watermark=false):boolean{try{
  const key=this.queueKey+(watermark?':cleared:':':')+crypto.randomUUID();this.storage().setItem(key,JSON.stringify(document));this.journal.set(key,document);
  for(const [old,value] of this.journal)if(old!==key&&value.cleared<=document.cleared&&Object.entries(value.entries).every(([media,entry])=>entry.updated<=document.cleared||(document.entries[media]?.updated??-1)>=entry.updated)){
   this.storage().removeItem(old);this.journal.delete(old);
  }
  return true;
 }catch{this.durable=false;return false;}}
 private acknowledge(remote:MovieProgressDocument){
  if(remote.cleared>this.acknowledgedClear){this.persistQueue({entries:{},cleared:remote.cleared},true);this.acknowledgedClear=remote.cleared;}
  for(const [key,document] of this.journal){
   // Keep the newest clear marker durably even after its server acknowledgement.
   if(key.startsWith(this.queueKey+':cleared:')&&document.cleared>=remote.cleared)continue;
   const covered=document.cleared<=remote.cleared&&Object.entries(document.entries).every(([media,entry])=>entry.updated<=remote.cleared||(remote.entries[media]?.updated??-1)>=entry.updated);
   if(covered)try{this.storage().removeItem(key);this.journal.delete(key);}catch{/* Retry cleanup later. */}
  }
 }
 private schedule(delay=5000){clearTimeout(this.timer);if(!this.closed)this.timer=setTimeout(()=>{void this.syncWithMigration();},delay);}
 private external=(event:StorageEvent)=>{if(event.key===this.key||event.key?.startsWith(this.queueKey+':')||event.key===null){this.reload();this.readQueue();this.apply(mergeMovieProgress(this.document(),this.pending),false);this.schedule(100);}};
 override progress(key:string,time:number,duration?:number,snapshot?:TitleSnapshot){
  if(this.closed||!Number.isFinite(time)||time<0||!/^(?:movie-[a-z0-9-]+|tv-[a-z0-9-]+:s\d{1,4}:e\d{1,4})$/.test(key))return;
  this.reload();this.readQueue();const previous=this.data.meta[key]?.updated??0,saved=snapshot??this.snapshot(key.split(':')[0]);super.progress(key,time,duration,snapshot);
  const meta=this.data.meta[key];if(!saved||!meta)return;
  const updated=Math.max(Date.now(),this.cleared+1,previous+1,(this.pending.entries[key]?.updated??0)+1,meta.updated);
  const parsed=parseMovieProgress({entries:{[key]:{time:this.data.progress[key],...(meta.duration?{duration:meta.duration}:{}),updated,snapshot:saved}},cleared:0});if(!parsed)return;
  this.pending=mergeMovieProgress(parsed,this.pending);this.data.meta[key].updated=updated;this.write();this.persistQueue(parsed);this.schedule();
 }
 override clear(){
  if(this.closed)return;this.readQueue();
  this.cleared=Math.max(Date.now(),this.cleared+1,...Object.values(this.pending.entries).map(e=>e.updated+1),...Object.values(this.data.meta).map(e=>e.updated+1));
  this.pending={entries:{},cleared:this.cleared};super.clear();this.persistQueue(this.pending);this.emit();this.schedule(0);
 }
 private deviceEntries(){
  // Reading never rewrites or claims the device's older history.
  let guest:MovieStorage;try{const raw=this.storage().getItem(MOVIES_KEY);guest=new MovieStorage(()=>({getItem:()=>raw,setItem:()=>{}} as unknown as Storage));}catch{return [];}
  return guest.continueItems().flatMap(item=>{const snapshot=guest.snapshot(item.id);return snapshot?[{key:item.key,time:item.time,duration:item.duration,updated:item.updated,snapshot}]:[];}).slice(0,MAX_PROGRESS_ENTRIES);
 }
 private deviceDocument():MovieProgressDocument {
  const entries:MovieProgressDocument['entries']={};
  for(const item of this.deviceEntries()){
   const document=parseMovieProgress({entries:{[item.key]:{time:item.time,...(item.duration?{duration:item.duration}:{}),updated:Math.max(1,item.updated),snapshot:item.snapshot}},cleared:0});
   if(document)Object.assign(entries,document.entries);
  }return {entries,cleared:0};
 }
 private hasDeviceHistory(){
  return this.deviceEntries().some(item=>!(item.key in this.data.progress))||Object.entries(this.deviceDocument().entries).some(([key,entry])=>entry.updated>this.cleared&&entry.updated>(this.data.meta[key]?.updated??0));
 }
 private queueDeviceMerge(source:MovieProgressDocument):boolean {
  let durable=true,changed=false;
  for(const [key,entry] of Object.entries(source.entries))if(entry.updated>this.cleared&&entry.updated>=(this.data.meta[key]?.updated??0)){
   changed=true;const document={entries:{[key]:entry},cleared:0};this.pending=mergeMovieProgress(document,this.pending);if(!this.persistQueue(document))durable=false;
  }
  if(changed){this.account!.status='Device history merged. Syncing to your account.';this.apply(mergeMovieProgress(this.document(),this.pending));this.schedule(0);}return durable;
 }
 private async syncWithMigration(){
  await this.sync();if(this.closed||!this.synced)return;
  await this.migrateDeviceHistory();
  if(this.migrationNotice&&!this.closed){this.account!.status=this.migrationNotice;this.emit();}
 }
 private migrateDeviceHistory():Promise<void>{
  if(this.closed||this.migrationDone)return Promise.resolve();if(this.migrationFlight)return this.migrationFlight;
  if(!this.migrationLock){this.migrationDone=true;if(Object.keys(this.deviceDocument().entries).length)this.migrationNotice='Automatic device merge is unavailable. Use Add device history.';return Promise.resolve();}
  this.migrationFlight=this.migrationLock(async()=>{
   if(this.closed)return;
   try{
    const raw=this.storage().getItem(DEVICE_HISTORY_MIGRATION_KEY),owner=this.session.username.toLowerCase();let claim:DeviceHistoryClaim|undefined;
    if(raw!==null){
     const value=JSON.parse(raw),snapshot=parseMovieProgress(value?.snapshot);
     if(value?.version!==1||typeof value.owner!=='string'||!/^[a-z0-9_.-]{3,24}$/.test(value.owner)||typeof value.done!=='boolean'||!snapshot)throw new Error('Invalid migration claim.');
     claim={version:1,owner:value.owner,snapshot,done:value.done};
     if(claim.owner!==owner){this.migrationDone=true;this.migrationNotice='Device history is linked to another account. Automatic merge was skipped.';return;}
     if(claim.done){this.migrationDone=true;this.migrationNotice='';return;}
    }
    // Re-read cloud progress inside the origin-wide lock before claiming data.
    await this.sync();if(this.closed||!this.synced)return;
    if(!claim){claim={version:1,owner,snapshot:this.deviceDocument(),done:false};this.storage().setItem(DEVICE_HISTORY_MIGRATION_KEY,JSON.stringify(claim));}
    // A durable immutable snapshot makes retries safe even if later guests use
    // this device. Only its first claimed account may migrate it automatically.
    if(!this.queueDeviceMerge(claim.snapshot))return;
    claim.done=true;this.storage().setItem(DEVICE_HISTORY_MIGRATION_KEY,JSON.stringify(claim));this.migrationDone=true;this.migrationNotice='';
   }catch{if(!this.closed)this.migrationNotice='Device history remains here. Use Add device history.';}
  }).catch(()=>{if(!this.closed)this.migrationNotice='Automatic device merge is unavailable. Use Add device history.';}).finally(()=>{this.migrationFlight=undefined;});return this.migrationFlight;
 }
 private async importDeviceHistory(){
  if(this.closed)return;
  await this.sync();if(this.closed)return;
  if(!this.synced){this.account!.status='Connect to add device history.';this.emit();return;}
  // The explicit Add action may copy an unclaimed account's history or re-add
  // absent history after a clear. Automatic migration never uses fresh stamps.
  for(const item of this.deviceEntries())if(!(item.key in this.data.progress))this.progress(item.key,item.time,item.duration,item.snapshot);
  this.queueDeviceMerge(this.deviceDocument());this.migrationNotice='';this.emit();this.schedule(0);
 }
 private document():MovieProgressDocument {
  const entries:MovieProgressDocument['entries']={};for(const [key,time] of Object.entries(this.data.progress)){const snapshot=this.snapshot(key.split(':')[0]),meta=this.data.meta[key];if(snapshot&&meta)entries[key]={time,...meta,snapshot};}return {entries,cleared:this.cleared};
 }
 private apply(document:MovieProgressDocument,persist=true){
  this.cleared=Math.max(this.cleared,document.cleared);this.data.progress={};this.data.meta={};
  for(const [key,entry] of Object.entries(document.entries)){this.data.progress[key]=entry.time;this.data.meta[key]={updated:entry.updated,...(entry.duration?{duration:entry.duration}:{})};this.data.titles[entry.snapshot.id]=entry.snapshot;}
  if(persist)this.write();this.emit();
 }
 private batch(source=this.pending):MovieProgressDocument {
  const result:MovieProgressDocument={entries:{},cleared:source.cleared};
  for(const [key,entry] of Object.entries(source.entries)){
   result.entries[key]=entry;
   if(Object.keys(result.entries).length>50||new TextEncoder().encode(JSON.stringify(result)).length>60000){delete result.entries[key];break;}
  }return result;
 }
 private async flush(){
  const until=Date.now()+8000;
  do{await this.sync(Math.max(1,until-Date.now()));}while(!this.closed&&this.synced&&Date.now()<until&&(Object.keys(this.pending.entries).length>0||this.pending.cleared>0));
 }
 private sync(timeout=8000):Promise<void>{
  if(this.closed)return Promise.resolve();if(this.flight)return this.flight;
  clearTimeout(this.timer);this.timer=undefined;this.readQueue();this.synced=false;
  let submitted=this.batch();let full=false;
  const signal=AbortSignal.any([this.abort.signal,AbortSignal.timeout(timeout)]);
  const exchange=async(document?:MovieProgressDocument)=>{
   const body=document?JSON.stringify(document):undefined;
   const response=await this.fetcher('/.netlify/functions/accounts?action=movies',{method:document?'PUT':'GET',headers:{Authorization:'Bearer '+this.session.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body}:{}),cache:'no-store',keepalive:typeof globalThis.document!=='undefined'&&globalThis.document.hidden&&(!body||new TextEncoder().encode(body).length<60000),signal});
   return response;
  };
  this.flight=(async()=>{
   try{
    const writing=Object.keys(submitted.entries).length>0||submitted.cleared>0;
    let response=await exchange(writing?submitted:undefined);
    if(this.closed)return;
    if(response.status===413){
     // A full account must not let one new title poison updates to saved ones.
     const current=await exchange();if(!current.ok)throw new Error('unavailable');
     const existing=parseMovieProgress(await current.json());if(!existing)throw new Error('invalid');
     this.readQueue();submitted=this.batch({entries:Object.fromEntries(Object.entries(this.pending.entries).filter(([key])=>Object.hasOwn(existing.entries,key))),cleared:this.pending.cleared});
     response=Object.keys(submitted.entries).length||submitted.cleared?await exchange(submitted):Response.json(existing);full=true;
    }
    if(!response.ok)throw new Error('unavailable');
    const remote=parseMovieProgress(await response.json());if(!remote)throw new Error('invalid');if(this.closed)return;
    this.readQueue();
    // Acknowledge only exact submitted values, never newer writes made in flight.
    for(const [key,entry] of Object.entries(submitted.entries))if(JSON.stringify(this.pending.entries[key])===JSON.stringify(entry))delete this.pending.entries[key];
    if(this.pending.cleared===submitted.cleared)this.pending.cleared=0;
    this.cleared=Math.max(this.cleared,remote.cleared);this.acknowledge(remote);
    this.synced=!full;this.account!.status=full?'Account history is full. New titles stay on this device.':'Continue watching is synced to your account.';this.retry=5000;
    this.reload();this.apply(mergeMovieProgress(mergeMovieProgress(remote,this.document()),this.pending));
    this.schedule(full?60000:Object.keys(this.pending.entries).length||this.pending.cleared?5000:60000);
   }catch{
    if(this.closed)return;this.account!.status='Account sync unavailable. Continue watching stays on this device.';this.emit();this.schedule(this.retry);this.retry=Math.min(this.retry*2,120000);
   }
  })().finally(()=>{this.flight=undefined;});return this.flight;
 }
 private dispose(){this.closed=true;clearTimeout(this.timer);this.abort.abort();if(typeof window!=='undefined'){window.removeEventListener('online',this.refresh);window.removeEventListener('focus',this.refresh);window.removeEventListener('storage',this.external);document.removeEventListener('visibilitychange',this.refresh);}}
}
