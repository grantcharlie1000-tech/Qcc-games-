import {it,expect} from 'vitest';
import {frameSource,providerSignal,providerProgress,STREAM_PROVIDERS,START_THRESHOLD,FRAME_ORIGIN,FRAME_SANDBOX,FRAME_ALLOW} from '../../src/movies/provider';
import {parseCatalog,imageAsset} from '../../src/movies/model';
const title=parseCatalog({titles:[{id:'movie-157336',kind:'movie',name:'Interstellar',year:2014,overview:'Space exploration.',genres:[],poster:'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'}]}).titles[0];
it('keeps supported streaming enabled through documented embeds without identifiers or tokens',()=>{
 expect(frameSource(title,{play:true})).toBe('https://framextv.cc/embed/157336?autoplay=1&muted=0&no_ads=1');
 expect(frameSource({...title,id:'tv-19885',kind:'tv'},{play:true,season:2,episode:3})).toBe('https://framextv.cc/embed/19885/2/3?autoplay=1&muted=0&no_ads=1');
 expect(frameSource({...title,id:'movie-invalid'},{play:true})).toBeUndefined();
 expect(FRAME_SANDBOX.split(' ').sort()).toEqual(['allow-same-origin','allow-scripts']);
 for(const feature of ['camera','microphone','geolocation','clipboard-read','usb','serial','payment'])expect(FRAME_ALLOW).toContain(`${feature} 'none'`);
});
it('delegates autoplay and encrypted media to the frame and keeps every other feature denied',()=>{
 const features=FRAME_ALLOW.split('; ');
 expect(features).toEqual(expect.arrayContaining(['autoplay','encrypted-media']));
 for(const feature of ['camera','microphone','geolocation','clipboard-read','clipboard-write','usb','serial','payment'])expect(features).toContain(`${feature} 'none'`);
});
it('keeps only FrameXTV as a stream provider',()=>{
 expect(STREAM_PROVIDERS.map(provider=>provider.id)).toEqual(['framextv']);
});
it('asks FrameXTV to autoplay and resumes from a saved position only at or past START_THRESHOLD',()=>{
 expect(frameSource(title,{play:true},'framextv',42)).toBe('https://framextv.cc/embed/157336?autoplay=1&muted=0&no_ads=1&t=42');
 expect(frameSource(title,{play:true},'framextv',10)).toBe('https://framextv.cc/embed/157336?autoplay=1&muted=0&no_ads=1');
 expect(frameSource(title,{play:true},'framextv',START_THRESHOLD)).toBe('https://framextv.cc/embed/157336?autoplay=1&muted=0&no_ads=1&t=15');
 expect(frameSource(title,{play:true},'framextv',30*86400+1)).toBe('https://framextv.cc/embed/157336?autoplay=1&muted=0&no_ads=1');
});
it('disables FrameXTV ad injection for every movie and episode URL, including resume URLs',()=>{
 for(const item of [title,{...title,id:'tv-19885',kind:'tv' as const}]){
  for(const startAt of [0,10,START_THRESHOLD,42,30*86400+1,NaN]){
   const url=new URL(frameSource(item,{play:true,season:1,episode:1},'framextv',startAt)!);
   expect(url.searchParams.getAll('no_ads')).toEqual(['1']);
  }
 }
});
it('reads FrameXTV ready and ended only from its approved origins',()=>{
 for(const origin of [FRAME_ORIGIN,'https://framextv.xyz']){
  expect(providerSignal('framextv',origin,{event:'frameXTV:ready'})).toEqual({kind:'ready'});
  expect(providerSignal('framextv',origin,{event:'frameXTV:ended'})).toEqual({kind:'ended'});
 }
 expect(providerSignal('framextv','https://example.org',{event:'frameXTV:ready'})).toBeUndefined();
 expect(providerSignal('framextv','https://example.org',{event:'frameXTV:ended'})).toBeUndefined();
});
it('reads FrameXTV progress and rejects NaN, negative and out-of-range times',()=>{
 expect(providerSignal('framextv',FRAME_ORIGIN,{event:'frameXTV:timeupdate',currentTime:42,duration:100})).toEqual({kind:'progress',currentTime:42,duration:100,ended:false});
 for(const currentTime of [NaN,-1,30*86400+1])expect(providerSignal('framextv',FRAME_ORIGIN,{event:'frameXTV:timeupdate',currentTime})).toBeUndefined();
});
it('ignores removed provider origins and their player event format',()=>{
 for(const origin of ['https://vidlink.pro','https://vixsrc.to','https://vidsrc.to']){
  expect(providerSignal('framextv',origin,{event:'frameXTV:ready'})).toBeUndefined();
  expect(providerSignal('framextv',origin,{event:'frameXTV:timeupdate',currentTime:42})).toBeUndefined();
 }
 expect(providerSignal('framextv',FRAME_ORIGIN,{type:'PLAYER_EVENT',data:{event:'timeupdate',currentTime:42}})).toBeUndefined();
});
it('keeps providerProgress to the progress case only',()=>{
 expect(providerProgress('framextv',FRAME_ORIGIN,{event:'frameXTV:ready'})).toBeUndefined();
 expect(providerProgress('framextv',FRAME_ORIGIN,{event:'frameXTV:timeupdate',currentTime:42})).toEqual({currentTime:42,ended:false});
});
it('allows actual TMDB image variants and rejects arbitrary remote/tracking image URLs',()=>{
 expect(imageAsset(title.poster)).toBe(title.poster);
 for(const url of ['https://evil.test/poster.jpg','https://image.tmdb.org.evil.test/t/p/w500/a.jpg','https://image.tmdb.org/t/p/w500/a.jpg?tracking=1','https://image.tmdb.org/t/p/w500/../a.jpg'])expect(imageAsset(url)).toBeUndefined();
});

it('never routes archive titles through any third-party provider even with numeric TMDB ids',()=>{
 const archive={...title,source:{type:'archive' as const,archiveId:'example',license:'Public domain',evidence:'Collection review'}};
 for(const {id:provider} of STREAM_PROVIDERS){
  expect(frameSource(archive,{play:true},provider,42)).toBeUndefined();
  expect(frameSource({...archive,id:'tv-19885',kind:'tv'},{play:true,season:2,episode:3},provider)).toBeUndefined();
 }
});
