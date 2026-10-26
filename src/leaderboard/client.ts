import * as store from '../core/storage';
import {validUsername} from '../accounts/shared';
import {scoredGame,validName,validScore,readBoard,type Board} from './shared';
interface Storage {read<T>(key:string,fallback:T):T;write(key:string,value:unknown):boolean}
interface Profile {token:string;name:string}
export class LeaderboardSync {
 private identity='';private scope='';private flightToken:string|undefined;
 private listeners=new Set<(game:string)=>void>();
 onSynced(listener:(game:string)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
 private pending:Record<string,number>={};private sent:Record<string,number>={};
 private timer:ReturnType<typeof setTimeout>|undefined;private inFlight:Promise<void>|null=null;
 readonly endpoint='/.netlify/functions/leaderboard';
 constructor(private storage:Storage=store,private fetcher:typeof fetch=globalThis.fetch.bind(globalThis)){
  this.refreshIdentity();
 }
 private rawProfile():Profile|null{
  const session=this.storage.read<{token:string;username:string}|null>('accounts:session',null);
  if(session&&/^acct_[a-f0-9]{64}$/.test(session.token)&&validUsername(session.username))return {token:session.token,name:session.username};
  const value=this.storage.read<Profile|null>('leaderboard:profile',null);
  return value&&typeof value.token==='string'&&/^[a-f0-9]{64}$/.test(value.token)&&validName(value.name)?value:null;
 }
 private refreshIdentity(){
  const profile=this.rawProfile(),identity=profile?.token??'';
  if(identity===this.identity)return;
  this.identity=identity;this.scope=identity.startsWith('acct_')?':account:'+profile!.name.toLowerCase():'';
  this.pending={};this.sent={};
  for(const [key,score] of Object.entries(this.storage.read('leaderboard:pending'+this.scope,{})??{}))if(scoredGame(key)&&validScore(score))this.pending[key]=score;
  for(const [key,score] of Object.entries(this.storage.read('leaderboard:sent'+this.scope,{})??{}))if(scoredGame(key)&&validScore(score))this.sent[key]=score;
 }
 profile():Profile|null{this.refreshIdentity();return this.rawProfile();}
 join(name:string):void{
  if(this.profile()?.token.startsWith('acct_'))return;
  name=name.trim();if(!validName(name))throw new Error('Choose a name of 2–24 characters without control characters or angle brackets.');
  const old=this.profile();
  const token=old?.token??Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  this.storage.write('leaderboard:profile',{token,name});
  this.refreshIdentity();
  if(old?.name!==name){this.sent={};this.storage.write('leaderboard:sent'+this.scope,this.sent);}
 }
 queue(game:string,score:number):void{
  if(!this.profile()||!scoredGame(game)||!validScore(score)||score<=Math.max(this.pending[game]??0,this.sent[game]??0))return;
  this.pending[game]=score;this.storage.write('leaderboard:pending'+this.scope,this.pending);
  if(!this.timer)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush().catch(()=>{});},10000);
 }
 flush():Promise<void>{
  this.refreshIdentity();
  if(this.inFlight){const token=this.flightToken;return this.inFlight.then(()=>{if(this.profile()?.token!==token)return this.flush();});}
  if(this.timer){clearTimeout(this.timer);this.timer=undefined;}
  this.flightToken=this.profile()?.token;
  this.inFlight=this.send().finally(()=>{this.inFlight=null;});return this.inFlight;
 }
 private async send(){
  const profile=this.profile();if(!profile)return;
  for(const [game,score] of Object.entries(this.pending)){
   const response=await this.fetcher(this.endpoint,{method:'POST',headers:{Authorization:`Bearer ${profile.token}`,'Content-Type':'application/json'},body:JSON.stringify({game,score,name:profile.name}),signal:AbortSignal.timeout(8000)});
   if(this.profile()?.token!==profile.token)return;
   if(!response.ok)throw new Error('Scores are saved here and will sync when the leaderboard is available.');
   this.sent[game]=Math.max(score,this.sent[game]??0);this.storage.write('leaderboard:sent'+this.scope,this.sent);
   if(this.pending[game]===score&&this.profile()?.name===profile.name)delete this.pending[game];
   this.storage.write('leaderboard:pending'+this.scope,this.pending);
   for(const listener of this.listeners)listener(game);
  }
 }
 async load(game:string):Promise<Board>{
  if(!scoredGame(game))throw new Error('Choose a game with scores.');
  const profile=this.profile();
  const response=await this.fetcher(`${this.endpoint}?game=${encodeURIComponent(game)}`,{headers:profile?{Authorization:`Bearer ${profile.token}`}:{},cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Online leaderboard is temporarily unavailable.');
  const board=readBoard(await response.json());
  if(this.profile()?.token!==profile?.token)throw new Error('Player changed. Refresh scores.');
  if(!board)throw new Error('The leaderboard response could not be read.');
  this.storage.write('leaderboard:cache:'+game+this.scope,board);return board;
 }
 cached(game:string):Board|null{this.refreshIdentity();return readBoard(this.storage.read('leaderboard:cache:'+game+this.scope,null));}
 dispose(){if(this.timer)clearTimeout(this.timer);this.timer=undefined;}
}
