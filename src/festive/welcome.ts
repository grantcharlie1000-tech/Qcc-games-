import {openSheet} from '../ui/sheet';
import {ChristmasWelcomeState} from './welcome-state';
import './welcome.css';
import snowPile from './snow-pile.svg?raw';

/** A one-time update note, using the same native sheet as the rest of QCC. */
export class ChristmasWelcome {
  readonly root=document.createElement('dialog');
  private state=new ChristmasWelcomeState();
  constructor(private done:()=>void){
    this.root.id='christmas-welcome';
    this.root.className='ui-glass-sheet arcade-sheet christmas-welcome';
    this.root.dataset.glassTone='light';
    this.root.setAttribute('aria-labelledby','christmas-welcome-title');
    this.root.setAttribute('aria-describedby','christmas-welcome-copy');
    this.root.innerHTML=`${snowPile}<div class="christmas-welcome-content"><h2 id="christmas-welcome-title">Merry Christmas! <span aria-hidden="true">🎄</span></h2>
      <p id="christmas-welcome-copy">Turn it off in Menu.</p>
      <form method="dialog"><button class="game-button" autofocus>Got it</button></form></div>`;
    document.body.append(this.root);
    this.root.addEventListener('close',()=>this.done());
  }
  shouldShow(username?:string):boolean{return this.state.shouldShow(username);}
  open(username:string):void{
    if(this.root.open||!this.shouldShow(username))return;
    openSheet(this.root);
    // Mark on presentation, so reloading or leaving mid-welcome does not nag.
    this.state.markSeen(username);
  }
}
