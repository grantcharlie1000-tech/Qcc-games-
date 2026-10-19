import { defineConfig } from 'vite';
export default defineConfig({base:'./',build:{target:'es2022',sourcemap:true,manifest:true},server:{host:'0.0.0.0'},test:{include:['tests/**/*.test.ts'],environment:'node'}} as any);
