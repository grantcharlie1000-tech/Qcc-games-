import {describe,it,expect} from 'vitest';
import {filterTitles,parseCatalog,parseMovieRoute,licensedSource,localAsset,nextEpisode,imageAsset,kindHash,parseRails,parseTitle,previousEpisode} from '../../src/movies/model';
const title={id:'movie-1',kind:'movie',name:'Arrival',year:2016,genres:['Science Fiction'],overview:'A linguist makes contact.',poster:'movies/art/arrival.svg',seasons:[]};
describe('private movie catalog',()=>{
 it('searches locally and combines type and genre filters',()=>{
  const titles=parseCatalog({titles:[title]}).titles;
  expect(filterTitles(titles,'ARRI','movie','Science Fiction')).toHaveLength(1);
  expect(filterTitles(titles,'','tv','All')).toHaveLength(0);
 });
 it('rejects remote/traversal/tracking assets and malformed entries',()=>{
  for(const path of ['https://framextv.cc/x','//other/x','movies/../secret','movies/a.svg?q=x','movies/%2e%2e/x','movies/a\\x'])expect(localAsset(path)).toBeUndefined();
  expect(parseCatalog({titles:[{...title,poster:'https://other/image'},null]}).titles).toHaveLength(0);
 });
 it('fails closed on all playback without verified rights and constrained local media',()=>{
  const valid={key:'movie-1',path:'movies/media/arrival.mp4',license:'CC-BY-4.0',credit:'Rights holder',evidence:'docs/rights/arrival.md',reviewed:true,territory:'Worldwide',expires:'2099-01-01'};
  expect(licensedSource([valid],'movie-1')?.path).toBe(valid.path);
  for(const change of [{reviewed:false},{territory:'US'},{expires:'2020-01-01'},{path:'https://other/a.mp4'},{path:'movies/art/a.svg'},{evidence:''},{license:'unknown'}])expect(licensedSource([{...valid,...change}],'movie-1')).toBeUndefined();
  expect(licensedSource([], 'movie-1')).toBeUndefined();
 });
 it('parses only bounded stable routes',()=>{
  expect(parseMovieRoute('#/movies/tv-1/season/2/episode/3/play')).toEqual({id:'tv-1',season:2,episode:3,play:true});
  expect(parseMovieRoute('#/movies/movie-1')).toEqual({id:'movie-1',play:false});
  expect(parseMovieRoute('#/movies/../../x')).toBeUndefined();
 });
});

describe('next episode',()=>{
 const show=parseCatalog({titles:[{...title,id:'tv-1',kind:'tv',seasons:[{number:3,name:'Third',episodes:[]},{number:1,name:'First',episodes:[{number:7,name:'Seven',overview:''},{number:2,name:'Two',overview:''}]},{number:2,name:'Second',episodes:[{number:4,name:'Four',overview:''}]}]}]}).titles[0];
 it('uses episode array order without mutating the title',()=>{expect(nextEpisode(show,1,7)).toEqual({season:1,episode:2,name:'Two'});expect(show.seasons.map(s=>s.number)).toEqual([3,1,2]);});
 it('rolls over through seasons sorted by number using the first listed episode',()=>{expect(nextEpisode(show,1,2)).toEqual({season:2,episode:4,name:'Four'});});
 it('uses episode one for an unloaded next season',()=>{expect(nextEpisode(show,2,4)).toEqual({season:3,episode:1,name:undefined});});
 it('returns nothing for movies, missing episodes/seasons or the final episode',()=>{for(const [season,episode] of [[9,1],[1,99],[3,1]])expect(nextEpisode(show,season,episode)).toBeUndefined();expect(nextEpisode({...show,seasons:show.seasons.filter(s=>s.number!==3)},2,4)).toBeUndefined();expect(nextEpisode({...show,kind:'movie'},1,7)).toBeUndefined();});
});

