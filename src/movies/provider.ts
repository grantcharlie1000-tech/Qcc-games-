import type {MovieRoute,Title} from './model';
// Public iframe integrations: https://framextv.cc/api, https://vidlink.pro,
// https://vixsrc.to and https://vidsrc.to. Availability depends on the viewer's network.
// No stream extraction, proxy, DRM handling, account/token forwarding, or provider scripts in the parent page.
// Use the canonical host directly: the legacy .xyz host adds a cross-domain redirect.
export const FRAME_ORIGIN='https://framextv.cc';
export const FRAME_MESSAGE_ORIGINS=new Set([FRAME_ORIGIN,'https://framextv.xyz']);
export const STREAM_PROVIDERS=[
 {id:'framextv',name:'FrameXTV',origin:FRAME_ORIGIN,resume:'seek'},
 {id:'vidlink',name:'VidLink',origin:'https://vidlink.pro',resume:'startAt'},
 {id:'vixsrc',name:'VixSrc',origin:'https://vixsrc.to',resume:'startAt'},
 {id:'vidsrc',name:'VidSrc',origin:'https://vidsrc.to',resume:'none'},
] as const;
export type StreamProviderId=typeof STREAM_PROVIDERS[number]['id'];
export const streamProvider=(id:StreamProviderId)=>STREAM_PROVIDERS.find(provider=>provider.id===id)!;
export function frameSource(title:Title,route:MovieRoute,providerId:StreamProviderId='framextv',startAt=0):string|undefined {
 const match=title.id.match(/^(movie|tv)-([1-9]\d*)$/);if(!match||match[1]!==title.kind)return;
 const episode=title.kind==='tv'?`/${route.season??title.seasons.find(s=>s.episodes.length)?.number??1}/${route.episode??title.seasons.find(s=>s.episodes.length)?.episodes[0]?.number??1}`:'';
 const provider=streamProvider(providerId);
 if(providerId==='framextv')return `${FRAME_ORIGIN}/embed/${match[2]}${episode}?autoplay=0&muted=0`;
 if(providerId==='vidsrc')return `${provider.origin}/embed/${title.kind}/${match[2]}${episode}`;
 const params=new URLSearchParams({autoplay:'false'});
 if(Number.isFinite(startAt)&&startAt>0&&startAt<=30*86400)params.set('startAt',String(Math.floor(startAt)));
 if(providerId==='vidlink')params.set('nextbutton','false');
 return `${provider.origin}/${title.kind}/${match[2]}${episode}?${params}`;
}
export function providerProgress(providerId:StreamProviderId,origin:string,message:unknown):{currentTime:number;duration?:number;ended:boolean}|undefined {
 const provider=streamProvider(providerId);
 if(providerId==='framextv'?!FRAME_MESSAGE_ORIGINS.has(origin):origin!==provider.origin)return;
 if(!message||typeof message!=='object')return;
 const envelope=message as Record<string,unknown>;
 let data:Record<string,unknown>;
 if(providerId==='framextv'){
  if(envelope.event!=='frameXTV:timeupdate')return;
  data=envelope;
 }else{
  if(providerId==='vidsrc'||envelope.type!=='PLAYER_EVENT'||!envelope.data||typeof envelope.data!=='object')return;
  data=envelope.data as Record<string,unknown>;
  if(!['play','pause','seeked','ended','timeupdate'].includes(String(data.event)))return;
 }
 if(typeof data.currentTime!=='number'||!Number.isFinite(data.currentTime)||data.currentTime<0||data.currentTime>30*86400)return;
 const duration=typeof data.duration==='number'&&Number.isFinite(data.duration)&&data.duration>0&&data.duration<=30*86400?data.duration:undefined;
 return {currentTime:data.currentTime,duration,ended:data.event==='ended'};
}
export const FRAME_SANDBOX='allow-scripts allow-same-origin';
export const FRAME_ALLOW="fullscreen; picture-in-picture; camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; usb 'none'; serial 'none'; payment 'none'";
