/** Host-owned protocol. This module alone may attach the existing QCC bearer. */
const BASE='/api/integrations/nceastudy/link/';
const UNAVAILABLE='Account linking could not be checked. Try again.';
const CHANGED='Account changed. Start again.';
export interface StudyPairReview {qccUsername:string;whetuLabel:string;challenge:string}
export interface StudyPairing {
 status():Promise<boolean>;
 start():Promise<void>;
 review():Promise<StudyPairReview>;
 confirm(challenge:string):Promise<void>;
 cancel():Promise<void>;
}
export class StudyPairingError extends Error {constructor(message:string,readonly status=0){super(message);}}
export class StudyPairingClient implements StudyPairing {
 private pending:Promise<unknown>=Promise.resolve();
 private epoch=0;
 /** Undefined means no server-acknowledged browser selection, not a guest. */
 private selectedToken:string|null|undefined;
 private intent:string|null=null;
 private cancelRequired=false;
 constructor(private token:()=>string|undefined|null,private fetcher:typeof fetch=fetch){}
 private serial<T>(action:()=>Promise<T>):Promise<T>{
  const result=this.pending.then(action,action);this.pending=result.then(()=>{},()=>{});return result;
 }
 private async raw(action:string,body:unknown,token?:string|null):Promise<Record<string,unknown>>{
  try{
   const response=await this.fetcher(BASE+action,{
    method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify(body),credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10_000),...(action==='cancel'?{keepalive:true}:{}),
   });
   if(!response.ok)throw new StudyPairingError(UNAVAILABLE,response.status);
   const text=await response.text();if(text.length>8192)throw new StudyPairingError(UNAVAILABLE);
   const value:unknown=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new StudyPairingError(UNAVAILABLE);
   return value as Record<string,unknown>;
  }catch(error){if(error instanceof StudyPairingError)throw error;throw new StudyPairingError(UNAVAILABLE);}
 }
 private async cancelIntent(){
  const intent=this.intent;
  if(intent){
   // Correlation only, never an authorizing proof. Backend also requires the browser cookie.
   const result=await this.raw('cancel',{intent});
   if(result.cancelled!==true)throw new StudyPairingError(UNAVAILABLE);
   if(this.intent===intent)this.intent=null;
  }
  this.cancelRequired=false;
 }
 private call<T>(action:string,body:unknown,parse:(value:Record<string,unknown>)=>T):Promise<T>{
  const epoch=this.epoch,token=this.token()??null;
  const unchanged=()=>epoch===this.epoch&&token===(this.token()??null)&&this.selectedToken===token;
  return this.serial(async()=>{
   if(!unchanged())throw new StudyPairingError(CHANGED,409);
   if(this.cancelRequired||action==='start'&&this.intent)await this.cancelIntent();
   if(!unchanged())throw new StudyPairingError(CHANGED,409);
   if(!token)throw new StudyPairingError('Log in to NCEAStudy before linking.',401);
   let result:Record<string,unknown>;
   try{result=await this.raw(action,body,token);}catch(error){
    if(!unchanged())throw new StudyPairingError(CHANGED,409);
    throw error;
   }
   if(!unchanged())throw new StudyPairingError(CHANGED,409);
   return parse(result);
  });
 }
 async status():Promise<boolean>{
  try{return await this.call('status',{},value=>{if(value.linked!==true||value.verified!==true)throw new StudyPairingError(UNAVAILABLE);return true;});}
  catch(error){if(error instanceof StudyPairingError&&[401,409].includes(error.status)&&error.message!==CHANGED)return false;throw error;}
 }
 async start():Promise<void>{await this.call('start',{consent:true},value=>{
  if(value.started!==true||value.expiresIn!==300||typeof value.intent!=='string'||!/^[a-f0-9]{64}$/.test(value.intent))throw new StudyPairingError(UNAVAILABLE);
  this.intent=value.intent;
 });}
 review():Promise<StudyPairReview>{return this.call('review',{},value=>{
  if(typeof value.qccUsername!=='string'||!/^[A-Za-z0-9_.-]{3,24}$/.test(value.qccUsername)||typeof value.whetuLabel!=='string'||!value.whetuLabel.length||value.whetuLabel.length>80||/[\u0000-\u001f\u007f]/.test(value.whetuLabel)||typeof value.challenge!=='string'||!/^[a-f0-9]{64}$/.test(value.challenge))throw new StudyPairingError(UNAVAILABLE);
  return {qccUsername:value.qccUsername,whetuLabel:value.whetuLabel,challenge:value.challenge};
 });}
 async confirm(challenge:string):Promise<void>{
  if(!/^[a-f0-9]{64}$/.test(challenge))throw new StudyPairingError(UNAVAILABLE);
  await this.call('confirm',{consent:true,challenge},value=>{if(value.linked!==true)throw new StudyPairingError(UNAVAILABLE);});
 }
 /** Scoped cleanup cannot revoke another tab's context or clear its cookies. */
 cancel():Promise<void>{this.cancelRequired=true;return this.serial(()=>this.cancelIntent());}
 /** Called before local identity commits and at startup, never from the iframe. */
 select(nextToken?:string|null):Promise<void>{
  const selected=nextToken??null;
  if(selected!==null&&!/^acct_[a-f0-9]{64}$/.test(selected))return Promise.reject(new StudyPairingError(UNAVAILABLE,401));
  const epoch=++this.epoch;this.selectedToken=undefined;
  return this.serial(async()=>{
   const result=await this.raw('select',{},selected);
   if(epoch!==this.epoch)throw new StudyPairingError(CHANGED,409);
   if(result.selected!==true)throw new StudyPairingError(UNAVAILABLE);
   this.selectedToken=selected;this.intent=null;this.cancelRequired=false;
  });
 }
}
