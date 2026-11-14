/** @vitest-environment happy-dom */
import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {MoviesView} from '../../src/movies/view';
import {MovieStorage} from '../../src/movies/storage';
import {handleMoviesCatalog} from '../../server/movies-catalog';

const views:MoviesView[]=[];
afterEach(()=>{for(const view of views.splice(0))view.dispose();document.body.replaceChildren();localStorage.clear();vi.unstubAllGlobals();});
it.each(['off','christmas'])('shows Christmas on Home and Movies with artwork %s without affecting filtered results or TV',async theme=>{
 document.documentElement.dataset.festive=theme;
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(String(input),'https://qcc.test');
  if(url.pathname.includes('movies/catalog.json'))return Response.json(JSON.parse(readFileSync('public/movies/catalog.json','utf8')));
  if(url.pathname.includes('movies/licenses.json'))return Response.json([]);
  if(url.pathname.includes('api/movie-popularity'))return Response.json({titleIds:[]});
  return handleMoviesCatalog(new Request(url),'fixture',async input=>{
   const keyword=new URL(String(input)).searchParams.has('with_keywords');
   return Response.json({results:[{id:keyword?771:99,media_type:'movie',title:keyword?'Home Alone':'Other movie',poster_path:'/movie.jpg',genre_ids:[35],overview:'Fixture'}]});
  });
 }));
 const container=document.createElement('main');document.body.append(container);
 const view=new MoviesView(container,new MovieStorage(),()=>{},true);views.push(view);
 const rail=()=>container.querySelector('[data-rail="christmas"]');
 await vi.waitFor(()=>expect(rail()?.querySelector('[data-title="movie-771"]')?.getAttribute('href')).toBe('#/movies/movie-771'));
 view.navigate('#/movies/browse/movie');
 await vi.waitFor(()=>expect(rail()).not.toBeNull());
 const search=container.querySelector<HTMLInputElement>('#movies-search')!;
 search.value='Other';search.dispatchEvent(new Event('input',{bubbles:true}));
 expect(rail()).toBeNull();
 search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));
 await vi.waitFor(()=>expect(rail()).not.toBeNull());
 view.navigate('#/movies/browse/tv');
 await vi.waitFor(()=>expect(container.querySelector('.movies-page-title')?.textContent).toBe('TV Shows'));
 expect(rail()).toBeNull();
});
