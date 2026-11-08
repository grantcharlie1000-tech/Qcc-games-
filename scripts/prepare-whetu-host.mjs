import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Only explicit integration builds alter generated artifacts, never source headers. */
export function prepareWhetuHost(directory,flag){
 if(flag!=='on')return;
 const headersPath=join(directory,'_headers'),routesPath=join(directory,'_routes.json');
 let headers=readFileSync(headersPath,'utf8');
 if(!/frame-src\s+[^;\r\n]+/.test(headers))throw new Error('Expected frame-src directive in parent build.');
 headers=headers.replace(/frame-src\s+([^;\r\n]+)/g,(directive,sources)=>sources.split(/\s+/).includes("'self'")?directive:`frame-src 'self' ${sources}`);
 const routes=JSON.parse(readFileSync(routesPath,'utf8'));
 const manifest=JSON.parse(readFileSync(new URL('../server/whetu-routes.json',import.meta.url),'utf8'));
 const added=[...manifest.pageExact,...manifest.pages.flatMap(path=>[path,path+'/*']),...manifest.assetPrefixes.map(path=>path+'/*'),...manifest.assetExact];
 const include=[...new Set([...routes.include,...added])];
 if(include.length+(routes.exclude?.length??0)>100)throw new Error('Pages function route limit exceeded.');
 // Validate everything before writing either generated artifact.
 const updated=JSON.stringify({...routes,include},null,2)+'\n';
 writeFileSync(headersPath,headers);writeFileSync(routesPath,updated);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 prepareWhetuHost(resolve('dist'),process.env.VITE_QCC_WHETU_STUDY);
 console.log(process.env.VITE_QCC_WHETU_STUDY==='on'?'Prepared dedicated first-party Study routes and parent-frame CSP.':'Whetū integration remains off; parent headers/routes unchanged.');
}
