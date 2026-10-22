// Wire format shared by every online game. Peers exchange JSON text over a reliable, ordered WebRTC data channel.
// PeerJS's own JSON channel refuses messages over ~16 KB, so large messages (Blockcraft world snapshots) are split here.
export const PROTOCOL_VERSION=1;
/** Room codes avoid look-alike characters (no I, L, O, 0, 1). */
export const CODE_ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH=6;
const CODE_PATTERN=new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
/** Text frames above this size are split into parts (the PeerJS data channel MTU is 16 300 bytes; UTF-8 can triple). */
export const PART_CHARS=5000;
/** Largest message a peer accepts after reassembly (a Blockcraft world with every edit is well under this). */
export const MAX_MESSAGE_CHARS=24_000_000;

export function randomCode(random:()=>number=secureRandom):string{
  let code='';for(let i=0;i<CODE_LENGTH;i++)code+=CODE_ALPHABET[Math.floor(random()*CODE_ALPHABET.length)%CODE_ALPHABET.length];
  return code;
}
function secureRandom(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/2**32;}
/** Upper-cases and strips spaces and dashes; null when it cannot be a code. */
export function normalizeCode(input:string):string|null{
  const code=input.toUpperCase().replace(/[\s-]/g,'');
  return CODE_PATTERN.test(code)?code:null;
}
/** The PeerJS ID the host registers. The game is part of it, so a Pool code never reaches a Blockcraft room. */
export const hostPeerId=(game:string,code:string)=>`qcc-games-v${PROTOCOL_VERSION}-${game}-${code.toLowerCase()}`;

/** 1–16 printable characters without angle brackets; null when nothing usable remains. */
export function cleanName(input:unknown):string|null{
  if(typeof input!=='string')return null;
  // eslint-disable-next-line no-control-regex
  const name=input.replace(/[\u0000-\u001f\u007f<>]/g,'').replace(/\s+/g,' ').trim().slice(0,16);
  return name.length?name:null;
}

export type RejectReason='full'|'version'|'game'|'closing'|'name'|'protocol';
export interface RosterEntry{id:string;seat:number;name:string;host:boolean}
/** Room-level messages; game payloads travel inside {t:'game'}. */
export type Envelope=
  |{t:'hello';protocol:number;game:string;version:string;name:string}
  |{t:'welcome';seat:number;you:string;players:RosterEntry[];paused:boolean}
  |{t:'reject';reason:RejectReason;message:string}
  |{t:'roster';players:RosterEntry[]}
  |{t:'pause';paused:boolean}
  |{t:'ping';at:number}
  |{t:'pong';at:number}
  |{t:'bye';reason:string}
  |{t:'game';d:unknown};

const TYPES=new Set(['hello','welcome','reject','roster','pause','ping','pong','bye','game']);
export function parseEnvelope(value:unknown):Envelope|null{
  if(!value||typeof value!=='object')return null;
  const v=value as Record<string,unknown>;
  if(typeof v.t!=='string'||!TYPES.has(v.t))return null;
  switch(v.t){
    case 'hello':return Number.isInteger(v.protocol)&&typeof v.game==='string'&&typeof v.version==='string'&&typeof v.name==='string'&&v.version.length<=64&&v.game.length<=32?v as Envelope:null;
    case 'welcome':return Number.isInteger(v.seat)&&typeof v.you==='string'&&Array.isArray(v.players)&&typeof v.paused==='boolean'&&v.players.every(validRoster)?v as Envelope:null;
    case 'roster':return Array.isArray(v.players)&&v.players.length<=16&&v.players.every(validRoster)?v as Envelope:null;
    case 'reject':return typeof v.reason==='string'&&typeof v.message==='string'?v as Envelope:null;
    case 'pause':return typeof v.paused==='boolean'?v as Envelope:null;
    case 'ping':case 'pong':return typeof v.at==='number'&&Number.isFinite(v.at)?v as Envelope:null;
    case 'bye':return typeof v.reason==='string'?v as Envelope:null;
    case 'game':return 'd' in v?v as Envelope:null;
  }
  return null;
}
function validRoster(p:unknown):boolean{
  if(!p||typeof p!=='object')return false;
  const r=p as Record<string,unknown>;
  return typeof r.id==='string'&&Number.isInteger(r.seat)&&typeof r.name==='string'&&r.name.length<=16&&typeof r.host==='boolean';
}

/** Splits one message into frames of at most PART_CHARS characters. */
export function frame(message:unknown,nextId:()=>number):string[]{
  const text=JSON.stringify(message);
  if(text.length<=PART_CHARS)return [text];
  const id=nextId(),total=Math.ceil(text.length/PART_CHARS),out:string[]=[];
  for(let n=0;n<total;n++)out.push(JSON.stringify({p:id,n,of:total,s:text.slice(n*PART_CHARS,(n+1)*PART_CHARS)}));
  return out;
}
/** Reassembles frames from one peer (ordered channel). Returns parsed messages; throws on malformed input. */
export class Reassembler{
  private parts:string[]=[];private id=-1;private size=0;
  push(text:string):unknown|undefined{
    if(typeof text!=='string'||text.length>PART_CHARS*3+200)throw new Error('frame too large');
    const value=JSON.parse(text) as Record<string,unknown>;
    if(value&&typeof value==='object'&&typeof value.p==='number'&&!('t' in value)){
      const {p,n,of,s}=value as {p:number;n:number;of:number;s:string};
      if(!Number.isInteger(n)||!Number.isInteger(of)||of<2||of*PART_CHARS>MAX_MESSAGE_CHARS||typeof s!=='string')throw new Error('bad part');
      if(n===0){this.parts=[];this.id=p;this.size=0;}
      if(p!==this.id||n!==this.parts.length)throw new Error('part out of order');
      this.parts.push(s);this.size+=s.length;
      if(this.size>MAX_MESSAGE_CHARS)throw new Error('message too large');
      if(this.parts.length<of)return undefined;
      const whole=this.parts.join('');this.parts=[];this.id=-1;this.size=0;
      return JSON.parse(whole);
    }
    return value;
  }
}
