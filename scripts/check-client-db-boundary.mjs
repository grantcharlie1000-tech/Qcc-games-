import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
async function check(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);
  if(entry.isDirectory()){await check(path);continue;}
  if(!/\.(?:js|map|html|json)$/.test(path))continue;
  const text=await readFile(path,'utf8');
  if(/postgres(?:ql)?:\/\/|DATABASE_URL|QCC_DB_EXPECTED_ENV|pg-protocol|node-postgres|SASL: SCRAM|netlify\/lib\/db|scripts\/db-connection/.test(text))throw new Error('Server database code or configuration found in client output');
 }
}
await check('dist');console.log('Client database boundary verified.');
