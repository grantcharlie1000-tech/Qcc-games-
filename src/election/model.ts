import type {ElectionBundle,FeedCandidate,FeedElectorate,FeedParty} from '../../server/election-feed';
export type {ElectionBundle,FeedCandidate,FeedElectorate,FeedParty};

/** Party identity colours. They identify parties, so they follow each party's own colour where it reads on black; others take a neutral ramp. */
const COLOURS:Record<string,string>={
  NAT:'#1f6fd6',LAB:'#d42a25',GP:'#2fb35a',ACT:'#f2c200',NZF:'#a1a1aa',TPMAO:'#c2306f',OPP:'#14b8a6',
  ALCP:'#65a30d',NC:'#4f46e5',OFP:'#b45309',NLY:'#7c3aed',VNZ:'#0ea5e9',AJP:'#f97316',FPT:'#16a34a',TTTP:'#be123c',APN:'#9f1239',WRP:'#a855f7',
};
const SPARE=['#94a3b8','#a8a29e','#cbd5e1','#78716c','#64748b'];
export const INDEPENDENT={id:0,abbrev:'IND',name:'Independent',colour:'#71717b'};
export function partyColour(party:{id:number;abbrev:string}|undefined):string{
  if(!party||party.id===0)return INDEPENDENT.colour;
  return COLOURS[party.abbrev]??SPARE[party.id%SPARE.length];
}
/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex:string):number{
  const n=parseInt(hex.slice(1),16),lin=(c:number)=>{const v=c/255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};
  return 0.2126*lin(n>>16)+0.7152*lin(n>>8&255)+0.0722*lin(n&255);
}
export const contrast=(a:string,b:string)=>{const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
/** Text that reads on the party colour: white unless near-black reads better. */
export const inkOn=(hex:string)=>contrast(hex,'#ffffff')>=contrast(hex,'#09090b')?'#ffffff':'#09090b';

export interface Lead {electorate:FeedElectorate;leader?:FeedCandidate;runnerUp?:FeedCandidate;margin:number;marginPercent:number;share:number}
export function lead(electorate:FeedElectorate):Lead{
  const [leader,runnerUp]=electorate.candidates;
  const total=electorate.candidates.reduce((sum,c)=>sum+c.votes,0);
  if(!leader||leader.votes<=0)return {electorate,margin:0,marginPercent:0,share:0};
  const margin=leader.votes-(runnerUp?.votes??0);
  return {electorate,leader,runnerUp,margin,marginPercent:total?margin/total*100:0,share:total?leader.votes/total*100:0};
}
export const counting=(bundle:ElectionBundle)=>bundle.stats.placesCounted>0||bundle.stats.votesCast>0;
export const totalSeats=(bundle:ElectionBundle)=>bundle.parties.reduce((sum,p)=>sum+p.seats,0);
/** A majority of the House as it currently stands, overhang included. */
export const majority=(seats:number)=>Math.floor(seats/2)+1;

/** Display names: the feed writes candidates as "SURNAME, Given". */
export function candidateName(raw:string):string{
  const [surname,given]=raw.split(/,\s*/,2);
  if(!given)return raw;
  const title=surname.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu,(_,sep:string,ch:string)=>sep+ch.toUpperCase()).replace(/\bMc(\p{L})/gu,(_,ch:string)=>'Mc'+ch.toUpperCase());
  return `${given} ${title}`;
}

