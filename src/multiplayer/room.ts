// One online room: a star of WebRTC data channels around the player who created it. The host admits guests (protocol, game
// and version must match, and there must be a free seat), relays nothing on its own, and decides everything in the game;
// guests only talk to the host. The host's pause pauses the whole room. When the host leaves the room ends (no migration).
import {MAX_MESSAGE_CHARS,PROTOCOL_VERSION,Reassembler,cleanName,frame,hostPeerId,normalizeCode,parseEnvelope,randomCode,type Envelope,type RejectReason,type RosterEntry} from './protocol';
import {entryHash} from '../core/navigation';
import type {GameId} from '../core/types';
import {peerEndpoint,type Endpoint,type EndpointFactory,type Link,type LinkKind,type TransportError} from './transport';
import {iceServers,type IceResult} from './ice';

export type {RosterEntry};
export type RoomErrorCode='invalid-code'|'not-found'|'full'|'version'|'game'|'name'|'network'|'timeout'|'unsupported'|'closed';
export class RoomError extends Error{constructor(readonly code:RoomErrorCode,message:string){super(message);this.name='RoomError';}}
export type CloseReason='left'|'host-left'|'host-lost'|'kicked'|'error';
export type RoomEvent=
  |{type:'players';players:readonly RosterEntry[]}
  |{type:'joined';player:RosterEntry}
  |{type:'left';player:RosterEntry;reason:'left'|'lost'|'timeout'}
  |{type:'message';from:RosterEntry;data:unknown}
  |{type:'paused';paused:boolean}
  |{type:'link';id:string;kind:LinkKind}
  |{type:'signalling';connected:boolean}
  |{type:'closed';reason:CloseReason;message:string};
export interface RoomOptions{
  game:string;
  /** Peers with a different version string are refused ("reload both devices"). */
  version:string;
  maxPlayers:number;
  name:string;
  /** Force every connection through TURN (tests the relay). */
  relayOnly?:boolean;
  endpoint?:EndpointFactory;
  ice?:()=>Promise<IceResult>;
}

/** Connections waiting to be admitted, and the largest message they may send (a hello is tiny). */
const MAX_PENDING=8,HELLO_CHARS=4096;
const HEARTBEAT_MS=2000,HOST_SILENCE_MS=10000,GUEST_SILENCE_MS=12000,PAUSED_SILENCE_MS=90000,HELLO_MS=10000,JOIN_MS=20000;
const MESSAGES:Record<RejectReason,string>={
  full:'That room is full.',
  version:'The host is running a different version of this game. Reload both devices so they match.',
  game:'That code belongs to a different game.',
  closing:'The host is closing that room.',
  name:'Choose a name of 1–16 characters.',
  protocol:'The host is running a different version of QCC Games. Reload both devices so they match.'
};
const ERROR_CODES:Record<RejectReason,RoomErrorCode>={full:'full',version:'version',game:'game',closing:'closed',name:'name',protocol:'version'};

interface Peer{entry:RosterEntry|null;link:Link;reader:Reassembler;seen:number;bad:number;rtt:number;kind:LinkKind;hello:ReturnType<typeof setTimeout>|undefined}

export class Room{
  readonly role:'host'|'guest';
  readonly code:string;
  readonly turn:boolean;
  readonly iceMessage:string;
  private listeners=new Set<(event:RoomEvent)=>void>();
  private roster:RosterEntry[]=[];
  private peers=new Map<string,Peer>();
  private selfId='';
  private pausedState=false;
  private closedState=false;
  private heartbeat:ReturnType<typeof setInterval>|undefined;
  private partId=0;
  private readonly unload=()=>this.close('left');

  private constructor(role:'host'|'guest',code:string,private endpoint:Endpoint,private options:RoomOptions,ice:IceResult){
    this.role=role;this.code=code;this.turn=ice.turn;this.iceMessage=ice.message;
    if(typeof window!=='undefined')window.addEventListener('pagehide',this.unload);
    endpoint.onDisconnected(()=>{if(this.closedState)return;this.emit({type:'signalling',connected:false});setTimeout(()=>{if(!this.closedState)endpoint.reconnect();},1500);});
  }