describe('section routes',()=>{
 it('parses browse and list sections without a title identifier',()=>{
  expect(parseMovieRoute('#/movies/browse/movie')).toEqual({play:false,kind:'movie'});
  expect(parseMovieRoute('#/movies/browse/tv')).toEqual({play:false,kind:'tv'});
  expect(parseMovieRoute('#/movies/list')).toEqual({play:false,kind:'list'});
 });
 it('keeps the home route exact and rejects sections that are not listed',()=>{
  expect(parseMovieRoute('#/movies')).toEqual({play:false});
  expect(parseMovieRoute('#/movies')).not.toHaveProperty('kind');
  for(const hash of ['#/movies/browse','#/movies/browse/all','#/movies/list/play','#/movies/browse/movie/play'])expect(parseMovieRoute(hash)).toBeUndefined();
 });
 it('builds one hash per section and parses each back to its section',()=>{
  expect([kindHash('all'),kindHash('movie'),kindHash('tv'),kindHash('list')]).toEqual(['#/movies','#/movies/browse/movie','#/movies/browse/tv','#/movies/list']);
  for(const kind of ['movie','tv','list'] as const)expect(parseMovieRoute(kindHash(kind))).toEqual({play:false,kind});
 });
});

describe('artwork and rich title fields',()=>{
 it('accepts TMDB w300 artwork and rejects unlisted sizes',()=>{
  expect(imageAsset('https://image.tmdb.org/t/p/w300/abc123.jpg')).toBe('https://image.tmdb.org/t/p/w300/abc123.jpg');
  expect(imageAsset('https://image.tmdb.org/t/p/w342/abc123.jpg')).toBeUndefined();
 });
 it('keeps valid episode stills, air dates and ratings and drops invalid ones',()=>{
  const still='https://image.tmdb.org/t/p/w300/still1.jpg';
  const episodes=parseCatalog({titles:[{...title,id:'tv-1',kind:'tv',seasons:[{number:1,name:'One',episodes:[
   {number:1,name:'Pilot',overview:'',still,airDate:'2020-01-02',rating:8.5},
   {number:2,name:'Bad fields',overview:'',still:'https://evil.test/s.jpg',airDate:'2020/01/03',rating:11},
   {number:3,name:'Array date',overview:'',airDate:['2020-01-04']},
  ]}]}]}).titles[0].seasons[0].episodes;
  expect(episodes[0]).toMatchObject({number:1,still,airDate:'2020-01-02',rating:8.5});
  expect(episodes[1]).toMatchObject({number:2,name:'Bad fields'});
  expect([episodes[1].still,episodes[1].airDate,episodes[1].rating]).toEqual([undefined,undefined,undefined]);
  expect(episodes[2].airDate).toBeUndefined();
 });
 it('caps cast at twelve members and drops invalid members, keeping only valid photos',()=>{
  const member=(name:string,extra:Record<string,unknown>={})=>({name,character:'Role',...extra});
  expect(parseCatalog({titles:[{...title,cast:Array.from({length:13},(_,i)=>member('Actor '+i))}]}).titles[0].cast).toHaveLength(12);
  const cast=parseCatalog({titles:[{...title,cast:[
   member('Ada',{photo:'https://image.tmdb.org/t/p/w185/ada.jpg'}),
   member(''),
   member('Long name',{name:'x'.repeat(121)}),
   member('Long role',{character:'x'.repeat(121)}),
   {name:'Bo',character:''},
   member('Di',{photo:'https://evil.test/di.jpg'}),
   null,
  ]}]}).titles[0].cast;
  expect(cast).toEqual([{name:'Ada',character:'Role',photo:'https://image.tmdb.org/t/p/w185/ada.jpg'},{name:'Bo',character:''},{name:'Di',character:'Role'}]);
  expect(cast?.[2]).not.toHaveProperty('photo');
 });
 it('caps related titles at twelve and parses them without their own cast or related lists',()=>{
  const sequel={...title,id:'movie-2',name:'Sequel',cast:[{name:'Ada',character:'Lead'}],related:[{...title,id:'movie-3'}]};
  expect(parseCatalog({titles:[{...title,related:Array.from({length:13},(_,i)=>({...title,id:'movie-'+(i+10)}))}]}).titles[0].related).toHaveLength(12);
  const [kept]=parseCatalog({titles:[{...title,related:[sequel,{id:'bad'}]}]}).titles[0].related!;
  expect(kept).toMatchObject({id:'movie-2',name:'Sequel'});
  expect(kept).not.toHaveProperty('cast');
  expect(kept).not.toHaveProperty('related');
 });
 it('adds none of the new keys when their values are absent or invalid',()=>{
  const parsed=parseCatalog({titles:[{...title,cast:'nope',related:[null],seasons:[{number:1,name:'One',episodes:[{number:1,name:'Pilot',overview:'',still:'https://evil.test/s.jpg',airDate:'2020',rating:'9'}]}]}]}).titles[0];
  expect(Object.keys(parsed)).toEqual(['id','kind','name','year','genres','overview','poster','backdrop','rating','runtime','seasons']);
  expect(Object.keys(parsed.seasons[0].episodes[0])).toEqual(['number','name','overview','runtime']);
 });
});

