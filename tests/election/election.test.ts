import {describe,expect,it} from 'vitest';
import {buildBundle,createElectionHandler,decode,parseCandidates,parseElection,parseElectorateResult,parseParties,type ElectionBundle} from '../../server/election-feed';
import {addTrendPoint,contrast,inkOn,partyColour,candidateName,diffEvents,filterElectorates,headline,hemicycle,lead,majority,tileCodes,whoIsIn} from '../../src/election/model';

// The 2026 electorate names exactly as the Electoral Commission feed lists them.
const NAMES:string[]=["Auckland Central", "Banks Peninsula", "Botany", "Christchurch Central", "Christchurch East", "Coromandel", "Dunedin", "East Cape", "East Coast Bays", "Epsom", "Glendene", "Hamilton East", "Hamilton West", "Henderson", "Hutt South", "Ilam", "Invercargill", "Kaikōura", "Kaipara ki Mahurangi", "Kapiti", "Kenepuru", "Māngere", "Manurewa", "Maungakiekie", "Mt Albert", "Mt Maunganui", "Mt Roskill", "Napier", "Nelson", "New Plymouth", "North Shore", "Northcote", "Northland", "Ōtāhuhu", "Pakuranga", "Palmerston North", "Papakura", "Port Waikato", "Rangitata", "Rangitīkei", "Remutaka", "Rotorua", "Selwyn", "Southland", "Taieri", "Takanini", "Tāmaki", "Taranaki-King Country", "Taupō", "Tauranga", "Tukituki", "Upper Harbour", "Waikato", "Waimakariri", "Wairarapa", "Waitākere", "Waitaki", "Wellington Bays", "Wellington North", "West Coast-Tasman", "Whanganui", "Whangaparāoa", "Whangārei", "Wigram", "Hauraki-Waikato", "Ikaroa-Rāwhiti", "Tāmaki Makaurau", "Te Tai Hauāuru", "Te Tai Tokerau", "Te Tai Tonga", "Waiariki"];

const xml={
  'election.xml':`<?xml version="1.0" encoding="UTF-8"?><election updated="2026-11-07T20:30:00"><statistics><total_voting_places_counted>10</total_voting_places_counted><percent_voting_places_counted>50.0</percent_voting_places_counted><total_votes_cast>300</total_votes_cast><percent_votes_cast>30.0</percent_votes_cast><total_electorates_final>0</total_electorates_final><percent_electorates_final>0.00</percent_electorates_final><total_special_votes>12</total_special_votes></statistics><partystatus>
    <party p_no="16"><votes>160</votes><percent_votes>53.33</percent_votes><party_seats>1</party_seats><candidate_seats>1</candidate_seats><total_seats>2</total_seats></party>
    <party p_no="13"><votes>140</votes><percent_votes>46.67</percent_votes><party_seats>2</party_seats><candidate_seats>0</candidate_seats><total_seats>2</total_seats></party></partystatus></election>`,
  'parties.xml':`<?xml version="1.0"?><parties><party p_no="16"><abbrev>NAT</abbrev><short_name>National Party</short_name><party_name>National Party</party_name><registered>yes</registered></party><party p_no="13"><abbrev>LAB</abbrev><short_name>Labour Party</short_name><party_name>Labour Party</party_name><registered>yes</registered></party><party p_no="20"><abbrev>OFP</abbrev><short_name>NZ Outdoors &amp; Freedom Party</short_name><party_name>x</party_name><registered>no</registered></party></parties>`,
  'electorates.xml':`<?xml version="1.0"?><electorates><electorate e_no="1"><electorate_name>Auckland Central</electorate_name></electorate><electorate e_no="2"><electorate_name>Waiariki</electorate_name></electorate></electorates>`,
  'candidates.xml':`<?xml version="1.0"?><candidates>
    <candidate c_no="1"><candidate_name>SMITH, Jane</candidate_name><electorate>1</electorate><party>16</party><list_no>2</list_no></candidate>
    <candidate c_no="2"><candidate_name>O&#39;BRIEN, Sam</candidate_name><electorate>1</electorate><party>13</party><list_no>1</list_no></candidate>
    <candidate c_no="3"><candidate_name>NGATA, Hemi</candidate_name><electorate>2</electorate><party>0</party><list_no>0</list_no></candidate>
    <candidate c_no="4"><candidate_name>LEE, Ana</candidate_name><electorate>0</electorate><party>13</party><list_no>2</list_no></candidate>
    <candidate c_no="5"><candidate_name>KING, Tom</candidate_name><electorate>0</electorate><party>16</party><list_no>1</list_no></candidate>
    <candidate c_no="6"><candidate_name>MCDONALD, Rua</candidate_name><electorate>0</electorate><party>13</party><list_no>3</list_no></candidate></candidates>`,
  'statistics.xml':'<?xml version="1.0"?><statistics><total_voting_places>15</total_voting_places><total_voting_place_results>20</total_voting_place_results><total_electors>1000</total_electors></statistics>',
  'e01/e01.xml':`<?xml version="1.0"?><electorate e_no="1" final="false" updated="2026-11-07T20:29:00"><statistics><total_voting_places>10</total_voting_places><total_voting_places_counted>5</total_voting_places_counted><percent_voting_places_counted>50.0</percent_voting_places_counted><total_votes_cast>200</total_votes_cast><total_party_informals>1</total_party_informals><total_candidate_informals>2</total_candidate_informals></statistics>
    <partyvotes><party p_no="16"><votes>110</votes></party><party p_no="13"><votes>90</votes></party></partyvotes><candidatevotes><candidate c_no="1"><votes>120</votes></candidate><candidate c_no="2"><votes>78</votes></candidate></candidatevotes></electorate>`,
};
const fetcher=async(url:RequestInfo|URL)=>{const path=String(url).replace('https://media.election.net.nz/xml/','');const body=(xml as Record<string,string>)[path];return body?new Response(body):new Response('<html>404</html>',{status:404});};

