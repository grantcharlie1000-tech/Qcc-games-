/**
 * Same-origin proxy for the New Zealand Electoral Commission's public results XML feed.
 * The feed sends no CORS headers and the site's CSP allows only same-origin connections,
 * so the browser asks `/api/election` and this handler fetches, parses and condenses the
 * feed into one JSON bundle. It runs on Cloudflare Pages Functions and in the Vite dev server.
 */
export const FEED_BASE='https://media.election.net.nz/xml';
const FRESH_MS=15_000;
const UPSTREAM_TIMEOUT_MS=8_000;
const CONCURRENCY=12;
const MAX_ELECTORATES=80;
const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'public, max-age=10',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
};
/** The seven Māori electorates. The feed numbers them last, but names are the stable key. */
const MAORI=new Set(['Hauraki-Waikato','Ikaroa-Rāwhiti','Tāmaki Makaurau','Te Tai Hauāuru','Te Tai Tokerau','Te Tai Tonga','Waiariki']);

export interface FeedParty {id:number;abbrev:string;name:string;registered:boolean;votes:number;percent:number;listSeats:number;electorateSeats:number;seats:number}
export interface FeedCandidate {id:number;name:string;party:number;listNo:number;votes:number}
export interface FeedElectorate {
  id:number;name:string;kind:'general'|'maori';final:boolean;updated:string;available:boolean;
  placesCounted:number;placesTotal:number;placesPercent:number;votesCast:number;
  partyInformals:number;candidateInformals:number;
  candidates:FeedCandidate[];partyVotes:{party:number;votes:number}[];
}
export interface ElectionBundle {
  source:string;fetchedAt:string;updated:string;
  stats:{placesCounted:number;placesTotal:number;placesPercent:number;votesCast:number;votesPercent:number;electoratesFinal:number;electoratesPercent:number;specialVotes:number;electors:number};
  parties:FeedParty[];electorates:FeedElectorate[];
  /** Each party's list in rank order (party id → candidates). */
  lists:Record<number,{id:number;name:string;rank:number}[]>;
}
type Fetcher=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;

const ENTITIES:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
export function decode(text:string):string{
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(whole,code:string)=>{
    if(code[0]==='#'){const n=code[1]==='x'||code[1]==='X'?parseInt(code.slice(2),16):Number(code.slice(1));return Number.isInteger(n)&&n>0&&n<0x110000?String.fromCodePoint(n):whole;}
    return ENTITIES[code.toLowerCase()]??whole;
  }).trim();
}
/** Each `<name attr="…">…</name>` element (not nested in itself) with its attributes and inner XML. */
export function elements(xml:string,name:string):{attrs:Record<string,string>;body:string}[]{
  const out:{attrs:Record<string,string>;body:string}[]=[];
  const re=new RegExp(`<${name}((?:\\s+[\\w:-]+="[^"]*")*)\\s*(?:/>|>([\\s\\S]*?)</${name}>)`,'g');
  for(const match of xml.matchAll(re)){
    const attrs:Record<string,string>={};
    for(const attr of (match[1]??'').matchAll(/([\w:-]+)="([^"]*)"/g))attrs[attr[1]]=decode(attr[2]);
    out.push({attrs,body:match[2]??''});
  }
  return out;
}
export const text=(xml:string,name:string)=>{const m=new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);return m?decode(m[1]):'';};
const num=(xml:string,name:string)=>{const n=Number(text(xml,name));return Number.isFinite(n)?n:0;};
const rootAttrs=(xml:string,name:string)=>elements(xml.replace(new RegExp(`</${name}>[\\s\\S]*$`),`</${name}>`),name)[0]?.attrs??{};

