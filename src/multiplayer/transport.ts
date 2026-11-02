// A small transport seam: the Room speaks to Links and Endpoints, and PeerJS is one implementation (tests use an in-memory
// one). PeerJS is imported lazily so offline play never downloads it.
export type LinkKind='direct'|'relay'|'unknown';
export type UnreliableMessage=string|ArrayBuffer;
export interface Link{
  readonly peer:string;
  send(text:string):void;
  close():void;
  onOpen(cb:()=>void):void;
  onData(cb:(text:string)=>void):void;
  /** Ephemeral updates. Falls back to a framed reliable message until RTC is ready. */
  sendUnreliable?(message:UnreliableMessage):void;
  /** Receives ephemeral updates on either path; ordinary onData traffic stays separate. */
  onUnreliable?(cb:(message:UnreliableMessage)=>void):void;
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

// Both peers reserve this SCTP stream. PeerJS's main stream is automatically
// allocated; reliable:false alone only disables ordering in PeerJS 1.5.5.
const UNRELIABLE_CHANNEL_ID=7;
// A binary envelope avoids colliding with Room's existing reliable JSON strings.
// QCCU, version 1, then 0=UTF-8 text / 1=opaque ArrayBuffer.
const FAST_HEADER=new Uint8Array([0x51,0x43,0x43,0x55,1]);
function encodeUnreliable(message:UnreliableMessage):ArrayBuffer{
  const payload=typeof message==='string'?new TextEncoder().encode(message):new Uint8Array(message);
  const frame=new Uint8Array(FAST_HEADER.length+1+payload.length);
  frame.set(FAST_HEADER);frame[FAST_HEADER.length]=typeof message==='string'?0:1;
  frame.set(payload,FAST_HEADER.length+1);return frame.buffer;
}
function decodeUnreliable(data:unknown):UnreliableMessage|undefined{
  if(!(data instanceof ArrayBuffer)||data.byteLength<FAST_HEADER.length+1)return;
  const bytes=new Uint8Array(data);
  if(!FAST_HEADER.every((value,index)=>bytes[index]===value))return;
  const kind=bytes[FAST_HEADER.length],payload=data.slice(FAST_HEADER.length+1);
  if(kind===1)return payload;
  if(kind===0){try{return new TextDecoder('utf-8',{fatal:true}).decode(payload);}catch{/* invalid frame */}}
}
function wrap(conn:DataConnection):Link{
  let channel:RTCDataChannel|undefined,closed=false,attempted=false;
  const listeners:((message:UnreliableMessage)=>void)[]=[];
  const deliver=(message:UnreliableMessage)=>{if(!closed)for(const cb of listeners)cb(message);};
  const setup=()=>{
    if(closed||attempted||!conn.peerConnection)return;
    attempted=true;
    try{
      channel=conn.peerConnection.createDataChannel('qcc-unreliable',{
        negotiated:true,id:UNRELIABLE_CHANNEL_ID,ordered:false,maxRetransmits:0
      });
      channel.binaryType='arraybuffer';
      channel.addEventListener('message',event=>{
        if(typeof event.data==='string'||event.data instanceof ArrayBuffer)deliver(event.data);
      });
      // Losing the optional channel leaves the reliable connection usable.
      channel.addEventListener('error',()=>{});
    }catch{channel=undefined;}
  };
  const cleanup=()=>{if(closed)return;closed=true;listeners.length=0;channel?.close();};
  setup();conn.on('open',setup);conn.on('close',cleanup);
  conn.on('data',data=>{const message=decodeUnreliable(data);if(message!==undefined)deliver(message);});
  return{
    peer:conn.peer,
    send:text=>{if(conn.open)void conn.send(text);},
    close:()=>{cleanup();conn.close();},
    onOpen:cb=>{if(conn.open)queueMicrotask(cb);else conn.on('open',cb);},
    onData:cb=>conn.on('data',data=>{if(typeof data==='string')cb(data);}),
    sendUnreliable:message=>{
      if(closed||!conn.open)return;
      if(channel?.readyState==='open'){
        try{channel.send(message as ArrayBuffer);return;}catch{/* closed between state check and send */}
      }
      void conn.send(encodeUnreliable(message));
    },
    onUnreliable:cb=>{if(!closed)listeners.push(cb);},
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
