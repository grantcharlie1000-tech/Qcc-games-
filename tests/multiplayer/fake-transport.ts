import type {Endpoint,EndpointFactory,Link,TransportError} from '../../src/multiplayer/transport';

/** An in-memory signalling network: ordered, asynchronous delivery like a reliable data channel. */
export class FakeNetwork{
  endpoints=new Map<string,FakeEndpoint>();
  private next=0;
  links:FakeLink[]=[];
  factory:EndpointFactory=async id=>{
    const name=id??`peer-${++this.next}`;
    if(this.endpoints.has(name))throw {type:'unavailable-id',message:'taken'} satisfies TransportError;
    const e=new FakeEndpoint(name,this);this.endpoints.set(name,e);return e;
  };
}
type Fn<T=void>=(v:T)=>void;
export class FakeLink implements Link{
  other!:FakeLink;open=false;closed=false;sent:string[]=[];
  private openCb:Fn[]=[];private dataCb:Fn<string>[]=[];private closeCb:Fn[]=[];private errorCb:Fn<TransportError>[]=[];
  constructor(readonly peer:string){}
  send(text:string){if(!this.open||this.closed)return;this.sent.push(text);const o=this.other;setTimeout(()=>{if(!o.closed)for(const cb of o.dataCb)cb(text);},0);}
  close(){if(this.closed)return;this.closed=true;for(const cb of this.closeCb)cb();setTimeout(()=>this.other.close(),0);}
  onOpen(cb:Fn){if(this.open)queueMicrotask(cb);else this.openCb.push(cb);}
  onData(cb:Fn<string>){this.dataCb.push(cb);}
  onClose(cb:Fn){this.closeCb.push(cb);}
  onError(cb:Fn<TransportError>){this.errorCb.push(cb);}
  async kind(){return 'direct' as const;}
  fireOpen(){this.open=true;for(const cb of this.openCb)cb();}
}
export class FakeEndpoint implements Endpoint{
  private linkCb:Fn<Link>[]=[];private errorCb:Fn<TransportError>[]=[];destroyed=false;
  constructor(readonly id:string,private net:FakeNetwork){}
  onLink(cb:Fn<Link>){this.linkCb.push(cb);}
  onError(cb:Fn<TransportError>){this.errorCb.push(cb);}
  onDisconnected(){}
  reconnect(){}
  connect(peer:string):Link{
    const mine=new FakeLink(peer),theirs=new FakeLink(this.id);mine.other=theirs;theirs.other=mine;this.net.links.push(mine,theirs);
    setTimeout(()=>{
      const target=this.net.endpoints.get(peer);
      if(!target||target.destroyed){for(const cb of this.errorCb)cb({type:'peer-unavailable',message:'no peer'});return;}
      for(const cb of target.linkCb)cb(theirs);
      mine.fireOpen();theirs.fireOpen();
    },0);
    return mine;
  }
  destroy(){this.destroyed=true;this.net.endpoints.delete(this.id);}
}
export const noIce=async()=>({iceServers:[],turn:false,message:'test'});