export function parseParties(xml:string){
  return elements(xml,'party').map(({attrs,body})=>({id:Number(attrs.p_no),abbrev:text(body,'abbrev'),name:text(body,'short_name')||text(body,'party_name'),registered:text(body,'registered')==='yes'}))
    .filter(p=>Number.isInteger(p.id)&&p.id>0&&p.name);
}
export function parseElectorateNames(xml:string){
  return elements(xml,'electorate').map(({attrs,body})=>({id:Number(attrs.e_no),name:text(body,'electorate_name')}))
    .filter(e=>Number.isInteger(e.id)&&e.id>0&&e.id<=MAX_ELECTORATES&&e.name);
}
export function parseCandidates(xml:string){
  return elements(xml,'candidate').map(({attrs,body})=>({id:Number(attrs.c_no),name:text(body,'candidate_name'),electorate:num(body,'electorate'),party:num(body,'party'),listNo:num(body,'list_no')}))
    .filter(c=>Number.isInteger(c.id)&&c.id>0&&c.name);
}
export function parseElection(xml:string){
  const statistics=elements(xml,'statistics')[0]?.body??'';
  const status=elements(xml,'partystatus')[0]?.body??'';
  return {
    updated:rootAttrs(xml,'election').updated??'',
    placesCounted:num(statistics,'total_voting_places_counted'),placesPercent:num(statistics,'percent_voting_places_counted'),
    votesCast:num(statistics,'total_votes_cast'),votesPercent:num(statistics,'percent_votes_cast'),
    electoratesFinal:num(statistics,'total_electorates_final'),electoratesPercent:num(statistics,'percent_electorates_final'),
    specialVotes:num(statistics,'total_special_votes'),
    parties:elements(status,'party').map(({attrs,body})=>({id:Number(attrs.p_no),votes:num(body,'votes'),percent:num(body,'percent_votes'),listSeats:num(body,'party_seats'),electorateSeats:num(body,'candidate_seats'),seats:num(body,'total_seats')})),
  };
}
export function parseElectorateResult(xml:string){
  const root=rootAttrs(xml,'electorate'),statistics=elements(xml,'statistics')[0]?.body??'';
  const votes=(section:string,tag:string,key:string)=>elements(elements(xml,section)[0]?.body??'',tag).map(({attrs,body})=>({id:Number(attrs[key]),votes:num(body,'votes')})).filter(v=>Number.isInteger(v.id));
  return {
    final:root.final==='true',updated:root.updated??'',
    placesTotal:num(statistics,'total_voting_places'),placesCounted:num(statistics,'total_voting_places_counted'),placesPercent:num(statistics,'percent_voting_places_counted'),
    votesCast:num(statistics,'total_votes_cast'),partyInformals:num(statistics,'total_party_informals'),candidateInformals:num(statistics,'total_candidate_informals'),
    partyVotes:votes('partyvotes','party','p_no').map(v=>({party:v.id,votes:v.votes})),
    candidateVotes:votes('candidatevotes','candidate','c_no'),
  };
}
// The election-wide counted figure is per voting-place result (a place can report for several electorates), so its total is the result count.
export const statistics=(xml:string)=>({electors:num(xml,'total_electors'),places:num(xml,'total_voting_place_results')||num(xml,'total_voting_places')});

async function getText(fetcher:Fetcher,path:string):Promise<string>{
  const response=await fetcher(`${FEED_BASE}/${path}`,{headers:{accept:'application/xml'},signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)});
  if(!response.ok)throw new Error(`${path}: ${response.status}`);
  const body=await response.text();
  if(!/^\s*<\?xml|^\s*</.test(body))throw new Error(`${path}: not XML`);
  return body;
}
async function pool<T,R>(items:T[],limit:number,run:(item:T)=>Promise<R>):Promise<R[]>{
  const out:R[]=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await run(items[i]);}}));
  return out;
}