describe('Electoral Commission feed parsing',()=>{
  it('decodes entities',()=>{expect(decode('NZ Outdoors &amp; Freedom &#39;x&#39; &#x101;')).toBe("NZ Outdoors & Freedom 'x' ā");});
  it('reads parties, candidates and statuses without matching child tag names',()=>{
    expect(parseParties(xml['parties.xml']).map(p=>p.name)).toEqual(['National Party','Labour Party','NZ Outdoors & Freedom Party']);
    expect(parseCandidates(xml['candidates.xml'])[1]).toEqual({id:2,name:"O'BRIEN, Sam",electorate:1,party:13,listNo:1});
    const e=parseElection(xml['election.xml']);
    expect(e).toMatchObject({updated:'2026-11-07T20:30:00',placesCounted:10,placesPercent:50,specialVotes:12});
    expect(e.parties[0]).toEqual({id:16,votes:160,percent:53.33,listSeats:1,electorateSeats:1,seats:2});
    expect(parseElectorateResult(xml['e01/e01.xml'])).toMatchObject({final:false,placesTotal:10,candidateVotes:[{id:1,votes:120},{id:2,votes:78}]});
  });
  it('builds a bundle and keeps candidates when an electorate file is missing',async()=>{
    const b=await buildBundle(fetcher);
    expect(b.parties.map(p=>p.abbrev)).toEqual(['NAT','LAB']);
    expect(b.stats).toMatchObject({placesTotal:20,electors:1000});
    const [ak,wa]=b.electorates;
    expect(ak).toMatchObject({kind:'general',available:true,votesCast:200});
    expect(ak.candidates.map(c=>c.votes)).toEqual([120,78]);
    expect(wa).toMatchObject({kind:'maori',available:false,candidates:[{name:'NGATA, Hemi',votes:0}]});
    expect(b.lists[13].map(c=>c.rank)).toEqual([1,2,3]);
  });
  it('serves a cached bundle, and the last good bundle while the feed is down',async()=>{
    let now=0,up=true,calls=0;
    const handle=createElectionHandler(async(url,init)=>{calls++;if(!up)throw new Error('down');return fetcher(url);},()=>now);
    expect((await handle(new Request('http://x/api/election'))).status).toBe(200);
    const first=calls;await handle(new Request('http://x/api/election'));expect(calls).toBe(first);
    up=false;now=60_000;
    const stale=await handle(new Request('http://x/api/election'));
    expect(stale.status).toBe(200);expect(stale.headers.get('x-qcc-stale')).toBe('1');
    expect((await createElectionHandler(async()=>{throw new Error('down');})(new Request('http://x/'))).status).toBe(502);
    expect((await handle(new Request('http://x/',{method:'POST'}))).status).toBe(405);
  });
});

