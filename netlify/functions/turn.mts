import type {Config,Context} from '@netlify/functions';
import {createTurnHandler} from '../../src/multiplayer/turn-server';
// Set CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN in the Netlify site's environment variables (Functions scope).
const handle=createTurnHandler({keyId:process.env.CLOUDFLARE_TURN_KEY_ID,apiToken:process.env.CLOUDFLARE_TURN_API_TOKEN});
export default (request:Request,context:Context)=>handle(request,context.ip);
export const config:Config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:20}};