/** Builds one bundle. `previous` fills in any electorate whose file failed this time. */
export async function buildBundle(fetcher:Fetcher=fetch,previous?:ElectionBundle,now=new Date()):Promise<ElectionBundle>{
  const [electionXml,partiesXml,electoratesXml,candidatesXml,statsXml]=await Promise.all([
    getText(fetcher,'election.xml'),getText(fetcher,'parties.xml'),getText(fetcher,'electorates.xml'),getText(fetcher,'candidates.xml'),
    getText(fetcher,'statistics.xml').catch(()=>''),
  ]);
  const election=parseElection(electionXml),names=parseElectorateNames(electoratesXml),candidates=parseCandidates(candidatesXml);
  const status=new Map(election.parties.map(p=>[p.id,p]));
  const parties:FeedParty[]=parseParties(partiesXml).map(p=>{const s=status.get(p.id);return {...p,votes:s?.votes??0,percent:s?.percent??0,listSeats:s?.listSeats??0,electorateSeats:s?.electorateSeats??0,seats:s?.seats??0};})
    .filter(p=>p.registered||p.votes>0||p.seats>0||candidates.some(c=>c.party===p.id&&c.electorate>0));
  const prior=new Map(previous?.electorates.map(e=>[e.id,e]));
  const electorates=await pool(names,CONCURRENCY,async({id,name}):Promise<FeedElectorate>=>{
    const pad=String(id).padStart(2,'0'),standing=candidates.filter(c=>c.electorate===id);
    const base={id,name,kind:MAORI.has(name)?'maori' as const:'general' as const};
    try{
      const result=parseElectorateResult(await getText(fetcher,`e${pad}/e${pad}.xml`));
      const counted=new Map(result.candidateVotes.map(v=>[v.id,v.votes]));
      return {...base,final:result.final,updated:result.updated,available:true,placesCounted:result.placesCounted,placesTotal:result.placesTotal,placesPercent:result.placesPercent,
        votesCast:result.votesCast,partyInformals:result.partyInformals,candidateInformals:result.candidateInformals,
        candidates:standing.map(c=>({id:c.id,name:c.name,party:c.party,listNo:c.listNo,votes:counted.get(c.id)??0})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name)),
        partyVotes:result.partyVotes.filter(v=>v.votes>0).sort((a,b)=>b.votes-a.votes)};
    }catch{
      const old=prior.get(id);
      if(old)return {...old,...base};
      return {...base,final:false,updated:'',available:false,placesCounted:0,placesTotal:0,placesPercent:0,votesCast:0,partyInformals:0,candidateInformals:0,
        candidates:standing.map(c=>({id:c.id,name:c.name,party:c.party,listNo:c.listNo,votes:0})).sort((a,b)=>a.name.localeCompare(b.name)),partyVotes:[]};
    }
  });
  const extra=statistics(statsXml);
  return {
    source:FEED_BASE,fetchedAt:now.toISOString(),updated:election.updated,
    stats:{placesCounted:election.placesCounted,placesTotal:extra.places,placesPercent:election.placesPercent,votesCast:election.votesCast,votesPercent:election.votesPercent,
      electoratesFinal:election.electoratesFinal,electoratesPercent:election.electoratesPercent,specialVotes:election.specialVotes,electors:extra.electors},
    parties:parties.sort((a,b)=>b.votes-a.votes||b.seats-a.seats||a.name.localeCompare(b.name)),
    electorates,
    lists:Object.fromEntries(parties.filter(p=>p.seats>0).map(p=>[p.id,candidates.filter(c=>c.party===p.id&&c.listNo>0).sort((a,b)=>a.listNo-b.listNo).slice(0,60).map(c=>({id:c.id,name:c.name,rank:c.listNo}))])),
  };
}

/** A per-isolate memo: many visitors refreshing at once share one upstream round. */
export function createElectionHandler(fetcher:Fetcher=fetch,clock:()=>number=Date.now){
  let cached:{at:number;bundle:ElectionBundle}|undefined;
  let inflight:Promise<ElectionBundle>|undefined;
  return async function handle(request:Request):Promise<Response>{
    if(request.method!=='GET'&&request.method!=='HEAD')return Response.json({error:'method not allowed'},{status:405,headers:{...JSON_HEADERS,'cache-control':'no-store',allow:'GET, HEAD'}});
    if(cached&&clock()-cached.at<FRESH_MS)return Response.json(cached.bundle,{headers:JSON_HEADERS});
    try{
      inflight??=buildBundle(fetcher,cached?.bundle,new Date(clock())).finally(()=>{inflight=undefined;});
      const bundle=await inflight;
      cached={at:clock(),bundle};
      return Response.json(bundle,{headers:JSON_HEADERS});
    }catch{
      // A stale bundle beats an error page while the feed hiccups.
      if(cached)return Response.json(cached.bundle,{headers:{...JSON_HEADERS,'cache-control':'no-store','x-qcc-stale':'1'}});
      return Response.json({error:'The Electoral Commission results feed is not answering right now.'},{status:502,headers:{...JSON_HEADERS,'cache-control':'no-store'}});
    }
  };
}
