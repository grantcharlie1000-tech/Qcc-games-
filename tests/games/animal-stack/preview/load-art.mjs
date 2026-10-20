// Bundles the TypeScript art/species modules for Node scripts (no dev server needed).
import {build} from 'esbuild';
export async function loadArt(){
 const out=await build({stdin:{contents:"export * from './art';export {SPECIES} from './species';",resolveDir:'src/games/animal-stack',loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,external:['matter-js']});
 return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
}
