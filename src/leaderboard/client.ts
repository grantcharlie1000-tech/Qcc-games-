import * as store from '../core/storage';
import {STORAGE_FULL_MESSAGE} from '../core/storage-full';
import {validUsername} from '../accounts/shared';
import {scoredGame,validScore,readBoard,LEADERBOARD_NOT_OPEN,type Board} from './shared';
interface Storage {read<T>(key:string,fallback:T):T;write(key:string,value:unknown):boolean}
interface Profile {token:string;name:string}
export const SCORE_BATCH_MS=5000;
/** A game whose board the database does not accept yet is parked this long before one quiet retry (see LEADERBOARD_NOT_OPEN). */
export const NOT_OPEN_RETRY_MS=900000;
interface Retry {attempt:number;nextAt:number}
export class LeaderboardSync {
 needsLogin=false;message='';
 private identity='';private scope='';private flightToken:string|undefined;
 private disposed=false;private retry:Retry={attempt:0,nextAt:0};
 private listeners=new Set<(game:string)=>void>();
 onSynced(listener:(game:string)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
 private statusListeners=new Set<(message:string)=>void>();
 onStatus(listener:(message:string)=>void){this.statusListeners.add(listener);return ()=>{this.statusListeners.delete(listener);};}
 private setMessage(message:string){if(this.message===message)return;this.message=message;for(const listener of this.statusListeners)listener(message);}
 private pending:Record<string,number>={};private sent:Record<string,number>={};
 /** Games parked after a not-open answer, with the time they may be tried again. Scores stay pending meanwhile. */
 private parked:Record<string,number>={};
 private timer:ReturnType<typeof setTimeout>|undefined;private inFlight:Promise<void>|null=null;
 readonly endpoint='/.netlify/functions/leaderboard';
 constructor(private storage:Storage=store,private fetcher:typeof fetch=globalThis.fetch.bind(globalThis)){
  this.refreshIdentity();
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.visibility);
 }
 private rawProfile():Profile|null{
  const session=this.storage.read<{token:string;username:string}|null>('accounts:session',null);
  if(session&&/^acct_[a-f0-9]{64}$/.test(session.token)&&validUsername(session.username))return {token:session.token,name:session.username};
  return null;
 }
 private refreshIdentity(){
  const profile=this.rawProfile(),identity=profile?.token??'';
  if(identity===this.identity)return;
  this.needsLogin=false;this.identity=identity;this.scope=identity.startsWith('acct_')?':account:'+profile!.name.toLowerCase():'';
  if(this.timer)clearTimeout(this.timer);this.timer=undefined;
  this.pending={};this.sent={};this.parked={};
  const retry=this.storage.read<Retry|null>('leaderboard:retry'+this.scope,null);
  this.retry=retry&&Number.isInteger(retry.attempt)&&retry.attempt>=0&&Number.isFinite(retry.nextAt)?retry:{attempt:0,nextAt:0};
  for(const [key,score] of Object.entries(this.storage.read('leaderboard:pending'+this.scope,{})??{}))if(scoredGame(key)&&validScore(score))this.pending[key]=score;
  for(const [key,score] of Object.entries(this.storage.read('leaderboard:sent'+this.scope,{})??{}))if(scoredGame(key)&&validScore(score))this.sent[key]=score;
  this.setMessage('');
  this.schedule();
 }
 profile():Profile|null{this.refreshIdentity();return this.rawProfile();}
 queue(game:string,score:number):void{
  if(!this.profile()||!scoredGame(game)||!validScore(score)||score<=Math.max(this.pending[game]??0,this.sent[game]??0))return;
  this.pending[game]=score;this.storage.write('leaderboard:pending'+this.scope,this.pending);
  this.schedule();
 }
 private visibility=()=>{if(!document.hidden)this.schedule();};
 private schedule(){
  if(this.disposed||this.timer||!Object.keys(this.pending).length||!this.rawProfile()||this.needsLogin)return;
  if(typeof document!=='undefined'&&document.hidden)return;
  // When every queued score is parked, wake when the first parking ends instead of every batch interval.
  const now=Date.now(),parked=Object.keys(this.pending).map(game=>this.parked[game]??0);
  const idle=parked.every(until=>until>now)?Math.max(SCORE_BATCH_MS,Math.min(...parked)-now):SCORE_BATCH_MS;
  const wait=this.retry.nextAt?Math.max(0,this.retry.nextAt-now):idle;
  this.timer=setTimeout(()=>{this.timer=undefined;if(typeof document==='undefined'||!document.hidden)void this.flush().catch(()=>{});},wait);
 }
 private defer(response?:Response){
  const attempt=this.retry.attempt+1;
  const backoff=Math.min(900000,30000*2**Math.min(attempt-1,5))*(.75+Math.random()*.5);
  const header=response?.headers.get('Retry-After');
  const after=header?(/^\d+(?:\.\d+)?$/.test(header)?Number(header)*1000:Date.parse(header)-Date.now()):0;
  this.retry={attempt,nextAt:Date.now()+Math.max(backoff,Number.isFinite(after)?after:0)};
  this.storage.write('leaderboard:retry'+this.scope,this.retry);
 }
 flush():Promise<void>{
  this.refreshIdentity();
  if(typeof document!=='undefined'&&document.hidden)return Promise.resolve();
  if(this.retry.nextAt>Date.now()){this.schedule();return Promise.resolve();}
  if(this.inFlight){const token=this.flightToken;return this.inFlight.then(()=>{if(this.profile()?.token!==token)return this.flush();});}
  if(this.timer){clearTimeout(this.timer);this.timer=undefined;}
  this.flightToken=this.profile()?.token;
  this.inFlight=this.send().finally(()=>{this.inFlight=null;this.schedule();});return this.inFlight;
 }
 private async send(){
  const profile=this.profile();if(!profile)return;
  for(const [game,score] of Object.entries(this.pending)){
   if((this.parked[game]??0)>Date.now())continue;
   let response:Response;
   try{response=await this.fetcher(this.endpoint,{method:'POST',headers:{Authorization:`Bearer ${profile.token}`,'Content-Type':'application/json'},body:JSON.stringify({game,score,name:profile.name}),signal:AbortSignal.timeout(8000)});}
   catch(error){if(this.profile()?.token===profile.token)this.defer();throw error;}
   if(this.profile()?.token!==profile.token)return;
   if(response.status===401){this.needsLogin=true;throw new Error('Log in again to share your scores. Your progress stays on this device.');}
   // This game's board is not open in the database yet: keep the score queued, park only this game and carry on
   // with the others, without the shared outage backoff or an error.
   if(response.status===409&&(await response.json().catch(()=>null))?.code===LEADERBOARD_NOT_OPEN){this.parked[game]=Date.now()+NOT_OPEN_RETRY_MS;continue;}
   delete this.parked[game];
   if(response.status===507){this.defer(response);this.setMessage(STORAGE_FULL_MESSAGE);throw new Error(STORAGE_FULL_MESSAGE);}
   if(!response.ok){this.defer(response);throw new Error('Scores are saved here and will sync when the leaderboard is available.');}
   this.retry={attempt:0,nextAt:0};this.storage.write('leaderboard:retry'+this.scope,this.retry);
   this.sent[game]=Math.max(score,this.sent[game]??0);this.storage.write('leaderboard:sent'+this.scope,this.sent);
   if(this.pending[game]===score&&this.profile()?.name===profile.name)delete this.pending[game];
   this.storage.write('leaderboard:pending'+this.scope,this.pending);
   for(const listener of this.listeners)listener(game);
  }
  this.setMessage('');
 }
 async load(game:string):Promise<Board>{
  if(!scoredGame(game))throw new Error('Choose a game with scores.');
  const profile=this.profile();
  const url=`${this.endpoint}?game=${encodeURIComponent(game)}`;
  const [publicResponse,personalResponse]=await Promise.all([
   this.fetcher(url,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)}),
   profile?this.fetcher(url+'&view=personal',{headers:{Authorization:`Bearer ${profile.token}`},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)}):Promise.resolve(null)
  ]);
  if(this.profile()?.token!==profile?.token)throw new Error('Player changed. Refresh scores.');
  if(personalResponse?.status===401){this.needsLogin=true;throw new Error('Log in again to share your scores. Your progress stays on this device.');}
  if(publicResponse.status===507||personalResponse?.status===507){this.setMessage(STORAGE_FULL_MESSAGE);throw new Error(STORAGE_FULL_MESSAGE);}
  if(!publicResponse.ok||(personalResponse&&!personalResponse.ok))throw new Error('Online leaderboard is temporarily unavailable.');
  const publicBoard=await publicResponse.json(),personal=personalResponse?await personalResponse.json():{player:null};
  const board=readBoard({entries:publicBoard?.entries,player:personal?.player});
  if(this.profile()?.token!==profile?.token)throw new Error('Player changed. Refresh scores.');
  if(!board)throw new Error('The leaderboard response could not be read.');
  this.storage.write('leaderboard:cache:'+game+this.scope,board);if(!Object.keys(this.pending).length)this.setMessage('');return board;
 }
 cached(game:string):Board|null{this.refreshIdentity();return readBoard(this.storage.read('leaderboard:cache:'+game+this.scope,null));}
 dispose(){this.disposed=true;if(this.timer)clearTimeout(this.timer);this.timer=undefined;if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.visibility);}
}