export type SortKey='name'|'margin'|'counted'|'votes';
export type CountStatus='all'|'counting'|'complete'|'none';
export interface ElectorateFilter {query:string;kind:'all'|'general'|'maori';party:number|'all';status:CountStatus;close:boolean;sort:SortKey}
export const countStatus=(e:FeedElectorate):Exclude<CountStatus,'all'>=>e.final||e.placesTotal>0&&e.placesCounted>=e.placesTotal?'complete':e.placesCounted>0||e.votesCast>0?'counting':'none';
export function filterElectorates(bundle:ElectionBundle,filter:ElectorateFilter):Lead[]{
  const q=filter.query.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu,'');
  const fold=(s:string)=>s.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'');
  const rows=bundle.electorates.map(lead).filter(row=>{
    const e=row.electorate;
    if(filter.kind!=='all'&&e.kind!==filter.kind)return false;
    if(filter.party!=='all'&&row.leader?.party!==filter.party)return false;
    if(filter.status!=='all'&&countStatus(e)!==filter.status)return false;
    if(filter.close&&!(row.leader&&row.marginPercent<5))return false;
    if(q&&!fold(e.name).includes(q)&&!e.candidates.some(c=>fold(c.name).includes(q)))return false;
    return true;
  });
  const by:Record<SortKey,(a:Lead,b:Lead)=>number>={
    name:(a,b)=>a.electorate.name.localeCompare(b.electorate.name),
    margin:(a,b)=>(a.leader?a.marginPercent:Infinity)-(b.leader?b.marginPercent:Infinity),
    counted:(a,b)=>b.electorate.placesPercent-a.electorate.placesPercent,
    votes:(a,b)=>b.electorate.votesCast-a.electorate.votesCast,
  };
  return rows.sort((a,b)=>by[filter.sort](a,b)||a.electorate.name.localeCompare(b.electorate.name));
}

/** Seats won in electorates (leading candidates), per party: what the seat tiles show before the official seat allocation. */
export function electorateLeads(bundle:ElectionBundle):Map<number,number>{
  const out=new Map<number,number>();
  for(const e of bundle.electorates){const l=lead(e).leader;if(l)out.set(l.party,(out.get(l.party)??0)+1);}
  return out;
}

/** Trend history: one point per distinct feed update, kept on this device. */
export interface TrendPoint {at:string;counted:number;shares:Record<string,number>}
export function addTrendPoint(history:TrendPoint[],bundle:ElectionBundle,limit=240):TrendPoint[]{
  if(!counting(bundle)||!bundle.updated)return history;
  if(history.some(p=>p.at===bundle.updated))return history;
  const shares:Record<string,number>={};
  for(const p of bundle.parties)if(p.percent>=0.5)shares[p.id]=p.percent;
  return [...history,{at:bundle.updated,counted:bundle.stats.placesPercent,shares}].sort((a,b)=>a.at.localeCompare(b.at)).slice(-limit);
}
export function validTrend(value:unknown):TrendPoint[]{
  if(!Array.isArray(value))return [];
  return value.filter((p):p is TrendPoint=>!!p&&typeof p==='object'&&typeof p.at==='string'&&typeof p.counted==='number'&&!!p.shares&&typeof p.shares==='object'
    &&Object.values(p.shares).every(v=>typeof v==='number'&&Number.isFinite(v)));
}

/** Hemicycle seat positions: rows of seats on concentric arcs, filled left to right by angle. */
export function hemicycle(seats:number,width=360,height=190):{x:number;y:number;r:number}[]{
  if(seats<=0)return [];
  const cx=width/2,cy=height-6,outer=Math.min(width/2,height)-6;
  const rows=Math.min(seats,Math.max(3,Math.round(Math.sqrt(seats/2.2))));
  const inner=outer*0.38,step=(outer-inner)/rows;
  const radii=Array.from({length:rows},(_,i)=>inner+step*(i+0.5));
  const total=radii.reduce((s,r)=>s+r,0);
  const counts=radii.map(r=>Math.max(1,Math.round(seats*r/total)));
  let diff=seats-counts.reduce((s,n)=>s+n,0);
  for(let i=counts.length-1;diff!==0;i=(i-1+counts.length)%counts.length){const d=Math.sign(diff);if(counts[i]+d>=1){counts[i]+=d;diff-=d;}}
  const points:{x:number;y:number;r:number;angle:number}[]=[];
  const dot=Math.min(step*0.42,outer*Math.PI/(Math.max(...counts)*2.3));
  radii.forEach((radius,row)=>{
    const n=counts[row];
    for(let i=0;i<n;i++){const angle=Math.PI-(n===1?Math.PI/2:Math.PI*i/(n-1));points.push({x:cx+radius*Math.cos(angle),y:cy-radius*Math.sin(angle),r:dot,angle});}
  });
  return points.sort((a,b)=>b.angle-a.angle||a.y-b.y).map(({x,y,r})=>({x,y,r}));
}

