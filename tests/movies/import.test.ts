import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-expect-error Operator-only Node script intentionally does not ship in browser code.
import {importCatalog} from '../../scripts/movies-import.mjs';
import {parseCatalog} from '../../src/movies/model';
it('imports a static TMDB snapshot without enabling playback or sending user context',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'qcc-movies-'));
 try{
 const logo=join(dir,'logo.png');await writeFile(logo,Buffer.from([137,80,78,71,13,10,26,10]));
 const calls:string[]=[];
 const count=await importCatalog({token:'operator-test-token',logo,output:join(dir,'movies'),fetcher:async(url:string,options:any)=>{
  calls.push(url);expect(options.redirect).toBe('error');
  if(url.includes('image.tmdb.org'))return new Response('image',{headers:{'content-type':'image/jpeg'}});
  if(url.includes('trending/'))return Response.json({results:[{id:1,media_type:'tv'},{id:2,media_type:'person'}]});
  if(url.includes('/season/'))return Response.json({episodes:[{episode_number:1,name:'Episode one',overview:'An episode.'}]});
  return Response.json({name:'Example series',first_air_date:'2020-01-01',poster_path:'/abc.jpg',overview:'Original metadata',genres:[{name:'Drama'}],seasons:[{season_number:1,name:'Season 1'}],vote_count:12,vote_average:8});
 }});
 expect(count).toBe(1);const catalog=parseCatalog(JSON.parse(await readFile(join(dir,'movies/catalog.json'),'utf8')));
 expect(JSON.parse(await readFile(join(dir,'movies/catalog.json'),'utf8')).titles[0].source).toEqual({type:'third-party'});expect(catalog.source).toBe('tmdb');expect(catalog.titles[0].seasons[0].episodes[0].name).toBe('Episode one');
 expect(calls).toHaveLength(4);expect(calls.every(url=>!url.includes('search')&&!url.includes('framextv'))).toBe(true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('keeps the previous catalog on upstream failure',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'qcc-movies-'));
 try{await mkdir(join(dir,'movies'));await writeFile(join(dir,'movies/catalog.json'),'previous');await writeFile(join(dir,'logo.png'),Buffer.from([137,80,78,71,13,10,26,10]));
 await expect(importCatalog({token:'test',logo:join(dir,'logo.png'),output:join(dir,'movies'),fetcher:async()=>new Response('',{status:503})})).rejects.toThrow();
 expect(await readFile(join(dir,'movies/catalog.json'),'utf8')).toBe('previous');
 }finally{await rm(dir,{recursive:true,force:true});}
});