  /** Registers the room code with the signalling server (a taken code is replaced) and waits for guests. */
  static async create(options:RoomOptions):Promise<Room>{
    const name=cleanName(options.name);if(!name)throw new RoomError('name',MESSAGES.name);
    const ice=await (options.ice??iceServers)();
    const open=options.endpoint??peerEndpoint;
    for(let attempt=0;;attempt++){
      const code=randomCode();
      try{
        const endpoint=await open(hostPeerId(options.game,code),{iceServers:ice.iceServers,relayOnly:!!options.relayOnly});
        const room=new Room('host',code,endpoint,{...options,name},ice);
        room.selfId=endpoint.id;room.roster=[{id:endpoint.id,seat:0,name,host:true}];
        endpoint.onLink(link=>room.admit(link));
        endpoint.onError(e=>{if(e.type==='network'||e.type==='server-error'||e.type==='socket-error')room.emit({type:'signalling',connected:false});});
        room.startHeartbeat();
        return room;
      }catch(error){
        const e=error as TransportError;
        if(e?.type==='unavailable-id'&&attempt<4)continue;
        throw transportError(e);
      }
    }
  }

  /** Connects to a host by code. Rejects with a RoomError explaining what went wrong. */
  static async join(options:RoomOptions,input:string):Promise<Room>{
    const code=normalizeCode(input);
    if(!code)throw new RoomError('invalid-code','Room codes are 6 letters and numbers, like K7Q2MX.');
    const name=cleanName(options.name);if(!name)throw new RoomError('name',MESSAGES.name);
    const ice=await (options.ice??iceServers)();
    let endpoint:Endpoint;
    try{endpoint=await (options.endpoint??peerEndpoint)(undefined,{iceServers:ice.iceServers,relayOnly:!!options.relayOnly});}
    catch(error){throw transportError(error as TransportError);}
    const room=new Room('guest',code,endpoint,{...options,name},ice);room.selfId=endpoint.id;
    try{await room.connect(hostPeerId(options.game,code),name,ice);}
    catch(error){room.teardown();throw error;}
    return room;
  }

  get id(){return this.selfId;}
  get players():readonly RosterEntry[]{return this.roster;}
  get self():RosterEntry|undefined{return this.roster.find(p=>p.id===this.selfId);}
  get paused(){return this.pausedState;}
  get closed(){return this.closedState;}
  get inviteLink(){
    const base=typeof location!=='undefined'?location.href.split('#')[0]:'';
    return `${base}${entryHash(this.options.game as GameId)}?room=${this.code}`;
  }
  /** Round-trip time to a guest (host) or to the host (guest), ms; NaN until measured. */
  rtt(id?:string){const p=id?this.peers.get(id):[...this.peers.values()][0];return p?p.rtt:NaN;}
  linkKind(id?:string):LinkKind{const p=id?this.peers.get(id):[...this.peers.values()][0];return p?p.kind:'unknown';}

