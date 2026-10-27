import Hls,{FetchLoader} from 'hls.js';
import type {LoaderCallbacks,LoaderConfiguration,LoaderContext} from 'hls.js';
import './relay-player.css';
import {PLAYBACK_PROVIDERS,isPlaybackProvider} from './provider';
import type {PlaybackProvider} from './provider';

/** This page runs only bundled QCC code; all playback resources stay on the relay. */
type Source={url:string;type:'hls'|'mp4'|'webm'};
type Subtitle={src:string;label:string;srclang:string};
type Playback={provider:PlaybackProvider;source:Source;subtitles:Subtitle[]};
type Coordinates={type:'movie'|'tv';id:string;season?:string;episode?:string};
const root=document.querySelector<HTMLElement>('.relay-player')!;
const select=document.querySelector<HTMLSelectElement>('#relay-source')!;
const status=document.querySelector<HTMLElement>('#relay-status')!;
const overlay=document.querySelector<HTMLElement>('.relay-overlay')!;
const playButton=document.querySelector<HTMLButtonElement>('#relay-play')!;
const nextButton=document.querySelector<HTMLButtonElement>('#relay-next')!;
const reloadButton=document.querySelector<HTMLButtonElement>('#relay-reload')!;
let video=document.querySelector<HTMLVideoElement>('#relay-video')!;
const params=new URLSearchParams(location.search);
const initialProvider=params.get('provider');
let selected:PlaybackProvider=isPlaybackProvider(initialProvider)?initialProvider:'framextv';
const coordinates=parseCoordinates(params);
let generation=0,request:AbortController|undefined,hls:Hls|undefined,events:AbortController|undefined;
let attempted=new Set<PlaybackProvider>(),resumeTime=0,desiredPlaying=false,disposed=false,suspended=false;
let volume=1,muted=false;

