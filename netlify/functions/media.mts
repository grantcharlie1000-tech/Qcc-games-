import type {Config} from '@netlify/functions';
import {fetchUpstream} from './lib/media-security';
import {handleMedia} from './lib/media-relay';

export default (req: Request) => handleMedia(req, Netlify.env.get('MOVIES_RELAY_SECRET') ?? '', fetchUpstream);
export const config: Config = {
  path: '/api/media',
  rateLimit: {action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 900},
};
