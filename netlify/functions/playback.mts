import type {Config} from '@netlify/functions';
import {MEDIA_PROVIDERS, ProviderError} from './lib/media-types';
import type {PlaybackRequest, ResolvedMedia, UpstreamTransport} from './lib/media-types';
import {resolveProvider} from './lib/media-providers';
import {fetchUpstream, headersForTarget, validateMediaUrl} from './lib/media-security';
import {mediaPath} from './lib/media-tokens';

const HEADERS = {'cache-control': 'private, no-store', 'netlify-cdn-cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff'};
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: HEADERS});
type Resolver = (input: PlaybackRequest, signal: AbortSignal) => Promise<ResolvedMedia>;

function playbackRequest(url: URL): PlaybackRequest | undefined {
  const p = url.searchParams;
  if ([...p.keys()].some(key => !['provider', 'type', 'id', 'season', 'episode'].includes(key) || p.getAll(key).length !== 1)) return;
  const provider = p.get('provider'), kind = p.get('type');
  const integer = (key: string, max: number) => {
    const value = p.get(key); if (!value || !/^[1-9]\d*$/.test(value)) return;
    const number = Number(value); return Number.isSafeInteger(number) && number <= max ? number : undefined;
  };
  const id = integer('id', 99_999_999), season = integer('season', 999), episode = integer('episode', 9999);
  if (!MEDIA_PROVIDERS.includes(provider as any) || !['movie', 'tv'].includes(kind ?? '') || !id || kind === 'tv' && (!season || !episode) || kind === 'movie' && (p.has('season') || p.has('episode'))) return;
  return {provider: provider as PlaybackRequest['provider'], kind: kind as PlaybackRequest['kind'], id, ...(kind === 'tv' ? {season, episode} : {})};
}

async function defaultResolver(input: PlaybackRequest, signal: AbortSignal): Promise<ResolvedMedia> {
  const transport: UpstreamTransport = (url, options = {}) => fetchUpstream(url, {...options, signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal});
  return resolveProvider(input, transport, async request => {
    const {resolveBrowserProvider} = await import('./lib/media-browser');
    return resolveBrowserProvider(request, transport, signal);
  });
}

export async function handlePlayback(req: Request, secret: string, resolve: Resolver = defaultResolver): Promise<Response> {
  if (req.method !== 'GET') return json({error: 'method_not_allowed'}, 405);
  const input = playbackRequest(new URL(req.url));
  if (!input) return json({error: 'invalid_playback_request', message: 'Choose a valid title and source.'}, 400);
  if (secret.length < 32) return json({error: 'playback_not_configured', message: 'Streaming is temporarily unavailable.'}, 503);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  const signal = AbortSignal.any([req.signal, controller.signal]);
  try {
    const expired = new Promise<never>((_resolve, reject) => {
      if (signal.aborted) reject(new Error('Playback cancelled'));
      else signal.addEventListener('abort', () => reject(new Error('Playback cancelled')), {once: true});
    });
    const result = await Promise.race([resolve(input, signal), expired]);
    if (!['hls', 'mp4', 'webm'].includes(result.type)) throw new ProviderError('unsupported', 'Unsupported source');
    const url = validateMediaUrl(result.url), headerOrigin = url.origin;
    const source = {url: mediaPath({url: url.href, provider: input.provider, purpose: result.type === 'hls' ? 'playlist' : 'file', headers: result.headers, headerOrigin}, secret), type: result.type};
    const subtitles = (result.subtitles ?? []).slice(0, 40).flatMap(track => {
      try {
        const target = validateMediaUrl(track.url);
        return [{src: mediaPath({url: target.href, provider: input.provider, purpose: 'subtitle', headers: headersForTarget(result.headers, headerOrigin, target), headerOrigin}, secret), label: String(track.label).slice(0, 80), srclang: /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(track.language) ? track.language : 'und'}];
      } catch {return [];}
    });
    return json({provider: input.provider, source, subtitles});
  } catch (error) {
    if (signal.aborted) return json({error: 'source_timeout', message: 'This source took too long. Try another source.'}, 504);
    if (error instanceof ProviderError && error.code === 'verification_required') return json({error: error.code, message: 'This source requires human verification. Try another source.'}, 424);
    if (error instanceof ProviderError && error.code === 'unsupported') return json({error: error.code, message: 'This source has no compatible stream. Try another source.'}, 422);
    return json({error: 'source_unavailable', message: 'This source is unavailable. Try another source.'}, 502);
  } finally {clearTimeout(timer); controller.abort();}
}

export default (req: Request) => handlePlayback(req, Netlify.env.get('MOVIES_RELAY_SECRET') ?? '');
export const config: Config = {
  path: '/api/playback', method: 'GET',
  rateLimit: {action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 30},
};