export const formatInt=(n:number)=>Math.round(n).toLocaleString('en-NZ');
export const formatPct=(n:number,digits=1)=>`${n.toFixed(digits)}%`;
/** The feed's `updated` is New Zealand local time without an offset. */
export function feedTime(updated:string):string{
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(updated);
  if(!m)return '';
  const hour=Number(m[4]),h12=hour%12||12;
  return `${h12}:${m[5]} ${hour<12?'am':'pm'} NZ time`;
}

/** Conventional blocs for the chamber. Parties outside them count as unaligned. */
export const BLOCS={left:['LAB','GP','TPMAO'],right:['NAT','ACT','NZF']} as const;
export type Bloc='left'|'right'|'other';
export const blocOf=(abbrev:string):Bloc=>(BLOCS.left as readonly string[]).includes(abbrev)?'left':(BLOCS.right as readonly string[]).includes(abbrev)?'right':'other';
export function blocSeats(bundle:ElectionBundle){
  const out={left:0,right:0,other:0};
  for(const p of bundle.parties)out[blocOf(p.abbrev)]+=p.seats;
  return out;
}
const listNames=(names:string[])=>names.length<2?names.join(''):`${names.slice(0,-1).join(', ')} and ${names[names.length-1]}`;
const shortName=(p:FeedParty)=>({LAB:'Labour',NAT:'National',GP:'the Greens',ACT:'ACT',NZF:'NZ First',TPMAO:'Te Pāti Māori',OPP:'TOP'} as Record<string,string>)[p.abbrev]??p.name;
/** One sentence that says where the count stands. */
export function headline(bundle:ElectionBundle):string{
  const seats=totalSeats(bundle);
  if(!counting(bundle)||!seats)return 'Results appear here as the Electoral Commission releases them.';
  const need=majority(seats),blocs=blocSeats(bundle),pct=formatPct(bundle.stats.placesPercent);
  const side=(bloc:'left'|'right')=>bundle.parties.filter(p=>blocOf(p.abbrev)===bloc&&p.seats>0).sort((a,b)=>b.seats-a.seats);
  for(const bloc of ['right','left'] as const){
    const n=blocs[bloc];if(n<need)continue;
    const names=side(bloc).map(shortName),by=n-need+1;
    return `${listNames(names).replace(/^the/,'The')} reach ${n} of ${seats} seats with ${pct} of voting places counted: a majority of ${by===1?'one':by}.`;
  }
  const lead=blocs.left===blocs.right?undefined:blocs.left>blocs.right?'left':'right';
  if(!lead)return `Left and right are tied on ${blocs.left} seats each with ${pct} counted. Neither reaches ${need}.`;
  const names=listNames(side(lead).map(shortName)).replace(/^the/,'The');
  return `${names} lead with ${blocs[lead]} of ${seats} seats, ${need-blocs[lead]} short of a majority, with ${pct} counted.`;
}

/** Who is in: each seated party's electorate leaders, then its list in rank order, skipping list candidates already in on an electorate. */
export interface PartyMembers {party:FeedParty;electorate:{name:string;seat:string}[];list:{name:string;rank:number}[];next?:{name:string;rank:number}}
export function whoIsIn(bundle:ElectionBundle):PartyMembers[]{
  const leaders=new Map<number,string>();
  for(const e of bundle.electorates){const l=lead(e).leader;if(l)leaders.set(l.id,e.name);}
  const byParty=new Map<number,FeedCandidate[]>();
  for(const e of bundle.electorates)for(const c of e.candidates){if(!byParty.has(c.party))byParty.set(c.party,[]);byParty.get(c.party)!.push(c);}
  return bundle.parties.filter(p=>p.seats>0).sort((a,b)=>b.seats-a.seats).map(party=>{
    const all=bundle.lists?.[party.id]??[],electorate=(byParty.get(party.id)??[]).filter(c=>leaders.has(c.id)).map(c=>({name:candidateName(c.name),seat:leaders.get(c.id)!})).sort((a,b)=>a.seat.localeCompare(b.seat));
    const won=new Set((byParty.get(party.id)??[]).filter(c=>leaders.has(c.id)).map(c=>c.id));
    const ranked=all.filter(c=>!won.has(c.id)).sort((a,b)=>a.rank-b.rank);
    const list=ranked.slice(0,party.listSeats).map(c=>({name:candidateName(c.name),rank:c.rank}));
    const n=ranked[party.listSeats];
    return {party,electorate,list,next:n&&{name:candidateName(n.name),rank:n.rank}};
  });
}

