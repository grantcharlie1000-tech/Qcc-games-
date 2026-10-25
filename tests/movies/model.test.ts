import {describe,it,expect} from 'vitest';
import {filterTitles,parseCatalog,parseMovieRoute,licensedSource,localAsset} from '../../src/movies/model';
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
