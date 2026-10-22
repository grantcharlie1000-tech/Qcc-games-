// game.net: offline it reports the local player and full authority, so every system behaves as in single player. The
// "Multiplayer" menu button opens the shared room panel (Create room, Join by code, Copy invite link, Leave room). The
// creator hosts: its world becomes the shared world (saved separately from single player). A guest's single-player world is
// kept aside while it plays online and comes back when it leaves or the host goes.
import {RoomDialog,inviteCodeFromHash,relayOnlyFromHash} from '../../../multiplayer/panel';
import type {Room} from '../../../multiplayer/room';
import type {Game,NetRole,NetService,PlayerView} from '../engine/contracts';
import {localView} from '../engine/players';
import {GuestSession,type GuestWorld} from './guest';
import {HostSession} from './host';
import {BLOCKCRAFT_ONLINE_VERSION,MAX_PLAYERS} from './protocol';

/** What the network layer needs from the engine. */
export interface NetHooks{
  /** The current world as a save snapshot. */
  serialize():unknown;
  /** Replaces the world with a snapshot (the shared world, or the single-player world on leaving). */
  restore(snapshot:unknown):void;
  /** A brand-new world from `seed` (the host's first shared world). */
  freshWorld(seed:number):void;
  loadGuestWorld(world:GuestWorld):void;
  /** Keep chunks generated and simulated around these points too (the guests). */
  setExtraCentres(points:readonly {x:number;z:number}[]):void;
  /** Guest: stop play until the host is back (the room is paused or the world is loading). */
  hold(on:boolean):void;
  /** Wake the render loop (remote changes arrived while it idled). */
  wake():void;
  /** The graphics context is lost (the engine can no longer change worlds). */
  lost():boolean;
}
export interface NetController extends NetService{
  /** The single-player world kept aside while online (the shell keeps saving this one); null offline. */
  readonly kept:unknown;
  keep(snapshot:unknown):void;
}

export function createNet(game:Game,hooks:NetHooks):NetController{
  let role:NetRole='offline',host:HostSession|null=null,guest:GuestSession|null=null,room:Room|null=null,kept:unknown=null;
  let dialog:RoomDialog|null=null,waiting:HTMLElement|null=null;
  let holdReason:'join'|'host'|null=null,disposing=false;
  const local=localView(game);
  const single:readonly PlayerView[]=[local];

  function showWaiting(){
    if(!waiting){
      waiting=document.createElement('div');waiting.className='mp-waiting bc-waiting';waiting.setAttribute('role','status');
      game.root.append(waiting);
    }
    waiting.hidden=!holdReason;
    waiting.innerHTML=holdReason==='join'?'Joining the shared world…<small>Loading the host’s world and changes.</small>':holdReason==='host'?'Waiting for host<small>The host has paused the game. Play continues when they return.</small>':'';
  }
  function hold(reason:'join'|'host'|null){holdReason=reason;hooks.hold(!!reason);showWaiting();}

  function start(r:Room){
    room=r;kept=hooks.serialize();
    if(r.role==='host'){role='host';host=new HostSession(game,r,hooks,local);}
    else{
      role='guest';hold('join');
      guest=new GuestSession(game,r,{...hooks,
        loadGuestWorld:w=>{hooks.loadGuestWorld(w);hold(r.paused?'host':null);},
        hold:on=>{if(holdReason!=='join')hold(on?'host':null);}
      });
    }
    game.events.emit('settingsChanged',{settings:game.settings});
    // The host keeps the menu open to share the code; a guest goes straight into the world.
    if(r.role==='guest')overlayVisible(false);
  }
  function stop(message:string){
    const wasGuest=role==='guest';
    host?.dispose();guest?.dispose();host=null;guest=null;room=null;role='offline';
    hold(null);
    if(disposing)return;
    // Without graphics (context lost) the world cannot be swapped back: keep the single-player world aside, so the shell
    // goes on saving it rather than the online world.
    if(hooks.lost())return;
    const back=kept;kept=null;
    if(back)hooks.restore(back);else if(wasGuest)hooks.freshWorld(1);
    game.events.emit('settingsChanged',{settings:game.settings});
    game.ui.toast(message.slice(0,120));game.context.announce(message);game.context.setStatus(message);
  }
  /** The Multiplayer menu, floating in the centre over the game (no layout changes). */
  function overlayVisible(show:boolean){
    if(show&&!dialog){
      dialog=new RoomDialog({game:'blockcraft',title:'Blockcraft',version:BLOCKCRAFT_ONLINE_VERSION,maxPlayers:MAX_PLAYERS,onOpen:start,onClosed:stop,
        inviteCode:inviteCodeFromHash(location.hash),relayOnly:relayOnlyFromHash(location.hash)});
      dialog.panel.setNote('The host’s world is shared and saved on the host’s device. Guests keep their own single-player world.');
    }
    if(show)dialog?.open();else dialog?.close();
  }
  const service:NetController={
    get role(){return role;},
    get authority(){return role!=='guest';},
    get kept(){return kept;},
    keep(snapshot){kept=snapshot;},
    players(){return host?host.players:single;},
    player(id){return host?host.player(id):id===local.id?local:undefined;},
    nearestPlayer(x,y,z,max=Infinity,filter){
      let best:PlayerView|null=null,bestD=max*max;
      for(const p of service.players()){if(filter&&!filter(p))continue;const d=(p.x-x)**2+(p.y-y)**2+(p.z-z)**2;if(d<=bestD){best=p;bestD=d;}}
      return best;
    },
    openPanel(){overlayVisible(true);},
    containerBusy:positions=>host?.busy(positions)??null,
    init(){if(inviteCodeFromHash(location.hash))queueMicrotask(()=>overlayVisible(true));},
    tick(){host?.tick();guest?.tick();},
    frame(){host?.frame();guest?.frame();},
    dispose(){
      disposing=true;
      // Leaving the game ends the room (guests are told the host left) and saves the shared world.
      if(room&&!room.closed)room.close('left');
      host?.dispose();guest?.dispose();host=null;guest=null;role='offline';
      dialog?.dispose();waiting?.remove();
    }
  };
  return service;
}
