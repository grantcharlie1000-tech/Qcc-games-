import {describe,it,expect} from 'vitest';
import {filterTitles,parseCatalog,parseMovieRoute,licensedSource,localAsset,nextEpisode} from '../../src/movies/model';
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
