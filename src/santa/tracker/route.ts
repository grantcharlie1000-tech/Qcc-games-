/**
 * QCC's simulated Christmas Eve route. This is NOT NORAD data and NOT live tracking.
 *
 * Stops follow the pattern NORAD's public tracker has shown in past years: westward from the
 * International Date Line, reaching each place around its local midnight. Times are minutes
 * after the configured departure, worked out from each city's December UTC offset
 * ((14 − offset) × 60, so UTC+14 is 0 and UTC−11 is 1500) with a few minutes between stops in the
 * same time zone. Changing the departure in departure.json moves the whole schedule.
 *
 * The future 3D globe, sleigh and travelled-route renderers read positionAt() and nothing else.
 */
import {JOURNEY_MS} from '../countdown';

export interface Stop {id:string;name:string;country:string;lat:number;lon:number;/** minutes after departure */at:number}

export const NORTH_POLE:Stop={id:'north-pole',name:'North Pole',country:'Arctic',lat:90,lon:0,at:0};

export const ROUTE:readonly Stop[]=[
  NORTH_POLE,
  {id:'kiritimati',name:'Kiritimati',country:'Kiribati',lat:1.87,lon:-157.36,at:10},
  {id:'apia',name:'Apia',country:'Samoa',lat:-13.83,lon:-171.76,at:55},
  {id:'nukualofa',name:'Nukuʻalofa',country:'Tonga',lat:-21.14,lon:-175.2,at:65},
  {id:'auckland',name:'Auckland',country:'New Zealand',lat:-36.85,lon:174.76,at:75},
  {id:'suva',name:'Suva',country:'Fiji',lat:-18.14,lon:178.44,at:125},
  {id:'sydney',name:'Sydney',country:'Australia',lat:-33.87,lon:151.21,at:185},
  {id:'brisbane',name:'Brisbane',country:'Australia',lat:-27.47,lon:153.03,at:245},
  {id:'tokyo',name:'Tokyo',country:'Japan',lat:35.68,lon:139.69,at:305},
  {id:'seoul',name:'Seoul',country:'South Korea',lat:37.57,lon:126.98,at:320},
  {id:'beijing',name:'Beijing',country:'China',lat:39.9,lon:116.4,at:365},
  {id:'manila',name:'Manila',country:'Philippines',lat:14.6,lon:120.98,at:380},
  {id:'bangkok',name:'Bangkok',country:'Thailand',lat:13.76,lon:100.5,at:425},
  {id:'new-delhi',name:'New Delhi',country:'India',lat:28.61,lon:77.21,at:515},
  {id:'dubai',name:'Dubai',country:'United Arab Emirates',lat:25.2,lon:55.27,at:605},
  {id:'moscow',name:'Moscow',country:'Russia',lat:55.76,lon:37.62,at:665},
  {id:'nairobi',name:'Nairobi',country:'Kenya',lat:-1.29,lon:36.82,at:680},
  {id:'cape-town',name:'Cape Town',country:'South Africa',lat:-33.92,lon:18.42,at:725},
  {id:'cairo',name:'Cairo',country:'Egypt',lat:30.04,lon:31.24,at:740},
  {id:'berlin',name:'Berlin',country:'Germany',lat:52.52,lon:13.4,at:785},
  {id:'paris',name:'Paris',country:'France',lat:48.86,lon:2.35,at:800},
  {id:'london',name:'London',country:'United Kingdom',lat:51.51,lon:-0.13,at:845},
  {id:'reykjavik',name:'Reykjavík',country:'Iceland',lat:64.15,lon:-21.94,at:860},
  {id:'rio',name:'Rio de Janeiro',country:'Brazil',lat:-22.91,lon:-43.17,at:1025},
  {id:'buenos-aires',name:'Buenos Aires',country:'Argentina',lat:-34.6,lon:-58.38,at:1035},
  {id:'new-york',name:'New York',country:'United States',lat:40.71,lon:-74.01,at:1145},
  {id:'toronto',name:'Toronto',country:'Canada',lat:43.65,lon:-79.38,at:1150},
  {id:'chicago',name:'Chicago',country:'United States',lat:41.88,lon:-87.63,at:1205},
  {id:'mexico-city',name:'Mexico City',country:'Mexico',lat:19.43,lon:-99.13,at:1215},
  {id:'denver',name:'Denver',country:'United States',lat:39.74,lon:-104.99,at:1265},
  {id:'vancouver',name:'Vancouver',country:'Canada',lat:49.28,lon:-123.12,at:1325},
  {id:'los-angeles',name:'Los Angeles',country:'United States',lat:34.05,lon:-118.24,at:1330},
  {id:'anchorage',name:'Anchorage',country:'United States',lat:61.22,lon:-149.9,at:1385},
  {id:'honolulu',name:'Honolulu',country:'United States',lat:21.31,lon:-157.86,at:1445},
  {id:'pago-pago',name:'Pago Pago',country:'American Samoa',lat:-14.28,lon:-170.7,at:1505},
  {...NORTH_POLE,id:'north-pole-return',at:JOURNEY_MS/60000},
];