/** Events between two bundles: lead changes, electorates that finish, and counting milestones. */
export interface FeedEvent {at:string;kind:'lead'|'final'|'milestone';text:string;electorate?:number}
export function diffEvents(before:ElectionBundle|undefined,after:ElectionBundle,partyAbbrev:(id:number)=>string):FeedEvent[]{
  if(!before||before.updated===after.updated)return [];
  const out:FeedEvent[]=[],at=after.updated,old=new Map(before.electorates.map(e=>[e.id,e]));
  for(const e of after.electorates){
    const prev=old.get(e.id);if(!prev)continue;
    const a=lead(prev).leader,b=lead(e).leader;
    if(b&&a&&a.id!==b.id)out.push({at,kind:'lead',electorate:e.id,text:`${candidateName(b.name)} (${partyAbbrev(b.party)}) takes the lead in ${e.name} from ${candidateName(a.name)} (${partyAbbrev(a.party)}).`});
    else if(b&&!a)out.push({at,kind:'lead',electorate:e.id,text:`First votes in ${e.name}: ${candidateName(b.name)} (${partyAbbrev(b.party)}) leads.`});
    if(e.final&&!prev.final)out.push({at,kind:'final',electorate:e.id,text:`${e.name} is fully counted. ${b?`${candidateName(b.name)} (${partyAbbrev(b.party)}) wins on election-night votes.`:''}`});
  }
  for(const mark of [25,50,75,90,100]){
    if(before.stats.placesPercent<mark&&after.stats.placesPercent>=mark)out.push({at,kind:'milestone',text:mark===100?'Every voting place is in. The preliminary count is complete.':`${mark}% of voting places counted.`});
  }
  return out;
}

/** Short, unique tile labels: curated codes for look-alike names, else initials for multi-word names (EC, ECB, HE) or the first letters, lengthened until unique. */
const TILE_CODES:Record<string,string>={
  Northcote:'Ncte',Northland:'Nthl',Rangitata:'Rgta','Rangitīkei':'Rgtk',Whanganui:'Wnui','Whangaparāoa':'Wpar','Whangārei':'Wrei',
  'Waitākere':'Wtkr',Waitaki:'Wtki','Te Tai Tokerau':'TTok','Te Tai Tonga':'TTon','Te Tai Hauāuru':'THau','Hamilton West':'HW','Hauraki-Waikato':'HWk',
};
export function tileCodes(electorates:{id:number;name:string}[]):Map<number,string>{
  const words=(name:string)=>name.split(/[\s-]+/).filter(Boolean);
  const code=(name:string,extra:number)=>{
    if(TILE_CODES[name]&&!extra)return TILE_CODES[name];
    const w=words(name);
    if(w.length===1)return w[0].slice(0,3+extra);
    return w.slice(0,-1).map(x=>x[0]).join('')+w[w.length-1].slice(0,1+extra);
  };
  const out=new Map<number,string>();
  const extra=new Map(electorates.map(e=>[e.id,0]));
  for(let round=0;round<6;round++){
    const seen=new Map<string,number[]>();
    for(const e of electorates){const c=code(e.name,extra.get(e.id)!);out.set(e.id,c);seen.set(c,[...(seen.get(c)??[]),e.id]);}
    const clashes=[...seen.values()].filter(ids=>ids.length>1);
    if(!clashes.length)break;
    for(const ids of clashes)for(const id of ids)extra.set(id,extra.get(id)!+1);
  }
  return out;
}
