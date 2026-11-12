import {MovieStorage,MOVIES_KEY} from './storage';
import type {TitleSnapshot} from './storage';
import {mergeMovieProgress,parseMovieProgress,MAX_PROGRESS_ENTRIES} from './progress-shared';
import type {MovieProgressDocument} from './progress-shared';
const empty=():MovieProgressDocument=>({entries:{},cleared:0});
// Account caches and pending writes never share the guest namespace. Only this
// account's explicitly recorded progress goes to the authenticated endpoint.
export class AccountMovieStorage extends MovieStorage {
 private pending=empty();private cleared=0;private acknowledgedClear=0;private closed=false;
 private flight:Promise<void>|undefined;private timer:ReturnType<typeof setTimeout>|undefined;
 private abort=new AbortController();private retry=5000;private synced=false;
 private readonly queueKey:string;
 private journal=new Map<string,MovieProgressDocument>();
 private refresh=()=>{if(typeof document==='undefined'||!document.hidden)void this.account!.sync();};
 constructor(private session:{username:string;token:string},storage:()=>Storage=()=>localStorage,private fetcher:typeof fetch=globalThis.fetch.bind(globalThis)){
  super(storage,`${MOVIES_KEY}:account:${session.username.toLowerCase()}`,true);
  this.queueKey=this.key+':pending';this.readQueue();this.apply(mergeMovieProgress(this.document(),this.pending));
  this.account={username:session.username,status:'Continue watching is saved on this device. Connecting to your account…',sync:()=>this.sync(),flush:()=>this.flush(),dispose:()=>this.dispose(),hasDeviceHistory:()=>this.deviceEntries().some(item=>!(item.key in this.data.progress)),importDeviceHistory:()=>this.importDeviceHistory()};
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
 private persistQueue(document:MovieProgressDocument,watermark=false){try{
  const key=this.queueKey+(watermark?':cleared:':':')+crypto.randomUUID();this.storage().setItem(key,JSON.stringify(document));this.journal.set(key,document);
  for(const [old,value] of this.journal)if(old!==key&&value.cleared<=document.cleared&&Object.entries(value.entries).every(([media,entry])=>entry.updated<=document.cleared||(document.entries[media]?.updated??-1)>=entry.updated)){
   this.storage().removeItem(old);this.journal.delete(old);
  }
 }catch{this.durable=false;}}
 private acknowledge(remote:MovieProgressDocument){
  if(remote.cleared>this.acknowledgedClear){this.persistQueue({entries:{},cleared:remote.cleared},true);this.acknowledgedClear=remote.cleared;}
  for(const [key,document] of this.journal){
   // Keep the newest clear marker durably even after its server acknowledgement.
   if(key.startsWith(this.queueKey+':cleared:')&&document.cleared>=remote.cleared)continue;
   const covered=document.cleared<=remote.cleared&&Object.entries(document.entries).every(([media,entry])=>entry.updated<=remote.cleared||(remote.entries[media]?.updated??-1)>=entry.updated);
   if(covered)try{this.storage().removeItem(key);this.journal.delete(key);}catch{/* Retry cleanup later. */}
  }
 }
 private schedule(delay=5000){clearTimeout(this.timer);if(!this.closed)this.timer=setTimeout(()=>{void this.sync();},delay);}
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
 private async importDeviceHistory(){
  if(this.closed)return;
  // Import is an explicit new account action, but only after a fresh pull so an
  // older guest position never replaces an existing account position unseen.
  await this.sync();if(this.closed)return;
  if(!this.synced){this.account!.status='Connect to add device history.';this.emit();return;}
  for(const item of this.deviceEntries())if(!(item.key in this.data.progress))this.progress(item.key,item.time,item.duration,item.snapshot);
  this.emit();this.schedule(0);
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