/** Santa spends this long at each stop before flying on. */
export const STOP_MINUTES=4;

export interface TrackerState {
  /** Index of the last stop reached (ROUTE[visited]); -1 before departure. */
  visited:number;
  /** The stop being flown to, or undefined when home. */
  next?:Stop;
  /** Arrival time at `next`, epoch ms. */
  nextAtMs?:number;
  /** Where the sleigh is now. */
  lat:number;lon:number;
  /** 0 → 1 along the current leg; 0 while landed. */
  legProgress:number;
  landed:boolean;
  /** 0 → 1 of the whole night. */
  progress:number;
}

const rad=Math.PI/180;
/** Great-circle interpolation between two stops, so the sleigh flies a believable path on a globe. */
export function interpolate(a:{lat:number;lon:number},b:{lat:number;lon:number},t:number):{lat:number;lon:number}{
  const toVec=(p:{lat:number;lon:number})=>[Math.cos(p.lat*rad)*Math.cos(p.lon*rad),Math.cos(p.lat*rad)*Math.sin(p.lon*rad),Math.sin(p.lat*rad)];
  const va=toVec(a),vb=toVec(b);
  const dot=Math.min(1,Math.max(-1,va[0]*vb[0]+va[1]*vb[1]+va[2]*vb[2]));
  const omega=Math.acos(dot);
  if(omega<1e-6)return {lat:a.lat,lon:a.lon};
  const s=Math.sin(omega),k1=Math.sin((1-t)*omega)/s,k2=Math.sin(t*omega)/s;
  const v=[k1*va[0]+k2*vb[0],k1*va[1]+k2*vb[1],k1*va[2]+k2*vb[2]];
  return {lat:Math.atan2(v[2],Math.hypot(v[0],v[1]))/rad,lon:Math.atan2(v[1],v[0])/rad};
}

export function arrivalMs(stop:Stop,departureMs:number):number{return departureMs+stop.at*60000;}

/** Where the simulated sleigh is at `nowMs`. Pure, so every renderer and test agrees. */
export function positionAt(nowMs:number,departureMs:number,route:readonly Stop[]=ROUTE):TrackerState{
  const minutes=(nowMs-departureMs)/60000;
  const last=route.length-1;
  const total=route[last].at;
  if(minutes<0)return {visited:-1,next:route[0],nextAtMs:departureMs,lat:route[0].lat,lon:route[0].lon,legProgress:0,landed:true,progress:0};
  if(minutes>=total)return {visited:last,lat:route[last].lat,lon:route[last].lon,legProgress:0,landed:true,progress:1};
  let i=0;
  while(i<last&&route[i+1].at<=minutes)i++;
  const here=route[i],next=route[i+1];
  // The first leg leaves at once; every other stop keeps Santa on the ground for STOP_MINUTES.
  const leaves=i===0?here.at:Math.min(here.at+STOP_MINUTES,next.at);
  const landed=minutes<leaves;
  const t=landed?0:(minutes-leaves)/Math.max(1e-9,next.at-leaves);
  const pos=landed?here:interpolate(here,next,t);
  return {visited:i,next,nextAtMs:arrivalMs(next,departureMs),lat:pos.lat,lon:pos.lon,legProgress:t,landed,progress:minutes/total};
}
