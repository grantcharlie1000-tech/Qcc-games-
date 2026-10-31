/** Operator-only snapshot job. Never import this from runtime code or a request handler. */
import {mkdir,writeFile,readFile,rename,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function importCatalog({token,logo,output='public/movies',fetcher=fetch,now=new Date()}){
 if(!token||!logo)throw new Error('Set TMDB_READ_TOKEN and TMDB_LOGO_PATH to an approved local TMDB attribution logo. Review TMDB terms first.');
 const logoBytes=await readFile(logo);
 if(!/\.png$/i.test(logo)||!logoBytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Use an approved, unmodified TMDB PNG logo.');
 const request=async url=>{const r=await fetcher(url,{headers:{Authorization:`Bearer ${token}`},redirect:'error'});if(!r.ok)throw new Error(`TMDB import failed (${r.status})`);return r;};
 const api=async path=>(await request('https://api.themoviedb.org/3/'+path)).json();
 const trending=await api('trending/all/week?language=en-US');
 const staged=output+'-staging';await mkdir(staged+'/art',{recursive:true});
 try {
 const titles=[];
 for(const item of (trending.results||[]).filter(x=>['movie','tv'].includes(x.media_type)&&!x.adult).slice(0,24)){
  const kind=item.media_type;if(!Number.isSafeInteger(item.id)||item.id<1)continue;
  const d=await api(`${kind}/${item.id}?language=en-US`);
  if(d.adult||!/^\/[a-zA-Z0-9]+\.(jpg|png)$/.test(d.poster_path||''))continue;
  const poster=`movies/art/${kind}-${item.id}.jpg`;
  const response=await fetcher(`https://image.tmdb.org/t/p/w500${d.poster_path}`,{redirect:'error'});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error('Poster import failed');
  const image=Buffer.from(await response.arrayBuffer());if(image.length>5_000_000)throw new Error('Poster exceeds size limit');
  await writeFile(staged+`/art/${kind}-${item.id}.jpg`,image);
  let backdrop;
  if(/^\/[a-zA-Z0-9]+\.(jpg|png)$/.test(d.backdrop_path||'')){
   const response=await fetcher(`https://image.tmdb.org/t/p/w1280${d.backdrop_path}`,{redirect:'error'});
   if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error('Backdrop import failed');
   const image=Buffer.from(await response.arrayBuffer());if(image.length>5_000_000)throw new Error('Backdrop exceeds size limit');
   backdrop=`movies/art/${kind}-${item.id}-backdrop.jpg`;await writeFile(staged+`/art/${kind}-${item.id}-backdrop.jpg`,image);
  }
  const seasons=[];
  for(const s of (kind==='tv'?d.seasons||[]:[]).filter(s=>Number.isInteger(s.season_number)&&s.season_number>0).slice(0,30)){
   const data=await api(`tv/${item.id}/season/${s.season_number}?language=en-US`);
   seasons.push({number:s.season_number,name:s.name,episodes:(data.episodes||[]).map(e=>({number:e.episode_number,name:e.name,overview:e.overview||'',runtime:e.runtime}))});
  }
  titles.push({source:{type:'third-party'},id:`${kind}-${item.id}`,kind,name:d.title||d.name,year:Number((d.release_date||d.first_air_date||'').slice(0,4)),genres:(d.genres||[]).map(g=>g.name),overview:d.overview||'No description supplied.',poster,backdrop,rating:d.vote_count>0?d.vote_average:undefined,runtime:d.runtime,seasons});
 }
 if(!titles.length)throw new Error('No titles imported; previous catalog preserved');
 await writeFile(staged+'/art/tmdb-logo.png',logoBytes);
 // Artwork is written before the catalog switch; a failed import never publishes partial metadata.
 await mkdir(output+'/art',{recursive:true});
 const {readdir,copyFile}=await import('node:fs/promises');
 for(const name of await readdir(staged+'/art'))await copyFile(staged+'/art/'+name,output+'/art/'+name);
 await writeFile(staged+'/catalog.json',JSON.stringify({source:'tmdb',updated:now.toISOString(),attributionLogo:'movies/art/tmdb-logo.png',trending:titles.map(t=>t.id),titles},null,2)+'\n');
 await rename(staged+'/catalog.json',output+'/catalog.json');
 return titles.length;
 }finally{await rm(staged,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(`Imported ${await importCatalog({token:process.env.TMDB_READ_TOKEN,logo:process.env.TMDB_LOGO_PATH})} titles. Review media rights separately; metadata never enables playback.`);}catch(error){console.error(error.message);process.exitCode=1;}
}
