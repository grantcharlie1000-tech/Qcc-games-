import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
// Globle's globe.gl dependencies import large modules for features it never uses; see the stub file.
const unused=fileURLToPath(new URL('./src/games/globle/unused-stubs.ts',import.meta.url));
export default defineConfig({cacheDir:'.vite-cache',base:'./',resolve:{alias:[{find:/^(three\/webgpu|three\/tsl|h3-js)$/,replacement:unused}]},build:{target:'es2022',sourcemap:true,manifest:true},server:{host:'0.0.0.0'},test:{include:['tests/**/*.test.ts'],environment:'node'}} as any);
