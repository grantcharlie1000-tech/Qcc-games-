/**
 * Santa's departure: one UTC instant plus where it came from and how sure we are.
 *
 * The live value is `public/santa/departure.json`, fetched with no-store on each visit, so
 * an operator can correct the time by editing that file and redeploying, without touching
 * tracker code. FALLBACK_CONFIG is a bundled copy used only when that file cannot load.
 * Never mark an estimate as "official": only NORAD can publish an official time.
 */
export type DepartureStatus='official'|'estimated';
export type Confidence='high'|'medium'|'low';

export interface DepartureReference {label:string;utc?:string;kind:'tracking-centre'|'historical'|'official';url?:string}
export interface DepartureConfig {
  season:number;
  /** Santa's departure from the North Pole, as epoch milliseconds (UTC). */
  departureMs:number;
  status:DepartureStatus;
  /** What the page calls this time, e.g. "Estimated departure". */
  label:string;
  confidence:Confidence;
  uncertaintyMinutes:number;
  source:string;
  method:string;
  references:DepartureReference[];
  updated:string;
}

export const CONFIG_PATH='santa/departure.json';

export const FALLBACK_CONFIG:DepartureConfig={
  season:2026,
  departureMs:Date.UTC(2026,11,24,10,0,0),
  status:'estimated',
  label:'Estimated departure',
  confidence:'medium',
  uncertaintyMinutes:60,
  source:'QCC estimate from NORAD Tracks Santa\'s published 2025 schedule and press coverage of the 2025 flight. NORAD has not published a 2026 departure time.',
  method:'Christmas Day begins first at UTC+14 (Kiritimati, Kiribati) at 10:00 UTC on 24 December.',
  references:[],
  updated:'2026-11-06',
};

const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
const str=(value:unknown,max=2000):string|undefined=>typeof value==='string'&&value.trim()&&value.length<=max?value.trim():undefined;

/** Parses an explicit UTC timestamp ("…Z"). Local or offset-less times are rejected so the instant is never ambiguous. */
export function parseUtc(value:unknown):number|undefined{
  if(typeof value!=='string'||!ISO_UTC.test(value))return undefined;
  const ms=Date.parse(value);
  return Number.isFinite(ms)?ms:undefined;
}

/**
 * Validates the JSON file. Anything malformed returns undefined (and the caller keeps the
 * fallback) rather than showing a wrong countdown. "Official" is accepted only with a source URL.
 */
export function parseConfig(raw:unknown):DepartureConfig|undefined{
  if(!raw||typeof raw!=='object')return undefined;
  const data=raw as Record<string,unknown>;
  if(data.schema!==1)return undefined;
  const departureMs=parseUtc(data.departureUtc);
  const season=typeof data.season==='number'&&Number.isInteger(data.season)?data.season:undefined;
  if(departureMs===undefined||season===undefined)return undefined;
  // A departure outside that season's Christmas Eve/Day (UTC) is almost certainly a typo.
  const date=new Date(departureMs);
  if(date.getUTCFullYear()!==season||date.getUTCMonth()!==11||date.getUTCDate()<23||date.getUTCDate()>25)return undefined;
  const references:DepartureReference[]=Array.isArray(data.references)?data.references.flatMap(item=>{
    if(!item||typeof item!=='object')return [];
    const ref=item as Record<string,unknown>,label=str(ref.label,300);
    const kind=ref.kind==='tracking-centre'||ref.kind==='historical'||ref.kind==='official'?ref.kind as DepartureReference['kind']:undefined;
    if(!label||!kind)return [];
    const url=str(ref.url,500),utc=str(ref.utc,40);
    return [{label,kind,...(url&&/^https:\/\//.test(url)?{url}:{}),...(utc&&parseUtc(utc)!==undefined?{utc}:{})}];
  }).slice(0,10) as DepartureReference[]:[];
  let status:DepartureStatus=data.status==='official'?'official':'estimated';
  if(status==='official'&&!references.some(ref=>ref.kind==='official'&&ref.url))status='estimated';
  const confidence:Confidence=data.confidence==='high'||data.confidence==='low'?data.confidence:'medium';
  const uncertainty=typeof data.uncertaintyMinutes==='number'&&data.uncertaintyMinutes>=0&&data.uncertaintyMinutes<=720?Math.round(data.uncertaintyMinutes):0;
  return {
    season,departureMs,status,
    label:status==='official'?(str(data.label,60)??'Departure'):'Estimated departure',
    confidence,uncertaintyMinutes:uncertainty,
    source:str(data.source)??FALLBACK_CONFIG.source,
    method:str(data.method)??'',
    references,
    updated:str(data.updated,40)??'',
  };
}
