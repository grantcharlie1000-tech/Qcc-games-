// A small transport seam: the Room speaks to Links and Endpoints, and PeerJS is one implementation (tests use an in-memory
// one). PeerJS is imported lazily so offline play never downloads it.
export type LinkKind='direct'|'relay'|'unknown';
export interface Link{
  readonly peer:string;
  send(text:string):void;
  close():void;
  onOpen(cb:()=>void):void;
  onData(cb:(text:string)=>void):void;
  onClose(cb:()=>void):void;
  onError(cb:(error:TransportError)=>void):void;
  /** Whether the selected ICE candidate pair goes through a TURN relay. */
  kind():Promise<LinkKind>;
}
export interface TransportError{type:string;message:string}
export interface Endpoint{
  readonly id:string;
  onLink(cb:(link:Link)=>void):void;
  onError(cb:(error:TransportError)=>void):void;
  /** Lost the signalling server (existing links keep working). */
  onDisconnected(cb:()=>void):void;
  connect(peer:string):Link;
  reconnect():void;
  destroy():void;
}
export interface IceConfig{iceServers:RTCIceServer[];relayOnly:boolean}
/** Opens an endpoint registered under `id` (random when undefined). Rejects with a TransportError. */
export type EndpointFactory=(id:string|undefined,ice:IceConfig)=>Promise<Endpoint>;

type PeerModule=typeof import('peerjs');
type PeerInstance=InstanceType<PeerModule['Peer']>;
type DataConnection=import('peerjs').DataConnection;

function wrap(conn:DataConnection):Link{
  return{
    peer:conn.peer,
    send:text=>{if(conn.open)void conn.send(text);},
    close:()=>conn.close(),
    onOpen:cb=>{if(conn.open)queueMicrotask(cb);else conn.on('open',cb);},
    onData:cb=>conn.on('data',data=>{if(typeof data==='string')cb(data);}),
    onClose:cb=>conn.on('close',cb),
    onError:cb=>conn.on('error',e=>cb({type:String((e as {type?:string}).type??'connection'),message:e.message})),
    kind:()=>linkKind(conn.peerConnection)
  };
}
export async function linkKind(pc:RTCPeerConnection|undefined|null):Promise<LinkKind>{
  if(!pc)return 'unknown';
  try{
    const stats=await pc.getStats();let pairId:string|undefined;
    stats.forEach(r=>{if(r.type==='transport'&&r.selectedCandidatePairId)pairId=r.selectedCandidatePairId;});
    let pair:RTCIceCandidatePairStats|undefined;
    stats.forEach(r=>{if(r.type==='candidate-pair'&&(r.id===pairId||!pairId&&(r as RTCIceCandidatePairStats).nominated&&r.state==='succeeded'))pair=r as RTCIceCandidatePairStats;});
    if(!pair)return 'unknown';
    const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);
    if(!local||!remote)return 'unknown';
    return local.candidateType==='relay'||remote.candidateType==='relay'?'relay':'direct';
  }catch{return 'unknown';}
}

/** PeerJS Cloud (0.peerjs.com) signalling. Only our ICE servers are used: PeerJS's built-in public TURN is replaced. */
export const peerEndpoint:EndpointFactory=async(id,ice)=>{
  const {Peer}=await import('peerjs');
  const config:RTCConfiguration={iceServers:ice.iceServers,iceTransportPolicy:ice.relayOnly?'relay':'all'};
  const peer:PeerInstance=id?new Peer(id,{config,debug:0}):new Peer({config,debug:0});
  return new Promise<Endpoint>((resolve,reject)=>{
    let opened=false;
    const errorHandlers:((e:TransportError)=>void)[]=[];
    peer.on('error',e=>{
      const error={type:String(e.type),message:e.message};
      if(!opened){opened=true;peer.destroy();reject(error);return;}
      for(const h of errorHandlers)h(error);
    });
    const timer=setTimeout(()=>{if(!opened){opened=true;peer.destroy();reject({type:'timeout',message:'The signalling server did not answer.'});}},15000);
    peer.on('open',openId=>{
      if(opened)return;opened=true;clearTimeout(timer);
      resolve({
        id:openId,
        onLink:cb=>peer.on('connection',conn=>cb(wrap(conn))),
        onError:cb=>{errorHandlers.push(cb);},
        onDisconnected:cb=>peer.on('disconnected',cb),
        connect:target=>wrap(peer.connect(target,{reliable:true,serialization:'raw'})),
        reconnect:()=>{if(!peer.destroyed&&peer.disconnected)peer.reconnect();},
        destroy:()=>peer.destroy()
      });
    });
  });
};