  on(listener:(event:RoomEvent)=>void):()=>void{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private emit(event:RoomEvent){for(const l of [...this.listeners])try{l(event);}catch(error){console.error(error);}}

  /** Guest: to the host. Host: to one guest (`to`) or, without it, to every guest. */
  send(data:unknown,to?:string){
    if(this.closedState)return;
    const message:Envelope={t:'game',d:data};
    if(this.role==='guest'){const host=[...this.peers.values()][0];if(host)this.write(host,message);return;}
    if(to){const p=this.peers.get(to);if(p?.entry)this.write(p,message);return;}
    this.broadcastEnvelope(message);
  }
  broadcast(data:unknown,except?:string){if(!this.closedState&&this.role==='host')this.broadcastEnvelope({t:'game',d:data},except);}
  private broadcastEnvelope(message:Envelope,except?:string){
    // Frame once for every guest.
    const frames=frame(message,()=>++this.partId);
    for(const p of this.peers.values())if(p.entry&&p.entry.id!==except)for(const f of frames)p.link.send(f);
  }
  private write(p:Peer,message:Envelope){for(const f of frame(message,()=>++this.partId))p.link.send(f);}

  /** Host only: pause or resume every guest. */
  setPaused(paused:boolean){
    if(this.role!=='host'||this.closedState||this.pausedState===paused)return;
    this.pausedState=paused;this.broadcastEnvelope({t:'pause',paused});
    for(const p of this.peers.values())p.seen=Date.now();
    this.emit({type:'paused',paused});
  }

  /** Leave (guest) or end the room for everyone (host). */
  close(reason:CloseReason='left',message=reason==='left'?'You left the room.':'The room has closed.'){
    if(this.closedState)return;
    const bye:Envelope={t:'bye',reason:this.role==='host'?'host-closed':'left'};
    for(const p of this.peers.values())for(const f of frame(bye,()=>++this.partId))p.link.send(f);
    this.finish(reason,message);
  }
  private finish(reason:CloseReason,message:string){
    if(this.closedState)return;
    this.closedState=true;
    // Give the goodbye a moment to flush before the channels close.
    setTimeout(()=>this.teardown(),250);
    this.emit({type:'closed',reason,message});
  }
  private teardown(){
    this.closedState=true;clearInterval(this.heartbeat);
    if(typeof window!=='undefined')window.removeEventListener('pagehide',this.unload);
    for(const p of this.peers.values()){clearTimeout(p.hello);try{p.link.close();}catch{/* already closed */}}
    this.peers.clear();
    try{this.endpoint.destroy();}catch{/* already destroyed */}
  }

  // ---- Host ---------------------------------------------------------------------------------------------------------
  private admit(link:Link){
    if(this.closedState){link.close();return;}
    let pending=0;for(const p of this.peers.values())if(!p.entry)pending++;
    if(pending>=MAX_PENDING){link.close();return;}
    // The same peer connecting again replaces its old connection (and frees its seat).
    const old=this.peers.get(link.peer);if(old)this.drop(old,'lost');
    const peer:Peer={entry:null,link,reader:new Reassembler(HELLO_CHARS),seen:Date.now(),bad:0,rtt:NaN,kind:'unknown',hello:undefined};
    this.peers.set(link.peer,peer);
    peer.hello=setTimeout(()=>{if(!peer.entry)this.drop(peer,'timeout');},HELLO_MS);
    link.onData(text=>this.receiveHost(peer,text));
    link.onClose(()=>this.drop(peer,'lost'));
    link.onError(()=>this.drop(peer,'lost'));
    link.onOpen(()=>this.measure(peer));
  }
  private refuse(peer:Peer,reason:RejectReason,message=MESSAGES[reason]){
    this.write(peer,{t:'reject',reason,message});
    this.peers.delete(peer.link.peer);clearTimeout(peer.hello);
    setTimeout(()=>{try{peer.link.close();}catch{/* closed */}},400);
  }
  private receiveHost(peer:Peer,text:string){
    let value:unknown;
    try{value=peer.reader.push(text);}catch{this.malformed(peer);return;}
    if(value===undefined)return;
    const m=parseEnvelope(value);if(!m){this.malformed(peer);return;}
    peer.seen=Date.now();
    if(!peer.entry){
      if(m.t!=='hello'){this.malformed(peer);return;}
      if(m.protocol!==PROTOCOL_VERSION)return this.refuse(peer,'protocol');
      if(m.game!==this.options.game)return this.refuse(peer,'game');
      if(m.version!==this.options.version)return this.refuse(peer,'version');
      const name=cleanName(m.name);if(!name)return this.refuse(peer,'name');
      if(this.roster.length>=this.options.maxPlayers)return this.refuse(peer,'full');
      let seat=1;while(this.roster.some(p=>p.seat===seat))seat++;
      let unique=name,n=2;while(this.roster.some(p=>p.name===unique))unique=`${name.slice(0,13)} ${n++}`;
      clearTimeout(peer.hello);peer.reader.limit=MAX_MESSAGE_CHARS;
      peer.entry={id:peer.link.peer,seat,name:unique,host:false};
      this.roster=[...this.roster,peer.entry].sort((a,b)=>a.seat-b.seat);
      this.write(peer,{t:'welcome',seat,you:peer.entry.id,players:this.roster,paused:this.pausedState});
      this.broadcastEnvelope({t:'roster',players:this.roster},peer.entry.id);
      this.emit({type:'players',players:this.roster});
      this.emit({type:'joined',player:peer.entry});
      return;
    }
    if(m.t==='game')this.emit({type:'message',from:peer.entry,data:m.d});
    else if(m.t==='pong')peer.rtt=Date.now()-m.at;
    else if(m.t==='bye')this.drop(peer,'left');
    else if(m.t==='ping')this.write(peer,{t:'pong',at:m.at});
  }
  private malformed(peer:Peer){if(++peer.bad>=20)this.drop(peer,'lost');}
  private drop(peer:Peer,reason:'left'|'lost'|'timeout'){
    if(this.peers.get(peer.link.peer)!==peer)return;
    this.peers.delete(peer.link.peer);clearTimeout(peer.hello);
    try{peer.link.close();}catch{/* closed */}
    if(this.role==='guest'){
      if(!this.closedState)this.finish(reason==='left'?'host-left':'host-lost',reason==='left'?'The host ended the online game.':'Lost the connection to the host. The online game has ended.');
      return;
    }
    const entry=peer.entry;if(!entry)return;
    this.roster=this.roster.filter(p=>p.id!==entry.id);
    if(!this.closedState){this.broadcastEnvelope({t:'roster',players:this.roster});this.emit({type:'players',players:this.roster});this.emit({type:'left',player:entry,reason});}
  }
  private startHeartbeat(){
    this.heartbeat=setInterval(()=>{
      if(this.closedState)return;
      const now=Date.now();
      for(const p of [...this.peers.values()]){
        if(!p.entry&&this.role==='host')continue;
        this.write(p,{t:'ping',at:now});
        const limit=this.role==='host'?GUEST_SILENCE_MS:this.pausedState?PAUSED_SILENCE_MS:HOST_SILENCE_MS;
        if(now-p.seen>limit)this.drop(p,'timeout');
      }
    },HEARTBEAT_MS);
  }
  private measure(peer:Peer){
    for(const delay of [1500,6000])setTimeout(()=>{
      if(this.closedState||!this.peers.has(peer.link.peer))return;
      void peer.link.kind().then(kind=>{if(kind!==peer.kind||delay>1500){peer.kind=kind;this.emit({type:'link',id:peer.entry?.id??peer.link.peer,kind});}});
    },delay);
  }

  // ---- Guest --------------------------------------------------------------------------------------------------------
  private connect(hostId:string,name:string,ice:IceResult):Promise<void>{
    return new Promise((resolve,reject)=>{
      let settled=false;
      const fail=(error:RoomError)=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);};
      const link=this.endpoint.connect(hostId);
      const peer:Peer={entry:{id:hostId,seat:0,name:'Host',host:true},link,reader:new Reassembler(),seen:Date.now(),bad:0,rtt:NaN,kind:'unknown',hello:undefined};
      this.peers.set(hostId,peer);
      const timer=setTimeout(()=>fail(new RoomError('timeout',ice.turn
        ?'Could not reach the host. Check both devices are online, then try again.'
        :'Could not reach the host. This network may block direct connections, and relay fallback is unavailable.')),JOIN_MS);
      this.endpoint.onError(e=>{
        if(e.type==='peer-unavailable')fail(new RoomError('not-found','No room with that code is open. Check the code, or ask the host for a new invite.'));
        else if(!settled)fail(transportError(e));
      });
      link.onOpen(()=>{this.write(peer,{t:'hello',protocol:PROTOCOL_VERSION,game:this.options.game,version:this.options.version,name});this.measure(peer);});
      link.onError(e=>fail(new RoomError('network',`The connection failed (${e.type}).`)));
      link.onClose(()=>{if(!settled)fail(new RoomError('network','The host closed the connection.'));else this.drop(peer,'lost');});
      link.onData(text=>{
        let value:unknown;
        try{value=peer.reader.push(text);}catch{return;}
        if(value===undefined)return;
        const m=parseEnvelope(value);if(!m)return;
        peer.seen=Date.now();
        if(!settled){
          if(m.t==='reject'){fail(new RoomError(ERROR_CODES[m.reason]??'closed',MESSAGES[m.reason]??m.message));return;}
          if(m.t!=='welcome')return;
          settled=true;clearTimeout(timer);
          this.selfId=m.you;this.roster=m.players;this.pausedState=m.paused;
          this.startHeartbeat();resolve();
          queueMicrotask(()=>{this.emit({type:'players',players:this.roster});if(m.paused)this.emit({type:'paused',paused:true});});
          return;
        }
        switch(m.t){
          case 'game':this.emit({type:'message',from:peer.entry!,data:m.d});break;
          case 'roster':this.roster=m.players;this.emit({type:'players',players:this.roster});break;
          case 'pause':if(m.paused!==this.pausedState){this.pausedState=m.paused;this.emit({type:'paused',paused:m.paused});}break;
          case 'ping':this.write(peer,{t:'pong',at:m.at});break;
          case 'pong':peer.rtt=Date.now()-m.at;break;
          case 'bye':this.drop(peer,'left');break;
        }
      });
    });
  }
}

function transportError(e:TransportError|undefined):RoomError{
  switch(e?.type){
    case 'browser-incompatible':return new RoomError('unsupported','This browser cannot make peer-to-peer connections (WebRTC).');
    case 'timeout':case 'network':case 'server-error':case 'socket-error':case 'socket-closed':
      return new RoomError('network','Could not reach the connection server. Check you are online, then try again.');
    case 'peer-unavailable':return new RoomError('not-found','No room with that code is open. Check the code, or ask the host for a new invite.');
    default:return new RoomError('network',`Could not start online play${e?.message?` (${e.message})`:''}.`);
  }
}
