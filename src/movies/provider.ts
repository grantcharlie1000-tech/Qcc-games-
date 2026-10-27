import type {MovieRoute,Title} from './model';

/** Only QCC's own code runs in this frame. Providers are contacted by the relay. */
export const PLAYBACK_PROVIDERS=[
 {id:'framextv',label:'FrameXTV'},
 {id:'vidlink',label:'VidLink'},
 {id:'vixsrc',label:'VixSrc'},
 {id:'vidsrc',label:'VidSrc'},
] as const;
export type PlaybackProvider=typeof PLAYBACK_PROVIDERS[number]['id'];
export const isPlaybackProvider=(value:unknown):value is PlaybackProvider=>PLAYBACK_PROVIDERS.some(provider=>provider.id===value);
const coordinate=(value:number)=>Number.isSafeInteger(value)&&value>=1&&value<=999;
export function frameSource(title:Title,route:MovieRoute):string|undefined {
 const match=title.id.match(/^(movie|tv)-([1-9]\d{0,7})$/);
 if(!match||match[1]!==title.kind)return;
 const params=new URLSearchParams({type:title.kind,id:match[2],provider:'framextv'});
 if(title.kind==='tv'){
  const selected=title.seasons.find(season=>season.number===route.season)??title.seasons.find(season=>season.episodes.length);
  const season=route.season??selected?.number??1,episode=route.episode??selected?.episodes[0]?.number??1;
  if(!coordinate(season)||!coordinate(episode))return;
  params.set('season',String(season));params.set('episode',String(episode));
 }
 const pageBase=typeof document==='undefined'?'https://qcc.invalid/':document.baseURI;
 const player=new URL('movies/player.html',new URL(import.meta.env.BASE_URL,pageBase));
 return player.pathname+'?'+params;
}
// The same-origin privilege is reserved for this bundled first-party player.
// Never point this sandbox at relayed third-party HTML or JavaScript.
export const FRAME_SANDBOX='allow-scripts allow-same-origin';
export const FRAME_ALLOW="fullscreen; picture-in-picture; camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; usb 'none'; serial 'none'; payment 'none'";
