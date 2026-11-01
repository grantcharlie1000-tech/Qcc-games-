// Vercel Functions handlers (Node runtime). Bundled to dist-server/vercel.mjs and re-exported by api/[route].js.
import {createApp} from './app';
import {poolFromEnv} from './db';

const app=createApp({database:()=>poolFromEnv()});
const handle=(request:Request)=>app(request,request.headers.get('x-real-ip')??request.headers.get('x-forwarded-for')?.split(',')[0].trim()??'');
export {handle as GET,handle as POST,handle as PUT,handle as DELETE,handle as OPTIONS};
