// The shared Create Room / Join by Code / Copy Invite Link / Leave Room panel. A game places `root` where it fits and
// receives the open Room through onOpen; the game owns everything that happens inside the room.
import './style.css';
import * as store from '../core/storage';
import {cleanName,normalizeCode} from './protocol';
import {Room,RoomError,type RoomEvent} from './room';
import type {LinkKind} from './transport';

export interface PanelOptions{
  game:string;
  /** Shown in the heading, e.g. "Pool". */
  title:string;
  version:string;
  maxPlayers:number;
  /** A room was created or joined. */
  onOpen(room:Room):void;
  /** The room ended (left, host gone, connection lost). */
  onClosed?(message:string):void;
  /** Code from an invite link, filled in for the player to confirm. */
  inviteCode?:string|null;
  /** Testing aid: force TURN relaying. */
  relayOnly?:boolean;
  createRoom?:typeof Room.create;
  joinRoom?:typeof Room.join;
}

const LINK_TEXT:Record<LinkKind,string>={
  direct:'Direct peer-to-peer connection.',
  relay:'Connected through the TURN relay (direct connection was not possible).',
  unknown:'Checking the connection path…'
};

/** The code from `#/game/<id>?room=CODE`, when present and well formed. */
export function inviteCodeFromHash(hash:string):string|null{
  const query=hash.split('?')[1];if(!query)return null;
  const code=new URLSearchParams(query).get('room');
  return code?normalizeCode(code):null;
}
export function relayOnlyFromHash(hash:string):boolean{
  const query=hash.split('?')[1];return !!query&&new URLSearchParams(query).get('relay')==='1';
}
function defaultName(){
  const saved=cleanName(store.read<string>('mp:name',''));if(saved)return saved;
  const profile=store.read<{name?:string}|null>('leaderboard:profile',null);
  return cleanName(profile?.name)??'';
}

