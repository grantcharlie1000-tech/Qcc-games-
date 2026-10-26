import type {MovieRoute,Title} from './model';
// Standard public iframe integration documented at https://framextv.cc/api.
// No stream extraction, proxy, DRM handling, account/token forwarding, or provider scripts in the parent page.
// Use the canonical host directly: the legacy .xyz host adds a cross-domain redirect.
export const FRAME_ORIGIN='https://framextv.cc';
export const FRAME_MESSAGE_ORIGINS=new Set([FRAME_ORIGIN,'https://framextv.xyz']);
export function frameSource(title:Title,route:MovieRoute):string|undefined {
 const match=title.id.match(/^(movie|tv)-([1-9]\d*)$/);if(!match)return;
 const episode=title.kind==='tv'?`/${route.season??title.seasons.find(s=>s.episodes.length)?.number??1}/${route.episode??title.seasons.find(s=>s.episodes.length)?.episodes[0]?.number??1}`:'';
 return `${FRAME_ORIGIN}/embed/${match[2]}${episode}?autoplay=0&muted=0`;
}
export const FRAME_SANDBOX='allow-scripts allow-same-origin';
export const FRAME_ALLOW="fullscreen; picture-in-picture; camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; usb 'none'; serial 'none'; payment 'none'";
