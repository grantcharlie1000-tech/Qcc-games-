import {RoomPanel,inviteCodeFromHash,relayOnlyFromHash} from '../../../multiplayer/panel';
import type {Room} from '../../../multiplayer/room';
import type {SimWorld,Simulation,InputFrame,SimEvent} from '../sim';
import type {HUD,MatchOptions} from '../ui/hud';
import {ONLINE_VERSION,OnlineSession,type Lobby} from './session';
export interface OnlineHooks{world():SimWorld;input():InputFrame;state(sim:Simulation,local:number):void;events(events:SimEvent[]):void;closed(message:string):void;rates():{tickHz:number;snapshotHz:number;maxTeam:number};think():number;tick(ms:number):void;error(metres:number):void;release():void}
export class OnlineController{
 session:OnlineSession|null=null;private panel:RoomPanel;private dialog:HTMLDialogElement|null=null;private roster:HTMLElement|null=null;private options:HTMLElement|null=null;private startButton:HTMLButtonElement|null=null;private disposed=false;private closing=false;private dragPeer:string|null=null;private lastLobby:Lobby|null=null;
 constructor(private hud:HUD,private hooks:OnlineHooks,seed:number){
  this.panel=new RoomPanel({game:'strongroom',title:'Strongroom',version:ONLINE_VERSION,maxPlayers:hooks.rates().maxTeam*2,inviteCode:inviteCodeFromHash(location.hash),relayOnly:relayOnlyFromHash(location.hash)||new URLSearchParams(location.search).get('relay')==='1',onOpen:room=>this.attach(room,seed),onClosed:message=>this.stop(message)});
  if(inviteCodeFromHash(location.hash))queueMicrotask(()=>{if(!this.disposed)this.open();});
 }
 get isOpen(){return !!this.dialog?.open;}
 get connected(){return !!this.session&&!this.session.room.closed;}
 private attach(room:Room,seed:number){
  this.closing=false;this.session=new OnlineSession(room,this.hooks.world(),{...this.hooks,lobby:l=>this.paint(l),paused:on=>this.hud.notice(on?'Host is reading (paused)':''),closed:m=>this.stop(m)},seed,new URLSearchParams(location.search).get('netsim')==='1');
  this.paint(this.session.lobby);this.panel.setNote('Bots fill every empty seat. The host starts the match.');
 }
 open(){
  if(this.disposed||this.isOpen)return;this.hooks.release();
  this.dialog=this.hud.sheet('Strongroom online',(body,d)=>{
   body.append(this.panel.root);this.roster=document.createElement('div');this.roster.className='sr-seats';this.options=document.createElement('div');this.options.className='sr-lobby-options';this.startButton=document.createElement('button');this.startButton.className='sr-online-start';this.startButton.textContent='Start match';this.startButton.hidden=true;this.startButton.addEventListener('click',()=>{if(this.session?.role==='host'){d.close();this.session.start();}});body.append(this.roster,this.options,this.startButton);
   d.addEventListener('close',()=>{if(this.dialog===d){this.dialog=null;this.roster=null;this.options=null;this.startButton=null;}},{once:true});
   if(this.lastLobby)this.paint(this.lastLobby);
  });
 }
 dismiss(){if(!this.isOpen)return false;this.dialog!.close();return true;}
 private paint(lobby:Lobby){
  this.lastLobby=lobby;const session=this.session,host=session?.role==='host';
  if(lobby.started){this.dialog?.close();return;}
  if(!this.roster||!this.options||!this.startButton)return;
  this.hud.releaseGlass(this.roster);this.hud.releaseGlass(this.options);this.roster.replaceChildren();this.options.replaceChildren();const size=lobby.settings.teamSize;
  for(const team of [1,0]){const col=document.createElement('div'),heading=document.createElement('h3');heading.textContent=team===1?'Attack first':'Defend first';col.append(heading);for(const seat of lobby.seats.filter(s=>s.team===team)){
   const row=document.createElement('div');row.className='sr-seat';const b=document.createElement('button');b.type='button';b.dataset.seat=String(seat.seat);b.textContent=seat.bot?`Bot (${lobby.settings.difficulty})`:`${seat.name}${seat.peer===session?.room.id?' (you)':''}`;b.setAttribute('aria-label',`${team===1?'Attack':'Defend'} seat ${seat.seat%size+1}: ${b.textContent}`);b.disabled=!seat.bot&&seat.peer!==session?.room.id&&!host;b.addEventListener('click',()=>session?.chooseSeat(seat.seat));
   if(host&&seat.peer){b.draggable=true;b.addEventListener('dragstart',()=>this.dragPeer=seat.peer!);b.addEventListener('dragend',()=>this.dragPeer=null);if(seat.peer!==session?.room.id){const kick=document.createElement('button');kick.textContent='Remove';kick.setAttribute('aria-label',`Remove ${seat.name}`);kick.addEventListener('click',()=>session?.room.kick(seat.peer!));row.append(kick);}}
   if(host){b.addEventListener('dragover',e=>e.preventDefault());b.addEventListener('drop',e=>{e.preventDefault();if(this.dragPeer)session?.chooseSeat(seat.seat,this.dragPeer);this.dragPeer=null;});}row.prepend(b);col.append(row);
  }this.roster.append(col);}
  const configure=(settings:MatchOptions)=>session?.configure(settings);
  if(host){
   const team=document.createElement('button');team.textContent=`Team size ${size}v${size}`;team.disabled=this.hooks.rates().maxTeam<5;team.title=team.disabled?'Your device can host up to 3v3':'';team.addEventListener('click',()=>configure({...lobby.settings,teamSize:size===3?5:3}));
   const difficulty=document.createElement('button');difficulty.textContent=`Bots: ${lobby.settings.difficulty}`;difficulty.addEventListener('click',()=>{const all=['easy','normal','hard'] as const;configure({...lobby.settings,difficulty:all[(all.indexOf(lobby.settings.difficulty)+1)%3]});});
   const length=document.createElement('button');length.textContent=lobby.settings.quick?'Quick match':'Standard match';length.addEventListener('click',()=>configure({...lobby.settings,quick:!lobby.settings.quick}));this.options.append(team,difficulty,length);
   if(team.disabled){const p=document.createElement('p');p.className='muted';p.textContent='Your device can host up to 3v3';this.options.append(p);}
  }else{const p=document.createElement('p');p.textContent='Waiting for host';p.setAttribute('role','status');this.options.append(p);}
  this.startButton.hidden=!session;this.startButton.disabled=!host;this.startButton.textContent=host?'Start match':'Waiting for host';this.hud.decorate(this.roster);this.hud.decorate(this.options);this.hud.decorate(this.startButton.parentElement!);
 }
 setAway(on:boolean){this.session?.setAway(on);}
 restart(){if(!this.session||this.session.role!=='host')return false;this.session.toLobby();this.open();return true;}
 reset(){this.session?.dispose();this.session=null;this.lastLobby=null;}
 leave(){if(this.session&&!this.session.room.closed)this.session.room.close('left');this.stop('You left the room.');}
 private stop(message:string){if(this.closing||this.disposed)return;this.closing=true;this.session?.dispose();this.dialog?.close();this.lastLobby=null;this.hooks.closed(/removed/i.test(message)?'Removed from room':/host|Lost/i.test(message)?'Host left':message);}
 dispose(){if(this.disposed)return;this.disposed=true;this.session?.dispose();this.panel.dispose();this.dialog?.close();this.dialog=null;}
}