for(const provider of PLAYBACK_PROVIDERS){const option=document.createElement('option');option.value=provider.id;option.textContent=provider.label;select.append(option);}
select.value=selected;
function parseCoordinates(query:URLSearchParams):Coordinates|undefined{
 const type=query.get('type'),id=query.get('id');
 if((type!=='movie'&&type!=='tv')||!id||!(/^[1-9]\d{0,7}$/).test(id))return;
 if(type==='movie')return {type,id};
 const season=query.get('season'),episode=query.get('episode');
 if(!season||!episode||!(/^[1-9]\d{0,2}$/).test(season)||!(/^[1-9]\d{0,2}$/).test(episode))return;
 return {type,id,season,episode};
}
function relayURL(value:unknown):string|undefined{
 if(typeof value!=='string'||value.length>12000)return;
 try{const url=new URL(value,location.origin);if(url.origin!==location.origin||url.pathname!=='/api/media'||url.username||url.password||url.hash||!url.searchParams.get('token'))return;return url.pathname+url.search;}catch{return;}
}
function readPlayback(value:unknown,provider:PlaybackProvider):Playback{
 if(!value||typeof value!=='object')throw new Error('Invalid playback response');
 const data=value as Partial<Playback>,url=relayURL(data.source?.url);
 if(data.provider!==provider||!url||!['hls','mp4','webm'].includes(data.source?.type??''))throw new Error('Invalid playback response');
 const subtitles:Subtitle[]=[];
 if(Array.isArray(data.subtitles))for(const track of data.subtitles){
  const src=relayURL(track?.src);
  if(src&&typeof track.label==='string'&&typeof track.srclang==='string'&&/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(track.srclang))subtitles.push({src,label:track.label.slice(0,100),srclang:track.srclang});
 }
 return {provider,source:{url,type:data.source!.type},subtitles};
}
/** Enforce the relay boundary for every HLS resource, including nested playlists. */
class RelayLoader extends FetchLoader{
 override load(context:LoaderContext,config:LoaderConfiguration,callbacks:LoaderCallbacks<LoaderContext>){
  const url=relayURL(context.url);
  if(!url){queueMicrotask(()=>callbacks.onError({code:0,text:'Playback resource is unavailable'},context,null,this.stats));return;}
  super.load({...context,url},config,callbacks);
 }
}
function label(provider:PlaybackProvider){return PLAYBACK_PROVIDERS.find(item=>item.id===provider)!.label;}
function report(message:string,error=false){status.textContent=message;root.dataset.error=String(error);}
function remember(){
 if(video.readyState>0&&Number.isFinite(video.currentTime))resumeTime=video.currentTime;
 volume=video.volume;muted=video.muted;
}
function detach(){
 request?.abort();request=undefined;
 events?.abort();events=undefined;
 hls?.destroy();hls=undefined;
 video.pause();video.removeAttribute('src');video.replaceChildren();video.load();
 playButton.disabled=true;overlay.hidden=false;
}
function postProgress(){
 if(disposed||suspended||window.parent===window)return;
 const time=video.currentTime,duration=video.duration;
 if(!Number.isFinite(time))return;
 window.parent.postMessage({event:'frameXTV:timeupdate',currentTime:time,...(Number.isFinite(duration)&&duration>0?{duration}:{})},location.origin);
}
function nextUntried(){
 const start=PLAYBACK_PROVIDERS.findIndex(item=>item.id===selected);
 for(let offset=1;offset<=PLAYBACK_PROVIDERS.length;offset++){const provider=PLAYBACK_PROVIDERS[(start+offset)%PLAYBACK_PROVIDERS.length].id;if(!attempted.has(provider))return provider;}
}
function failed(current:number){
 if(disposed||suspended||current!==generation)return;
 remember();const next=nextUntried();
 if(next){void load(next,false);return;}
 generation++;detach();report('No source is available right now. Try another source or reload in a moment.',true);
}
async function start(){
 if(disposed)return;
 desiredPlaying=true;
 if(suspended){suspended=false;await load(selected,true);return;}
 if(video.readyState===0)return;
 try{await video.play();}catch{if(!disposed){desiredPlaying=false;overlay.hidden=false;report('Ready — press Play to continue.');}}
}
async function load(provider:PlaybackProvider,reset:boolean){
 if(disposed||!coordinates)return;
 remember();if(reset)attempted=new Set();attempted.add(provider);
 const current=++generation;detach();selected=provider;select.value=provider;suspended=false;
 report('Loading '+label(provider)+'…');
 const controller=request=new AbortController();
 // Allow the server's 45-second source resolution budget plus a transport margin.
 const deadline=setTimeout(()=>controller.abort(),50000);
 try{
  const query=new URLSearchParams({provider,...coordinates});
  const response=await fetch('/api/playback?'+query,{signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('Source unavailable');
  const playback=readPlayback(await response.json(),provider);
  if(disposed||suspended||current!==generation||controller.signal.aborted)return;
  clearTimeout(deadline);request=undefined;
  const replacement=document.createElement('video');replacement.id='relay-video';replacement.controls=true;replacement.playsInline=true;replacement.preload='metadata';replacement.setAttribute('aria-label','Video player');replacement.volume=volume;replacement.muted=muted;
  video.replaceWith(replacement);video=replacement;
  events=new AbortController();const signal=events.signal;
  const active=()=>!disposed&&!suspended&&current===generation&&video===replacement;
  replacement.addEventListener('loadedmetadata',()=>{
   if(!active())return;
   if(resumeTime>0&&Number.isFinite(replacement.duration)&&resumeTime<replacement.duration-.1)replacement.currentTime=resumeTime;
   playButton.disabled=false;report('Ready · '+label(provider));postProgress();
   if(desiredPlaying)void start();
  },{signal});
  replacement.addEventListener('play',()=>{if(active()){desiredPlaying=true;overlay.hidden=true;report('Playing · '+label(provider));}},{signal});
  replacement.addEventListener('pause',()=>{if(active()){desiredPlaying=false;overlay.hidden=false;remember();postProgress();}},{signal});
  replacement.addEventListener('timeupdate',()=>{if(active()){remember();postProgress();}},{signal});
  replacement.addEventListener('seeked',()=>{if(active()){remember();postProgress();}},{signal});
  replacement.addEventListener('ended',()=>{if(active()){desiredPlaying=false;overlay.hidden=false;resumeTime=0;postProgress();}},{signal});
  replacement.addEventListener('error',()=>{if(active())failed(current);},{signal});
  for(const subtitle of playback.subtitles){const track=document.createElement('track');track.kind='subtitles';track.src=subtitle.src;track.label=subtitle.label;track.srclang=subtitle.srclang;replacement.append(track);}
  if(playback.source.type==='hls'&&!replacement.canPlayType('application/vnd.apple.mpegurl')){
   if(!Hls.isSupported()){failed(current);return;}
   hls=new Hls({enableWorker:false,loader:RelayLoader,fetchSetup:(context,init)=>new Request(new URL(context.url,location.origin),{...init,credentials:'omit',mode:'same-origin',cache:'no-store',redirect:'error'}),capLevelToPlayerSize:true,maxBufferLength:30,maxMaxBufferLength:60,backBufferLength:30});
   hls.on(Hls.Events.ERROR,(_event,data)=>{if(active()&&data.fatal)failed(current);});
   hls.loadSource(playback.source.url);hls.attachMedia(replacement);
  }else{replacement.src=playback.source.url;replacement.load();}
 }catch{if(!disposed&&!suspended&&current===generation)failed(current);}
 finally{clearTimeout(deadline);}
}
function choose(provider:PlaybackProvider){if(video.readyState>0)desiredPlaying=!video.paused&&!video.ended;void load(provider,true);}
select.addEventListener('change',()=>{if(isPlaybackProvider(select.value))choose(select.value);});
nextButton.addEventListener('click',()=>{const index=PLAYBACK_PROVIDERS.findIndex(item=>item.id===selected);choose(PLAYBACK_PROVIDERS[(index+1)%PLAYBACK_PROVIDERS.length].id);});
reloadButton.addEventListener('click',()=>choose(selected));
playButton.addEventListener('click',()=>void start());
window.addEventListener('keydown',event=>{
 if(event.key!=='Escape'||event.repeat||window.parent===window)return;
 event.preventDefault();event.stopImmediatePropagation();
 window.parent.postMessage({event:'qcc:study'},location.origin);
},{capture:true});
window.addEventListener('message',event=>{
 if(window.parent===window||event.source!==window.parent||event.origin!==location.origin||!event.data||typeof event.data!=='object')return;
 const command=event.data;
 if(command.action==='play')void start();
 if(command.action==='pause'){desiredPlaying=false;video.pause();}
 if(command.action==='seek'&&typeof command.time==='number'&&Number.isFinite(command.time)&&command.time>=0&&command.time<=30*86400){resumeTime=command.time;if(video.readyState>0&&Number.isFinite(video.duration)&&resumeTime<video.duration)video.currentTime=resumeTime;}
 if((command.action==='setVolume'||command.action==='volume')&&typeof command.volume==='number'&&Number.isFinite(command.volume)&&command.volume>=0&&command.volume<=1){volume=command.volume;video.volume=volume;}
 if(command.action==='mute'){muted=typeof command.muted==='boolean'?command.muted:true;video.muted=muted;}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!disposed){remember();suspended=true;generation++;detach();playButton.disabled=false;report('Paused — press Play when you return.');}});
window.addEventListener('pagehide',()=>{disposed=true;generation++;detach();});
if(coordinates)void load(selected,true);
else{select.disabled=true;nextButton.disabled=true;reloadButton.disabled=true;report('Choose a valid movie or episode to start playback.',true);}
