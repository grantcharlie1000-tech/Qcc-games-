import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
// Globle's globe.gl dependencies import large modules for features it never uses; see the stub file.
const unused=fileURLToPath(new URL('./src/games/globle/unused-stubs.ts',import.meta.url));
const contentSecurityPolicy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://image.tmdb.org; connect-src 'self' https://0.peerjs.com wss://0.peerjs.com; worker-src 'self'; media-src 'self' blob:; frame-src 'self'; form-action 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";
const securityHeaders={'Content-Security-Policy':contentSecurityPolicy};
export default defineConfig({cacheDir:'.vite-cache',base:'./',resolve:{alias:[{find:/^(three\/webgpu|three\/tsl|h3-js)$/,replacement:unused}]},build:{target:'es2022',sourcemap:true,manifest:true,rollupOptions:{input:{main:fileURLToPath(new URL('./index.html',import.meta.url)),player:fileURLToPath(new URL('./movies/player.html',import.meta.url))}}},server:{host:'0.0.0.0',headers:securityHeaders},preview:{headers:securityHeaders},test:{include:['tests/**/*.test.ts'],environment:'node'}} as any);
