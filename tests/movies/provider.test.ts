import {it,expect,vi,afterEach} from 'vitest';
import {frameSource,FRAME_SANDBOX,FRAME_ALLOW} from '../../src/movies/provider';
import {parseCatalog,imageAsset} from '../../src/movies/model';
const title=parseCatalog({titles:[{id:'movie-157336',kind:'movie',name:'Interstellar',year:2014,overview:'Space exploration.',genres:[],poster:'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'}]}).titles[0];
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('opens the first-party relay player with only validated title coordinates',()=>{
 expect(frameSource(title,{play:true})).toBe('/movies/player.html?type=movie&id=157336&provider=framextv');
 expect(frameSource({...title,id:'tv-19885',kind:'tv'},{play:true,season:2,episode:3})).toBe('/movies/player.html?type=tv&id=19885&provider=framextv&season=2&episode=3');
 for(const id of ['movie-invalid','movie-0','movie-9007199254740992','tv-1'])expect(frameSource({...title,id},{play:true})).toBeUndefined();
 expect(frameSource({...title,id:'tv-19885',kind:'tv'},{play:true,season:-1,episode:3})).toBeUndefined();
 expect(FRAME_SANDBOX.split(' ').sort()).toEqual(['allow-same-origin','allow-scripts']);
 for(const feature of ['camera','microphone','geolocation','clipboard-read','usb','serial','payment'])expect(FRAME_ALLOW).toContain(`${feature} 'none'`);
});
it('resolves the player under the application base path',()=>{
 vi.stubEnv('BASE_URL','./');vi.stubGlobal('document',{baseURI:'https://qcc.example/Qcc-games-/index.html#/movies'});
 expect(frameSource(title,{play:true})).toBe('/Qcc-games-/movies/player.html?type=movie&id=157336&provider=framextv');
 vi.stubEnv('BASE_URL','/school/');
 expect(frameSource(title,{play:true})).toBe('/school/movies/player.html?type=movie&id=157336&provider=framextv');
});
it('allows actual TMDB image variants and rejects arbitrary remote/tracking image URLs',()=>{
 expect(imageAsset(title.poster)).toBe(title.poster);
 for(const url of ['https://evil.test/poster.jpg','https://image.tmdb.org.evil.test/t/p/w500/a.jpg','https://image.tmdb.org/t/p/w500/a.jpg?tracking=1','https://image.tmdb.org/t/p/w500/../a.jpg'])expect(imageAsset(url)).toBeUndefined();
});