describe('Results model',()=>{
  const bundle=async()=>buildBundle(fetcher);
  it('names, leads and majorities',async()=>{
    expect(candidateName("O'BRIEN, Sam")).toBe("Sam O'Brien");
    expect(candidateName('MCDONALD, Rua')).toBe('Rua McDonald');
    expect(majority(120)).toBe(61);expect(majority(129)).toBe(65);
    const b=await bundle(),l=lead(b.electorates[0]);
    expect(l.leader?.id).toBe(1);expect(l.margin).toBe(42);
    expect(lead(b.electorates[1]).leader).toBeUndefined();
  });
  it('filters by type, status and close races',async()=>{
    const b=await bundle(),base={query:'',kind:'all',party:'all',status:'all',close:false,sort:'name'} as const;
    expect(filterElectorates(b,{...base,kind:'maori'}).map(r=>r.electorate.name)).toEqual(['Waiariki']);
    expect(filterElectorates(b,{...base,status:'none'}).map(r=>r.electorate.name)).toEqual(['Waiariki']);
    expect(filterElectorates(b,{...base,query:'obrien'})).toHaveLength(0);
    expect(filterElectorates(b,{...base,query:'brien'})).toHaveLength(1);
    expect(filterElectorates(b,{...base,query:'maori'})).toHaveLength(0);
    expect(filterElectorates(b,{...base,close:true})).toHaveLength(0);
  });
  it('writes a headline from the blocs',async()=>{
    const b=await bundle();
    expect(headline(b)).toBe('Left and right are tied on 2 seats each with 50.0% counted. Neither reaches 3.');
    b.parties[0].seats=3;
    expect(headline(b)).toBe('National reach 3 of 5 seats with 50.0% of voting places counted: a majority of one.');
  });
  it('fills list seats in rank order, skipping electorate winners',async()=>{
    const b=await bundle(),[nat,lab]=whoIsIn(b);
    expect(nat.electorate).toEqual([{name:'Jane Smith',seat:'Auckland Central'}]);
    expect(nat.list.map(m=>m.name)).toEqual(['Tom King']);
    expect(lab.list.map(m=>m.name)).toEqual(["Sam O'Brien",'Ana Lee']);
    expect(lab.next).toEqual({name:'Rua McDonald',rank:3});
  });
  it('reports lead changes and milestones between updates',async()=>{
    const before=await bundle(),after:ElectionBundle=structuredClone(before);
    after.updated='2026-11-07T20:40:00';after.stats.placesPercent=76;
    after.electorates[0].candidates.reverse().forEach((c,i)=>c.votes=200-i*50);
    const events=diffEvents(before,after,id=>id===16?'NAT':'LAB');
    expect(events.map(e=>e.kind)).toEqual(['lead','milestone']);
    expect(events[0].text).toContain("Sam O'Brien (LAB) takes the lead in Auckland Central");
    expect(diffEvents(before,before,()=>'')).toEqual([]);
  });
  it('records one trend point per feed update',async()=>{
    const b=await bundle();let h=addTrendPoint([],b);h=addTrendPoint(h,b);
    expect(h).toEqual([{at:'2026-11-07T20:30:00',counted:50,shares:{16:53.33,13:46.67}}]);
  });
  it('labels every party chip with at least 4.5:1 contrast',()=>{
    for(const abbrev of ['NAT','LAB','GP','ACT','NZF','TPMAO','OPP','ALCP','NC','OFP','NLY','VNZ','AJP','FPT','TTTP','APN','WRP','XYZ']){
      for(const id of [0,1,2,3,4,99]){const c=partyColour({id,abbrev});expect(contrast(c,inkOn(c)),`${abbrev} ${c}`).toBeGreaterThanOrEqual(4.5);}
    }
  });
  it('lays out one hemicycle seat per member',()=>{
    for(const n of [1,7,120,129,135])expect(hemicycle(n)).toHaveLength(n);
  });
  it('gives every 2026 electorate a short, unique tile code',()=>{
    expect(NAMES).toHaveLength(71);
    const codes=tileCodes(NAMES.map((name,id)=>({id,name})));
    const values=[...codes.values()];
    expect(new Set(values).size).toBe(71);
    expect(Math.max(...values.map(v=>v.length))).toBeLessThanOrEqual(5);
  });
});
