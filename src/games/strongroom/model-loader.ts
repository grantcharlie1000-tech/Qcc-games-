import {TextureLoader} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
// @ts-expect-error -- meshoptimizer's official MIT JavaScript decoder, vendored for CSP compatibility.
import {MeshoptDecoder} from './engine/gfx/operators/meshopt-decoder.js';
/** Embedded GLB palettes use img-src blob:, which the existing site policy allows.
 * Decoding is a one-time boot operation; no dynamic code or Wasm permission is needed. */
export function modelLoader(){return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(parser=>{
 const imageLoader=new TextureLoader(parser.options.manager);imageLoader.setCrossOrigin('anonymous');
 (parser as unknown as {textureLoader:TextureLoader}).textureLoader=imageLoader;
 return{name:'StrongroomEmbeddedPalette'};
});}
