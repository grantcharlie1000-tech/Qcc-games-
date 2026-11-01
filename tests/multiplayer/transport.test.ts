import {beforeEach, describe, expect, it, vi} from 'vitest';
import {peerEndpoint, type Link} from '../../src/multiplayer/transport';

// Signaling is outside this test's boundary. The paired connections below deliver
// real Link sends to the opposite Link, without a network or browser RTC stack.
vi.mock('peerjs', () => ({Peer: FakePeer}));
class Events {
  handlers = new Map<string, ((...args:any[])=>void)[]>();
  on(event:string, cb:(...args:any[])=>void) { this.handlers.set(event,[...(this.handlers.get(event)??[]),cb]); }
  emit(event:string, ...args:any[]) { for (const cb of this.handlers.get(event)??[]) cb(...args); }
}
class FakeChannel extends EventTarget {
  readyState:RTCDataChannelState = 'connecting';
  binaryType = 'blob';
  other?:FakeChannel;
  failSend = false;
  send(data:string|ArrayBuffer) {
    if(this.failSend)throw new Error('closed during send');
    if(this.readyState!=='open')throw new Error('not open');
    this.other?.dispatchEvent(new MessageEvent('message',{data}));
  }
  close() { this.readyState='closed';this.dispatchEvent(new Event('close')); }
}
class FakePC {
  channel?:FakeChannel;
  other?:FakePC;
  options?:RTCDataChannelInit;
  createDataChannel(_label:string, options:RTCDataChannelInit) {
    if(unsupported)throw new Error('unsupported');
    this.options=options;
    this.channel=new FakeChannel();
    if(this.other?.channel){this.channel.other=this.other.channel;this.other.channel.other=this.channel;}
    return this.channel;
  }
}
class FakeConnection extends Events {
  open=false;
  other!:FakeConnection;
  peerConnection:FakePC|null=null;
  constructor(readonly peer:string){super();}
  send(data:unknown) { if(this.open)this.other.emit('data',data); }
  close() { this.open=false;this.emit('close'); }
}
let unsupported=false,latePC=false;
const peers=new Map<string,FakePeer>();
let connections:FakeConnection[]=[];
class FakePeer extends Events {
  destroyed=false;
  disconnected=false;
  constructor(readonly id:string){super();peers.set(id,this);queueMicrotask(()=>this.emit('open',id));}
  connect(id:string) {
    const a=new FakeConnection(id),b=new FakeConnection(this.id);
    a.other=b;b.other=a;
    const x=new FakePC(),y=new FakePC();x.other=y;y.other=x;
    if(!latePC){a.peerConnection=x;b.peerConnection=y;}
    connections=[a,b];
    queueMicrotask(()=>{
      peers.get(id)!.emit('connection',b);
      a.peerConnection=x;b.peerConnection=y;
      a.open=b.open=true;a.emit('open');b.emit('open');
    });
    return a;
  }
  reconnect() {}
  destroy() {this.destroyed=true;}
}
async function pair():Promise<[Link,Link]> {
  const ice={iceServers:[],relayOnly:false};
  // Vitest's lazy-import mock registration races concurrent imports. Signaling
  // setup is sequential; data delivery below remains bidirectional.
  const a=await peerEndpoint('a',ice),b=await peerEndpoint('b',ice);
  const incoming=new Promise<Link>(resolve=>b.onLink(resolve));
  const out=a.connect('b');
  return [out,await incoming];
}
function openChannels(){for(const conn of connections)if(conn.peerConnection?.channel)conn.peerConnection.channel.readyState='open';}
beforeEach(()=>{peers.clear();connections=[];unsupported=false;latePC=false;});

describe('optional unreliable PeerJS Link',()=>{
  it('negotiates the same unordered, zero-retransmit channel on both peers',async()=>{
    const [a,b]=await pair();
    expect(a.sendUnreliable).toBeTypeOf('function');expect(b.onUnreliable).toBeTypeOf('function');
    for(const conn of connections){
      expect(conn.peerConnection?.options).toEqual({negotiated:true,id:7,ordered:false,maxRetransmits:0});
      expect(conn.peerConnection?.channel?.binaryType).toBe('arraybuffer');
    }
  });
  it('delivers text and ArrayBuffers in both directions on an open channel',async()=>{
    const [a,b]=await pair();openChannels();
    const left:unknown[]=[],right:unknown[]=[];
    a.onUnreliable?.(m=>left.push(m));b.onUnreliable?.(m=>right.push(m));
    const bytes=new Uint8Array([0,255,3]).buffer;
    a.sendUnreliable?.(bytes);b.sendUnreliable?.('position');
    expect(right).toEqual([bytes]);expect(left).toEqual(['position']);
  });
  it.each(['connecting','closed','unsupported','send-error','late-pc'] as const)('falls back reliably for %s and keeps reliable listeners separate',async state=>{
    unsupported=state==='unsupported';latePC=state==='late-pc';
    const [a,b]=await pair();
    if(state==='closed')connections[0].peerConnection?.channel?.close();
    if(state==='send-error'){openChannels();connections[0].peerConnection!.channel!.failSend=true;}
    const regular:string[]=[],fast:unknown[]=[];
    b.onData(m=>regular.push(m));b.onUnreliable?.(m=>fast.push(m));
    const bytes=new Uint8Array([10,0,9,255]).buffer;
    a.sendUnreliable?.('héllo');a.sendUnreliable?.(bytes);a.send('room control');
    expect(regular).toEqual(['room control']);expect(fast).toEqual(['héllo',bytes]);
    if(state==='late-pc')for(const conn of connections)expect(conn.peerConnection?.options?.id).toBe(7);
  });
  it('never routes ordinary reliable traffic or malformed binary frames to fast listeners',async()=>{
    const [a,b]=await pair();const fast:unknown[]=[],regular:string[]=[];
    b.onUnreliable?.(m=>fast.push(m));b.onData(m=>regular.push(m));
    a.send('{"room":"hello"}');
    connections[0].send(new Uint8Array([1,2,3]).buffer);
    connections[0].send({unexpected:true});
    expect(fast).toEqual([]);expect(regular).toEqual(['{"room":"hello"}']);
  });
  it('closes the second channel when the Link or underlying connection closes',async()=>{
    const [a]=await pair();openChannels();a.close();connections[1].close();
    expect(connections.map(c=>c.peerConnection?.channel?.readyState)).toEqual(['closed','closed']);
  });
  it('does not send unreliable data after the Link closes',async()=>{
    const [a,b]=await pair();openChannels();const got:unknown[]=[];b.onUnreliable?.(m=>got.push(m));
    a.close();a.sendUnreliable?.('stale');expect(got).toEqual([]);
  });
});
