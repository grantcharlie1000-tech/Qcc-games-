import type {MovieRoute,Title} from './model';
// Public iframe integration: https://framextv.cc/api. Availability depends on the viewer's network.
// VidLink, VixSrc and VidSrc refuse our sandbox/referrer policy and carry ad networks.
// No stream extraction, proxy, DRM handling, account/token forwarding, or provider scripts in the parent page.
// Use the canonical host directly: the legacy .xyz host adds a cross-domain redirect.
export const FRAME_ORIGIN='https://framextv.cc';
export const FRAME_MESSAGE_ORIGINS=new Set([FRAME_ORIGIN,'https://framextv.xyz']);
export const STREAM_PROVIDERS=[
 {id:'framextv',name:'FrameXTV',origin:FRAME_ORIGIN,resume:'start',signals:'ready'},
] as const;
export type StreamProviderId=typeof STREAM_PROVIDERS[number]['id'];
export const streamProvider=(id:StreamProviderId)=>STREAM_PROVIDERS.find(provider=>provider.id===id)!;
// Saved positions under START_THRESHOLD seconds play from the beginning.
export const START_THRESHOLD=15;
export function frameSource(title:Title,route:MovieRoute,_providerId:StreamProviderId='framextv',startAt=0):string|undefined {
 if(title.source.type==='archive')return;
 const match=title.id.match(/^(movie|tv)-([1-9]\d*)$/);if(!match||match[1]!==title.kind)return;
 const episode=title.kind==='tv'?`/${route.season??title.seasons.find(s=>s.episodes.length)?.number??1}/${route.episode??title.seasons.find(s=>s.episodes.length)?.episodes[0]?.number??1}`:'';
 const start=Number.isFinite(startAt)&&startAt>=START_THRESHOLD&&startAt<=30*86400?Math.floor(startAt):undefined;
 // FrameXTV injects an ad script on other hosts unless no_ads=1 is set.
 return `${FRAME_ORIGIN}/embed/${match[2]}${episode}?autoplay=1&muted=0&no_ads=1${start===undefined?'':`&t=${start}`}`;
}
export type ProviderSignal={kind:'ready'}|{kind:'ended'}|{kind:'progress';currentTime:number;duration?:number;ended:boolean};
export function providerSignal(_providerId:StreamProviderId,origin:string,message:unknown):ProviderSignal|undefined {
 if(!FRAME_MESSAGE_ORIGINS.has(origin))return;
 if(!message||typeof message!=='object')return;
 const data=message as Record<string,unknown>;
 if(data.event==='frameXTV:ready')return {kind:'ready'};
 if(data.event==='frameXTV:ended')return {kind:'ended'};
 if(data.event!=='frameXTV:timeupdate')return;
 if(typeof data.currentTime!=='number'||!Number.isFinite(data.currentTime)||data.currentTime<0||data.currentTime>30*86400)return;
 const duration=typeof data.duration==='number'&&Number.isFinite(data.duration)&&data.duration>0&&data.duration<=30*86400?data.duration:undefined;
 return {kind:'progress',currentTime:data.currentTime,duration,ended:false};
}
export function providerProgress(providerId:StreamProviderId,origin:string,message:unknown):{currentTime:number;duration?:number;ended:boolean}|undefined {
 const signal=providerSignal(providerId,origin,message);
 if(signal?.kind!=='progress')return;
 return {currentTime:signal.currentTime,duration:signal.duration,ended:signal.ended};
}
export const FRAME_SANDBOX='allow-scripts allow-same-origin';
export const FRAME_ALLOW="fullscreen; picture-in-picture; autoplay; encrypted-media; camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; usb 'none'; serial 'none'; payment 'none'";
