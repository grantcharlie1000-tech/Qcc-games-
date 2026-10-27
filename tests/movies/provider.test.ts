import {it,expect} from 'vitest';
import {frameSource,FRAME_SANDBOX,FRAME_ALLOW} from '../../src/movies/provider';
import {parseCatalog,imageAsset} from '../../src/movies/model';
const title=parseCatalog({titles:[{id:'movie-157336',kind:'movie',name:'Interstellar',year:2014,overview:'Space exploration.',genres:[],poster:'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'}]}).titles[0];
it('keeps supported streaming enabled through documented embeds without identifiers or tokens',()=>{
 expect(frameSource(title,{play:true})).toBe('https://framextv.cc/embed/157336?autoplay=0&muted=0');
 expect(frameSource({...title,id:'tv-19885',kind:'tv'},{play:true,season:2,episode:3})).toBe('https://framextv.cc/embed/19885/2/3?autoplay=0&muted=0');
 expect(frameSource({...title,id:'movie-invalid'},{play:true})).toBeUndefined();
 expect(FRAME_SANDBOX.split(' ').sort()).toEqual(['allow-same-origin','allow-scripts']);
 for(const feature of ['camera','microphone','geolocation','clipboard-read','usb','serial','payment'])expect(FRAME_ALLOW).toContain(`${feature} 'none'`);
});
it('allows actual TMDB image variants and rejects arbitrary remote/tracking image URLs',()=>{
 expect(imageAsset(title.poster)).toBe(title.poster);
 for(const url of ['https://evil.test/poster.jpg','https://image.tmdb.org.evil.test/t/p/w500/a.jpg','https://image.tmdb.org/t/p/w500/a.jpg?tracking=1','https://image.tmdb.org/t/p/w500/../a.jpg'])expect(imageAsset(url)).toBeUndefined();
});