describe('parseTitle',()=>{
 it('parses one title and drops cast and related lists when nested',()=>{
  const full={...title,cast:[{name:'Ada',character:'Lead'}],related:[{...title,id:'movie-2'}]};
  expect(parseTitle(full)).toMatchObject({id:'movie-1',cast:[{name:'Ada',character:'Lead'}],related:[{id:'movie-2'}]});
  const nested=parseTitle(full,true);
  expect(nested).toMatchObject({id:'movie-1',name:'Arrival'});
  expect(nested).not.toHaveProperty('cast');
  expect(nested).not.toHaveProperty('related');
  expect(parseTitle({...title,id:'../x'})).toBeUndefined();
 });
});

describe('rails',()=>{
 const titleOf=(id:string)=>({...title,id});
 const rail=(id:string,titles:unknown[]=[titleOf('movie-1')])=>({id,title:'Shelf '+id,titles});
 it('drops a rail whose id does not match the rail pattern',()=>{
  expect(parseRails([rail('Bad_Id'),rail('a'.repeat(41)),rail('../x'),rail('ok'),rail('a'.repeat(40))]).map(r=>r.id)).toEqual(['ok','a'.repeat(40)]);
 });
 it('drops a rail with an empty or overlong title',()=>{
  expect(parseRails([{...rail('empty'),title:''},{...rail('long'),title:'x'.repeat(81)},rail('ok')]).map(r=>r.id)).toEqual(['ok']);
 });
 it('drops a rail that has only invalid titles',()=>{
  expect(parseRails([{id:'empty',title:'Empty',titles:[{id:'bad'},null]},rail('ok')]).map(r=>r.id)).toEqual(['ok']);
 });
 it('drops invalid titles inside a good rail',()=>{
  const [kept]=parseRails([rail('ok',[{id:'bad'},titleOf('movie-1'),null,titleOf('movie-2')])]);
  expect(kept.titles.map(t=>t.id)).toEqual(['movie-1','movie-2']);
 });
 it('de-duplicates titles, keeps at most forty per rail and at most twelve rails',()=>{
  expect(parseRails([rail('dupes',[titleOf('movie-1'),titleOf('movie-1'),titleOf('movie-2')])])[0].titles.map(t=>t.id)).toEqual(['movie-1','movie-2']);
  expect(parseRails([rail('long',Array.from({length:45},(_,i)=>titleOf('movie-'+(i+1))))])[0].titles).toHaveLength(40);
  expect(parseRails(Array.from({length:15},(_,i)=>rail('rail-'+i)))).toHaveLength(12);
 });
 it('returns no rails for a value that is not an array',()=>{
  expect(parseRails({rails:[rail('ok')]})).toEqual([]);
  expect(parseRails(undefined)).toEqual([]);
 });
});

describe('previous episode',()=>{
 const show=parseCatalog({titles:[{...title,id:'tv-1',kind:'tv',seasons:[
  {number:1,name:'First',episodes:[{number:1,name:'One',overview:''},{number:2,name:'Two',overview:''}]},
  {number:2,name:'Second',episodes:[{number:1,name:'Again',overview:''},{number:2,name:'Back',overview:''}]},
  {number:3,name:'Third',episodes:[]},
 ]}]}).titles[0];
 it('steps back within a season and across a season boundary to the last episode before it',()=>{
  expect(previousEpisode(show,2,2)).toEqual({season:2,episode:1,name:'Again'});
  expect(previousEpisode(show,2,1)).toEqual({season:1,episode:2,name:'Two'});
 });
 it('returns nothing at the first episode, for movies, unknown episodes or an unloaded previous season',()=>{
  expect(previousEpisode(show,1,1)).toBeUndefined();
  expect(previousEpisode(show,1,9)).toBeUndefined();
  expect(previousEpisode({...show,kind:'movie'},2,1)).toBeUndefined();
  expect(previousEpisode({...show,seasons:[{number:1,name:'First',episodes:[]},show.seasons[1]]},2,1)).toBeUndefined();
 });
});
