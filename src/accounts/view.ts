import {AccountsClient} from './client';
import './style.css';
export class AccountsView {
 readonly root=document.createElement('dialog');
 private signup=false;private busy=false;
 constructor(readonly client:AccountsClient,private prepare:()=>void,private done:()=>void){
  this.root.id='accounts-dialog';this.root.setAttribute('aria-labelledby','accounts-title');
  this.root.innerHTML=`<h2 id="accounts-title">Play your way</h2><p>Use an optional account to carry game saves and scores across devices, or play locally as a guest.</p>
   <button type="button" class="game-button account-guest">Play as guest</button>
   <div class="account-tabs"><button type="button" class="game-button secondary account-login">Log in</button><button type="button" class="game-button secondary account-signup">Sign up</button></div>
   <form><label for="account-username">Username</label><input id="account-username" name="username" autocomplete="username" minlength="3" maxlength="24" pattern="[A-Za-z0-9_.\\-]{3,24}" required spellcheck="false" autocapitalize="none"><p class="muted">3–24 letters, digits, underscores, hyphens or dots. Your username is public on leaderboards.</p>
   <label for="account-password">Password</label><input id="account-password" name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required>
   <div class="account-confirm" hidden><label for="account-confirm">Confirm password</label><input id="account-confirm" name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" disabled required></div>
   <p class="account-warning" hidden>Forgotten passwords cannot be recovered. No email or other personal information is collected. Keep your password somewhere safe.</p>
   <p class="account-status muted" role="status" aria-live="polite"></p><button type="submit" class="game-button account-submit">Log in</button></form>
   <p class="muted account-local">Guest progress stays on this browser. Logging into an existing account keeps guest progress separate. Logging out removes account saves here and restores this browser’s guest progress.</p>`;
  document.body.append(this.root);
  this.root.querySelector('.account-login')!.addEventListener('click',()=>this.mode(false));
  this.root.querySelector('.account-signup')!.addEventListener('click',()=>this.mode(true));
  this.root.querySelector('form')!.addEventListener('submit',event=>{event.preventDefault();void this.submit();});
  this.root.querySelector('.account-guest')!.addEventListener('click',()=>this.guest());
  this.root.addEventListener('close',()=>this.clearPasswords());
  this.root.addEventListener('cancel',event=>{event.preventDefault();if(!this.busy)this.guest();});
 }
 private mode(signup:boolean){
  this.root.querySelector<HTMLElement>('.account-confirm')!.hidden=!signup;this.root.querySelector<HTMLInputElement>('#account-confirm')!.disabled=!signup;
  this.signup=signup;this.root.querySelector<HTMLElement>('.account-warning')!.hidden=!signup;
  this.root.querySelector('.account-submit')!.textContent=signup?'Create account':'Log in';
  this.root.querySelector<HTMLInputElement>('#account-password')!.autocomplete=signup?'new-password':'current-password';
  this.root.querySelector('.account-login')!.setAttribute('aria-pressed',String(!signup));
  this.root.querySelector('.account-signup')!.setAttribute('aria-pressed',String(signup));
  this.status('');
 }
 private status(message:string){this.root.querySelector('.account-status')!.textContent=message;}
 private clearPasswords(){for(const input of this.root.querySelectorAll<HTMLInputElement>('input[type=password]'))input.value='';}
 private guest(){this.clearPasswords();this.client.guest();this.root.close();this.done();}
 open(){if(this.root.open)return;this.mode(false);this.root.querySelector<HTMLFormElement>('form')!.reset();this.root.showModal();}
 private async submit(){
  if(this.busy)return;
  if(this.signup&&this.root.querySelector<HTMLInputElement>('#account-password')!.value!==this.root.querySelector<HTMLInputElement>('#account-confirm')!.value){this.status('Passwords do not match.');return;}
  this.busy=true;this.status('Connecting…');
  for(const button of this.root.querySelectorAll<HTMLButtonElement>('button'))button.disabled=true;
  try{
   this.prepare();
   await this.client.authenticate(this.signup?'signup':'login',this.root.querySelector<HTMLInputElement>('#account-username')!.value,this.root.querySelector<HTMLInputElement>('#account-password')!.value);
   this.clearPasswords();this.root.close();this.done();
  }catch(error){this.status(error instanceof Error?error.message:'Could not connect. Your local progress is safe.');}
  finally{this.busy=false;for(const button of this.root.querySelectorAll<HTMLButtonElement>('button'))button.disabled=false;}
 }
}
