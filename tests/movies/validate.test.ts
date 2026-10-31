import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const script=resolve('scripts/movies-validate.mjs');
async function validate(source:unknown){
 const dir=await mkdtemp(join(tmpdir(),'qcc-source-'));
 try{
  await mkdir(join(dir,'public/movies'),{recursive:true});
  await writeFile(join(dir,'public/movies/licenses.json'),'[]');
  await writeFile(join(dir,'public/movies/catalog.json'),JSON.stringify({titles:[{id:'movie-example',source}]}));
  return spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});
 }finally{await rm(dir,{recursive:true,force:true});}
}
it('rejects missing, unknown or incomplete archive source declarations at build time',async()=>{
 const archive={type:'archive',archiveId:'Film_1920-1.0',license:'Public domain',evidence:'Reviewed collection note'};
 for(const source of [undefined,null,{type:'unknown'},{...archive,archiveId:'../bad'},{...archive,archiveId:'x'.repeat(101)},{...archive,license:' '},{...archive,license:'x'.repeat(201)},{...archive,evidence:' '}]){
  const result=await validate(source);expect(result.status).not.toBe(0);expect(result.stderr).toContain('source');
 }
});
it('accepts explicit third-party and complete archive source declarations',async()=>{
 for(const source of [{type:'third-party'},{type:'archive',archiveId:'Film_1920-1.0',license:'Public domain',evidence:'https://archive.org/details/Film_1920-1.0'}])expect((await validate(source)).status).toBe(0);
});
