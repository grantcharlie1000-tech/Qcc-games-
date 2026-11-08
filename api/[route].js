// Vercel function for every /api/<route>. The build (npm run build:server) bundles server/vercel.ts, so this
// file stays plain JavaScript and Vercel never has to resolve the TypeScript sources itself.
export {GET,POST,PUT,DELETE,OPTIONS} from '../dist-server/vercel.mjs';