export class RoomPanel{
  readonly root=document.createElement('section');
  private current:Room|null=null;
  private busy=false;
  private off:(()=>void)|null=null;
  private kinds=new Map<string,LinkKind>();
  private note='';
  private disposed=false;
  constructor(private options:PanelOptions){
    const r=this.root;r.className='mp-panel';r.setAttribute('aria-label',`Online ${options.title}`);
    r.innerHTML=`<h2 class="mp-title">Play ${options.title} online <small>up to ${options.maxPlayers} players</small></h2>
<label class="mp-field"><span>Your name</span><input class="mp-name" maxlength="16" autocomplete="nickname" spellcheck="false" enterkeyhint="done"></label>
<div class="mp-offline">
 <button type="button" class="game-button mp-create">Create room</button>
 <form class="mp-join" novalidate><label class="mp-field"><span>Room code</span><input class="mp-code" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2MX" enterkeyhint="go" aria-describedby="mp-code-help-${options.game}"></label><button class="game-button secondary mp-join-button">Join by code</button></form>
 <p class="mp-help" id="mp-code-help-${options.game}">The host creates a room and shares the 6-character code or invite link.</p>
</div>
<div class="mp-online" hidden>
 <p class="mp-room">Room <strong class="mp-room-code"></strong></p>
 <div class="mp-buttons"><button type="button" class="game-button secondary mp-copy">Copy invite link</button><button type="button" class="game-button secondary mp-leave">Leave room</button></div>
 <ul class="mp-players" aria-label="Players in this room"></ul>
 <p class="mp-link"></p>
</div>
<p class="mp-status" role="status" aria-live="polite"></p>`;
    const name=this.$<HTMLInputElement>('.mp-name'),code=this.$<HTMLInputElement>('.mp-code');
    name.value=defaultName();
    if(options.inviteCode){code.value=options.inviteCode;this.status(`Invite for room ${options.inviteCode}. Check your name, then press Join by code.`);}
    name.addEventListener('change',()=>{const v=cleanName(name.value);if(v)store.write('mp:name',v);});
    code.addEventListener('input',()=>{code.value=code.value.toUpperCase().replace(/[^A-Z0-9-]/g,'');});
    // Typing a name or code must not reach game shortcuts (Blockcraft movement, Pool aiming).
    for(const input of [name,code])for(const type of ['keydown','keyup','keypress'])input.addEventListener(type,e=>{if((e as KeyboardEvent).key!=='Escape')e.stopPropagation();});
    this.$('.mp-create').addEventListener('click',()=>void this.create());
    this.$('.mp-join').addEventListener('submit',e=>{e.preventDefault();void this.join();});
    this.$('.mp-copy').addEventListener('click',()=>void this.copy());
    this.$('.mp-leave').addEventListener('click',()=>this.leave());
  }
  get room(){return this.current;}
  private $<T extends HTMLElement=HTMLElement>(s:string){return this.root.querySelector<T>(s)!;}
  status(text:string,error=false){const s=this.$('.mp-status');s.textContent=text;s.classList.toggle('mp-error',error);}
  /** A game-specific line under the player list ("Waiting for an opponent…"). */
  setNote(text:string){this.note=text;this.renderLink();}
  private name(){
    const value=cleanName(this.$<HTMLInputElement>('.mp-name').value);
    if(!value){this.status('Enter a name of 1–16 characters first.',true);this.$<HTMLInputElement>('.mp-name').focus();return null;}
    store.write('mp:name',value);return value;
  }
  private setBusy(busy:boolean){
    this.busy=busy;
    for(const b of this.root.querySelectorAll<HTMLButtonElement>('.mp-offline button'))b.disabled=busy;
    this.root.setAttribute('aria-busy',String(busy));
  }
  private async create(){
    if(this.busy||this.current)return;const name=this.name();if(!name)return;
    this.setBusy(true);this.status('Creating a room…');
    try{this.attach(await (this.options.createRoom??Room.create)({game:this.options.game,version:this.options.version,maxPlayers:this.options.maxPlayers,name,relayOnly:this.options.relayOnly}));}
    catch(error){this.status(error instanceof RoomError?error.message:'Could not create a room. Check you are online, then try again.',true);}
    finally{this.setBusy(false);}
  }
  private async join(){
    if(this.busy||this.current)return;
    const input=this.$<HTMLInputElement>('.mp-code'),code=normalizeCode(input.value);
    if(!code){this.status('Room codes are 6 letters and numbers, like K7Q2MX.',true);input.focus();return;}
    const name=this.name();if(!name)return;
    this.setBusy(true);this.status(`Joining room ${code}…`);
    try{this.attach(await (this.options.joinRoom??Room.join)({game:this.options.game,version:this.options.version,maxPlayers:this.options.maxPlayers,name,relayOnly:this.options.relayOnly},code));}
    catch(error){this.status(error instanceof RoomError?error.message:'Could not join that room. Try again.',true);}
    finally{this.setBusy(false);}
  }
  private attach(room:Room){
    // The game was left while the room was being created or joined: close it at once.
    if(this.disposed){room.close('left');return;}
    this.current=room;this.kinds.clear();
    this.off=room.on(e=>this.onEvent(room,e));
    this.$('.mp-offline').hidden=true;this.$('.mp-online').hidden=false;this.$<HTMLInputElement>('.mp-name').disabled=true;this.$('.mp-name').parentElement!.hidden=true;
    this.$('.mp-room-code').textContent=room.code;
    this.status(room.role==='host'?`Room ${room.code} is open. Share the code or invite link.`:`Joined room ${room.code}.`);
    this.renderPlayers();this.renderLink();
    this.options.onOpen(room);
    this.$<HTMLButtonElement>('.mp-copy').focus({preventScroll:true});
  }
  private onEvent(room:Room,e:RoomEvent){
    if(e.type==='players')this.renderPlayers();
    else if(e.type==='link'){this.kinds.set(e.id,e.kind);this.renderPlayers();this.renderLink();}
    else if(e.type==='joined')this.status(`${e.player.name} joined.`);
    else if(e.type==='left')this.status(`${e.player.name} ${e.reason==='left'?'left the room':'lost connection'}.`);
    else if(e.type==='signalling'&&!e.connected&&room.role==='host')this.status('Lost the connection server; players already here stay connected. Reconnecting…');
    else if(e.type==='closed')this.detach(e.message);
  }
  private detach(message:string){
    this.off?.();this.off=null;this.current=null;
    this.$('.mp-offline').hidden=false;this.$('.mp-online').hidden=true;this.$<HTMLInputElement>('.mp-name').disabled=false;this.$('.mp-name').parentElement!.hidden=false;
    this.status(message,!/left the room/.test(message));
    this.options.onClosed?.(message);
  }
  private renderPlayers(){
    const room=this.current;if(!room)return;
    const list=this.$('.mp-players');list.replaceChildren();
    for(const p of room.players){
      const li=document.createElement('li');
      const kind=p.id===room.id?null:room.role==='host'?this.kinds.get(p.id):p.host?this.kinds.get(p.id)??this.kinds.values().next().value:null;
      li.textContent=`${p.name}${p.host?' · host':''}${p.id===room.id?' (you)':''}${kind==='relay'?' · relayed':kind==='direct'?' · direct':''}`;
      list.append(li);
    }
    const free=Math.max(0,this.options.maxPlayers-room.players.length);
    if(free){const li=document.createElement('li');li.className='mp-free';li.textContent=`${free} open seat${free===1?'':'s'}`;list.append(li);}
  }
  private renderLink(){
    const room=this.current;if(!room)return;
    const kinds=[...this.kinds.values()];
    let text=room.players.length<2?'':kinds.includes('relay')?LINK_TEXT.relay:kinds.includes('direct')?LINK_TEXT.direct:LINK_TEXT.unknown;
    if(!room.turn)text+=`${text?' ':''}${room.iceMessage}`;
    this.$('.mp-link').textContent=[this.note,text].filter(Boolean).join(' ');
  }
  private async copy(){
    const room=this.current;if(!room)return;
    const link=room.inviteLink;
    try{await navigator.clipboard.writeText(link);this.status('Invite link copied.');}
    catch{
      // Clipboard permission can be refused: show the link selected so it can be copied by hand.
      const input=document.createElement('input');input.className='mp-invite';input.readOnly=true;input.value=link;input.setAttribute('aria-label','Invite link');
      this.root.querySelector('.mp-invite')?.remove();this.$('.mp-buttons').after(input);input.focus();input.select();
      this.status('Copy the selected invite link.');
    }
  }
  leave(){this.current?.close('left');}
  dispose(){this.disposed=true;this.off?.();this.off=null;const room=this.current;this.current=null;room?.close('left');this.root.remove();}
}

