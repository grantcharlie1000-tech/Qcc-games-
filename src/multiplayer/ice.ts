// ICE servers for a room: STUN always, plus short-lived Cloudflare TURN credentials from our Netlify Function when it is
// configured. Without them, PeerJS's free public relay is used instead (best effort, shared and rate-limited), because
// many networks (school and guest Wi-Fi with client isolation, mobile data against Wi-Fi) never allow a direct path.
export const TURN_ENDPOINT='/.netlify/functions/turn';
export const STUN_SERVERS:RTCIceServer[]=[{urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302']}];
/** The relay PeerJS Cloud itself offers by default (its built-in configuration), used when Cloudflare TURN is not set up. */
export const PUBLIC_RELAY:RTCIceServer[]=[{urls:['turn:eu-0.turn.peerjs.com:3478','turn:us-0.turn.peerjs.com:3478'],username:'peerjs',credential:'peerjsp'}];
/** turn: some relay is available; publicRelay: only the free public one (best effort). */
export interface IceResult{iceServers:RTCIceServer[];turn:boolean;publicRelay?:boolean;message:string}

let cached:{servers:RTCIceServer[];expires:number}|null=null;
export function resetIceCache(){cached=null;}

export function validIceServers(value:unknown):RTCIceServer[]|null{
  const list=Array.isArray(value)?value:value&&typeof value==='object'?[value]:null;
  if(!list||!list.length||list.length>8)return null;
  const out:RTCIceServer[]=[];
  for(const s of list){
    if(!s||typeof s!=='object')return null;
    const {urls,username,credential}=s as Record<string,unknown>;
    const all=(Array.isArray(urls)?urls:[urls]).filter((u):u is string=>typeof u==='string'&&/^(stun|turns?):[^\s]{3,200}$/.test(u));
    if(!all.length)return null;
    const server:RTCIceServer={urls:all};
    if(typeof username==='string')server.username=username;
    if(typeof credential==='string')server.credential=credential;
    out.push(server);
  }
  return out;
}

/** Never throws: falls back to STUN only with an explanation. */
export async function iceServers(fetcher:typeof fetch=globalThis.fetch.bind(globalThis),now=Date.now()):Promise<IceResult>{
  if(cached&&cached.expires>now)return{iceServers:[...STUN_SERVERS,...cached.servers],turn:true,message:'TURN relay fallback ready.'};
  try{
    const response=await fetcher(TURN_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(response.status===429)return stunOnly('Too many relay requests from this network.');
    if(!response.ok)return stunOnly('The private relay is not configured here.');
    const body=await response.json() as {iceServers?:unknown;ttl?:unknown};
    const servers=validIceServers(body.iceServers)?.filter(s=>[s.urls].flat().some(u=>u.startsWith('turn')));
    if(!servers?.length)return stunOnly('The private relay gave no usable servers.');
    const ttl=typeof body.ttl==='number'&&body.ttl>120?body.ttl:600;
    cached={servers,expires:now+(ttl-60)*1000};
    return{iceServers:[...STUN_SERVERS,...servers],turn:true,message:'TURN relay fallback ready.'};
  }catch{return stunOnly('The private relay could not be reached.');}
}
const stunOnly=(message:string):IceResult=>({iceServers:[...STUN_SERVERS,...PUBLIC_RELAY],turn:true,publicRelay:true,message:`${message} If a direct connection is blocked, the free public relay is tried (best effort).`});
