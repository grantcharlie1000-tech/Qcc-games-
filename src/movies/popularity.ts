// Independent of watch history, account sessions and game sync. No historical playback is read.
export const POPULARITY_SETTINGS_KEY='qcc:movies:popularity:settings:v1';
export const POPULARITY_DEDUP_KEY='qcc:movies:popularity:dedup:v1';
export const POPULARITY_ENDPOINT='/api/movie-popularity';
const DAY=86400000;
const movieId=(id:string)=>/^movie-[1-9]\d{0,9}$/.test(id);
type LocalStore=Pick<Storage,'getItem'|'setItem'|'removeItem'>;


/** Conservative evidence, not a proof of viewing: an advancing clock matched to elapsed time.
 * No credit for first reports, seeks, stalled playback, hidden tabs or long gaps. */
export class PlaybackEvidence {
 private previous?:{position:number;at:number};
 private seconds=0;
 sample(position:number,at:number,active:boolean):boolean{
  if(!active||!Number.isFinite(position)||position<0||!Number.isFinite(at)){this.previous=undefined;return false;}
  const previous=this.previous;this.previous={position,at};
  if(previous){
   const elapsed=(at-previous.at)/1000,advance=position-previous.position;
   if(elapsed>0&&elapsed<=10&&advance>0&&advance<=elapsed*2+.5)this.seconds+=Math.min(advance,elapsed);
  }
  return this.seconds>=60;
 }
}

export class MoviePopularity {
 available=false;
 private evidence=new PlaybackEvidence();
 private title='';
 private generation=0;
 private blocked=false;
 private attempted=new Set<string>();
 private pending?:AbortController;
 constructor(private storage:()=>LocalStore=()=>localStorage,private fetcher:typeof fetch=(...args)=>fetch(...args),private now=()=>Date.now(),private random=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('')){}
 get enabled():boolean{
  if(this.blocked)return false;
  try{const value=this.storage().getItem(POPULARITY_SETTINGS_KEY);return value===null||value==='true';}catch{return false;}
 }
 setEnabled(enabled:boolean):{enabled:boolean;saved:boolean}{
  this.reset();this.pending?.abort();this.pending=undefined;
  this.blocked=!enabled;
  try{
   this.storage().setItem(POPULARITY_SETTINGS_KEY,String(enabled));
   if(!enabled)this.storage().removeItem(POPULARITY_DEDUP_KEY);
   this.blocked=false;
  }catch{this.blocked=true;}
  return {enabled:this.enabled,saved:!this.blocked};
 }
 reset(){this.generation++;this.evidence=new PlaybackEvidence();this.title='';}
 stop(){this.reset();this.pending?.abort();this.pending=undefined;}
 sample(titleId:string,position:number,at:number,active:boolean){
  if(!this.available||!this.enabled||!movieId(titleId)){this.reset();return;}
  if(this.title!==titleId){this.reset();this.title=titleId;}
  if(this.evidence.sample(position,at,active))return this.submit(titleId);
 }
 private async submit(titleId:string){
  const generation=this.generation,day=Math.floor(this.now()/DAY),key=`${day}:${titleId}`;
  if(this.attempted.has(key)||!this.enabled)return;
  // One attempt per title/day per visit, with no queue, background retries or history replay.
  this.attempted.add(key);
  let token:string;
  try{
   const raw=JSON.parse(this.storage().getItem(POPULARITY_DEDUP_KEY)||'null') as {seed?:unknown;day?:unknown}|null;
   // Only one random seed is stored, never a list of titles or viewing events. It changes each UTC day.
   const seed=raw?.day===day&&typeof raw.seed==='string'&&/^[a-f0-9]{32}$/.test(raw.seed)?raw.seed:this.random();
   this.storage().setItem(POPULARITY_DEDUP_KEY,JSON.stringify({seed,day}));
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${day}:${seed}:${titleId}`));
   token=Array.from(new Uint8Array(digest).slice(0,16),v=>v.toString(16).padStart(2,'0')).join('');
  }catch{return;}
  if(generation!==this.generation||!this.enabled||day!==Math.floor(this.now()/DAY))return;
  const controller=new AbortController();this.pending=controller;
  const timer=setTimeout(()=>controller.abort(),8000);
  try{await this.fetcher(POPULARITY_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',body:JSON.stringify({titleId,token}),signal:controller.signal});}catch{/* Failed samples are dropped, never queued. */}
  finally{clearTimeout(timer);if(this.pending===controller)this.pending=undefined;}
 }
}
export const moviePopularity=new MoviePopularity();
/** Another tab, or a cleared storage event, must stop reporting immediately. A missing key is storage being cleared. */
export const popularityStorageChangeStopsReporting=(key:string|null)=>key===POPULARITY_SETTINGS_KEY||key===null;

export function parsePopularIds(value:unknown):string[]{
 if(!value||typeof value!=='object'||!('titleIds' in value)||!Array.isArray(value.titleIds))throw new Error('Invalid popularity response');
 return [...new Set(value.titleIds.filter((id:unknown):id is string=>typeof id==='string'&&movieId(id)))].slice(0,10);
}