/** The Multiplayer menu: the room panel in a card floating in the centre of the screen over the game. It sits outside the
 *  game's layout (fixed, in #app), so opening it resizes nothing; Study Mode hides it with the rest of the arcade. */
export class RoomDialog{
  readonly root=document.createElement('div');
  readonly panel:RoomPanel;
  private before:HTMLElement|null=null;
  constructor(options:PanelOptions){
    this.panel=new RoomPanel(options);
    const r=this.root;r.className='mp-overlay';r.hidden=true;
    r.setAttribute('role','dialog');r.setAttribute('aria-modal','true');r.setAttribute('aria-label',`${options.title} multiplayer`);
    const card=document.createElement('div');card.className='mp-card';
    const close=document.createElement('button');close.type='button';close.className='mp-close';close.setAttribute('aria-label','Close multiplayer menu');
    close.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
    close.addEventListener('click',()=>this.close());
    card.append(close,this.panel.root);r.append(card);
    // A click on the backdrop closes; nothing inside reaches the game below.
    r.addEventListener('click',e=>{if(e.target===r)this.close();});
    for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','wheel','touchstart','keydown','keyup'])
      r.addEventListener(type,e=>{if((e as KeyboardEvent).key!=='Escape')e.stopPropagation();});
    (document.querySelector('#app')??document.body).append(r);
  }
  get isOpen(){return !this.root.hidden;}
  open(){
    if(this.isOpen)return;
    this.before=document.activeElement instanceof HTMLElement?document.activeElement:null;
    this.root.hidden=false;
    this.root.querySelector<HTMLElement>('.mp-panel input:not(:disabled),.mp-panel button:not(:disabled)')?.focus({preventScroll:true});
  }
  close(){
    if(!this.isOpen)return;
    this.root.hidden=true;
    if(this.before?.isConnected)this.before.focus({preventScroll:true});
    this.before=null;
  }
  dispose(){this.panel.dispose();this.root.remove();}
}
