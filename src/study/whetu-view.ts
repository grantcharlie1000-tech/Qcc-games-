import type {AppView} from '../apps/types';
import {probeIntegration,WHETU_ENTRY,WHETU_INTEGRATION,WHETU_UNAVAILABLE} from './whetu-integration';
import {StudyPairingError,type StudyPairing,type StudyPairReview} from './whetu-pairing';
import './whetu.css';

interface WhetuStudyDeps {
 /** Bearer handling stays in the host client; this view sees verified display labels only. */
 signedIn:()=>boolean;
 openAccounts:()=>void;
 pairing:StudyPairing;
}
interface Control {label:string;action:()=>void}

/** First-party host. Compatibility, live linkage and document checks are distinct gates. */
export class WhetuStudyView implements AppView {
 readonly root=document.createElement('section');
 private state:HTMLElement;
 private slot:HTMLElement;
 private connectionControl:HTMLButtonElement;
 private frame:HTMLIFrameElement|undefined;
 private abort:AbortController|undefined;
 private timeout:ReturnType<typeof setTimeout>|undefined;
 private epoch=0;
 private documentEpoch=0;
 private disposed=false;
 private started=false;
 private pendingLink=false;
 private busy=false;
 constructor(private container:HTMLElement,private deps:WhetuStudyDeps){
  this.root.className='whetu-study';
  this.root.setAttribute('aria-labelledby','whetu-study-title');
  this.root.innerHTML='<header class="whetu-study-heading"><p class="whetu-study-eyebrow">Study</p><h1 id="whetu-study-title" tabindex="-1">Study with Whetū</h1></header><div class="whetu-study-state" aria-live="polite"></div><div class="whetu-study-frame" hidden></div><p class="whetu-study-account-note">Whetū needs its own account. You will be asked to verify and link it to your NCEAStudy account. Existing progress stays with its original account.</p><button type="button" class="game-button secondary whetu-study-connection" hidden>Check account connection</button>';
  this.state=this.root.querySelector<HTMLElement>('.whetu-study-state')!;
  this.slot=this.root.querySelector<HTMLElement>('.whetu-study-frame')!;
  this.connectionControl=this.root.querySelector<HTMLButtonElement>('.whetu-study-connection')!;
  this.connectionControl.addEventListener('click',()=>void this.open());
  this.container.replaceChildren(this.root);
 }
 navigate(_hash:string){
  if(this.started||this.disposed)return;
  this.started=true;void this.open();
  this.root.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});
 }
 private removeFrame(){
  clearTimeout(this.timeout);this.timeout=undefined;this.connectionControl.hidden=true;
  this.frame?.remove();this.frame=undefined;this.slot.replaceChildren();this.slot.hidden=true;
 }
 private invalidate(){
  ++this.epoch;this.abort?.abort();this.abort=undefined;this.removeFrame();this.busy=false;
 }
 private current(epoch:number){return !this.disposed&&epoch===this.epoch&&this.deps.signedIn();}
 private message(text:string,...controls:Control[]){
  const paragraph=document.createElement('p');paragraph.textContent=text;
  this.state.replaceChildren(paragraph);this.state.hidden=false;
  for(const {label,action} of controls){
   const button=document.createElement('button');button.type='button';button.className='game-button secondary';button.textContent=label;
   button.addEventListener('click',action);this.state.append(button);
  }
 }
 private async open(){
  if(this.busy||this.disposed)return;
  const clearPending=this.pendingLink;this.invalidate();this.busy=true;
  if(!this.deps.signedIn()){
   this.busy=false;this.message('Log in or create your NCEAStudy account before connecting Whetū.',{label:'Log in or create an NCEAStudy account',action:()=>this.deps.openAccounts()});return;
  }
  const epoch=this.epoch;
  this.message('Checking that secure Study and account linking are ready…');
  try{
   if(clearPending){await this.deps.pairing.cancel();if(!this.current(epoch))return;this.pendingLink=false;}
   if(!this.current(epoch))return;
   this.abort=new AbortController();
   this.timeout=setTimeout(()=>{if(epoch===this.epoch){this.invalidate();this.unavailable();}},10_000);
   await probeIntegration(fetch,this.abort.signal);
   if(!this.current(epoch)){if(!this.disposed&&epoch===this.epoch){this.busy=false;void this.open();}return;}
   clearTimeout(this.timeout);this.timeout=undefined;this.abort=undefined;
   this.message('Checking your secure Study session…');
   await this.deps.pairing.activate();
   if(!this.current(epoch))return;
   this.message('Checking your verified account link…');
   const linked=await this.deps.pairing.status();
   if(!this.current(epoch))return;
   this.busy=false;if(linked)this.openFrame();else this.offerSetup();
  }catch(error){
   if(this.disposed||epoch!==this.epoch)return;
   this.invalidate();
   if(error instanceof StudyPairingError&&[401,409].includes(error.status)){
    this.message('Sign in to NCEAStudy again to refresh your secure Study connection. Your account and progress are unchanged.',{label:'Sign in to NCEAStudy',action:()=>this.deps.openAccounts()},{label:'Back to games',action:()=>{location.hash='#/collection';}});
   }else this.unavailable();
  }
 }
 private offerSetup(){
  this.message('Create a Whetū account or log in to an existing one, then review and confirm its link to your NCEAStudy account. Neither account’s progress will be moved or deleted.',{label:'Continue to Whetū account setup',action:()=>void this.startLink()});
 }
 private async startLink(){
  if(this.busy||this.disposed)return;
  this.busy=true;this.pendingLink=true;const epoch=this.epoch;
  this.message('Starting secure account setup…');
  try{
   await this.deps.pairing.start();if(!this.current(epoch))return;
   this.busy=false;this.openFrame();
  }catch(error){
   if(!this.current(epoch))return;
   this.busy=false;
   if(error instanceof StudyPairingError&&error.status===401){
    this.message('Log in to NCEAStudy again before linking your Whetū account.',{label:'Log in to NCEAStudy',action:()=>this.deps.openAccounts()},{label:'Try again',action:()=>void this.open()});
   }else this.message('Account setup could not start. Your accounts have not been linked by this step.',{label:'Try again',action:()=>void this.open()});
  }
 }
 private setupControls(text='Create your Whetū account or log in below. When you’re signed in, review the two accounts before linking them.'){
  this.message(text,{label:'Review account link',action:()=>void this.reviewLink()},{label:'Cancel linking',action:()=>void this.cancelLink()});
 }
 private async reviewLink(){
  if(this.busy||!this.pendingLink||this.disposed)return;
  this.busy=true;const epoch=this.epoch,documentEpoch=this.documentEpoch;
  this.message('Checking the signed-in accounts…');
  try{
   const review=await this.deps.pairing.review();if(!this.current(epoch))return;
   this.busy=false;
   if(documentEpoch!==this.documentEpoch){this.setupControls('The Whetū account screen changed. Review the accounts again before linking.');return;}
   this.confirmation(review,documentEpoch);
  }catch{
   if(!this.current(epoch))return;this.busy=false;
   this.setupControls('The accounts could not be verified. Finish signing in to Whetū below, then try again. If your sign-in or linking session expired, cancel and start again.');
  }
 }
 private confirmation(review:StudyPairReview,documentEpoch:number){
  // Verified display labels are text, never HTML. The one-time challenge stays in host memory.
  this.message(`Link NCEAStudy account “${review.qccUsername}” with Whetū account “${review.whetuLabel}”? Both accounts keep their existing progress.`,
   {label:'Confirm account link',action:()=>void this.confirmLink(review.challenge,documentEpoch)},
   {label:'Back to account setup',action:()=>this.setupControls()},
   {label:'Cancel linking',action:()=>void this.cancelLink()});
 }
 private async confirmLink(challenge:string,documentEpoch:number){
  if(this.busy||!this.pendingLink||this.disposed)return;
  if(documentEpoch!==this.documentEpoch){this.setupControls('The Whetū account screen changed. Review the accounts again before linking.');return;}
  this.busy=true;const epoch=this.epoch;this.message('Confirming your account link…');
  try{
   await this.deps.pairing.confirm(challenge);if(!this.current(epoch))return;
   // A successful POST alone never admits a workspace. Revalidate the live pair and context.
   await this.checkLink(epoch);
  }catch{
   if(!this.current(epoch))return;this.busy=false;
   this.message('The confirmation result could not be checked. Check its status before trying again.',{label:'Check link status',action:()=>void this.checkOutcome()},{label:'Cancel linking',action:()=>void this.cancelLink()});
  }
 }
 private async checkLink(epoch:number){
  const verified=await this.deps.pairing.status();if(!this.current(epoch))return;
  this.busy=false;
  if(verified){this.pendingLink=false;this.openFrame();}
  else this.setupControls('The link is not verified. Review both signed-in accounts again before continuing.');
 }
 private async checkOutcome(){
  if(this.busy||this.disposed)return;
  this.busy=true;const epoch=this.epoch;this.message('Checking the account link…');
  try{await this.checkLink(epoch);}catch{
   if(!this.current(epoch))return;this.busy=false;
   this.message('The link could not be checked. No confirmation will be submitted again automatically.',{label:'Check link status',action:()=>void this.checkOutcome()},{label:'Cancel linking',action:()=>void this.cancelLink()});
  }
 }
 private async cancelLink(){
  if(this.busy||this.disposed)return;
  this.invalidate();const epoch=this.epoch;this.busy=true;this.message('Closing account linking…');
  try{await this.deps.pairing.cancel();if(!this.current(epoch))return;this.pendingLink=false;this.busy=false;this.offerSetup();}
  catch{
   if(!this.current(epoch))return;this.busy=false;
   this.message('Linking could not be closed securely. Try again before starting another account setup.',{label:'Try closing again',action:()=>void this.cancelLink()});
  }
 }
 private openFrame(){
  this.removeFrame();const epoch=this.epoch;
  this.message('Opening your Whetū account screen…');
  const frame=document.createElement('iframe');this.frame=frame;
  frame.title='Whetū Study and account setup';frame.referrerPolicy='no-referrer';
  // Same-origin scripts + same-origin sandboxing are NOT an isolation boundary.
  // Only the separately audited, trusted first-party runtime may enter here.
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox');
  frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-write 'none'");
  frame.addEventListener('load',()=>{
   if(!this.current(epoch)||frame!==this.frame)return;
   try{
    const marker=frame.contentDocument?.querySelector<HTMLMetaElement>('meta[name="whetu-integration"]');
    if(marker?.content!==WHETU_INTEGRATION)throw new Error('Unapproved runtime');
    clearTimeout(this.timeout);this.timeout=undefined;this.documentEpoch++;this.slot.hidden=false;
    if(this.pendingLink&&!this.busy)this.setupControls();else if(!this.pendingLink){this.state.hidden=true;this.connectionControl.hidden=false;}
   }catch{this.invalidate();this.frameUnavailable();}
  });
  frame.addEventListener('error',()=>{if(epoch===this.epoch&&frame===this.frame){this.invalidate();this.frameUnavailable();}});
  this.timeout=setTimeout(()=>{if(epoch===this.epoch&&frame===this.frame){this.invalidate();this.frameUnavailable();}},15_000);
  frame.src=WHETU_ENTRY;this.slot.append(frame);
 }
 private unavailable(){this.message(WHETU_UNAVAILABLE,{label:'Try again',action:()=>void this.open()});}
 private frameUnavailable(){this.message('Study could not open securely. Try again to check your account setup.',{label:'Try again',action:()=>void this.open()});}
 // Retained Esc article reader owns visibility/inert state. Do not reload signup underneath it.
 pause(){}
 resume(){}
 dispose(){
  this.disposed=true;this.invalidate();this.root.remove();
  // Cleanup is queued before a later view's protocol calls, even if start is still in flight.
  if(this.pendingLink){this.pendingLink=false;void this.deps.pairing.cancel().catch(()=>{});}
 }
}
