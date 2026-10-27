import {ProviderError, type MediaType, type PlaybackRequest, type ResolvedMedia, type UpstreamTransport} from './media-types';

export type BrowserResolver = (input: PlaybackRequest) => Promise<ResolvedMedia>;

// These are provider control-plane hosts observed in their public player clients.
// Media URLs are separately checked by the relay's SSRF-resistant transport.
export const PROVIDER_CONTROL_HOSTS = [
  'api.framextv.cc', 'vixsrc.to', 'vidlink.pro', 'vidsrc.sh',
  'stellarconductornexus.com', 'data.vidsrc.sh',
] as const;

const LIMIT = 256 * 1024;
const VIX_HEADERS = {Referer:'https://vixsrc.to/', Origin:'https://vixsrc.to'};
const VS_PLAYER_HOSTS = ['stellarconductornexus.com', 'vidsrc.sh'];
type JsonObject = Record<string, unknown>;

function unavailable(): never {
  throw new ProviderError('unavailable', 'This provider did not return a playable source.');
}

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
}

function https(value: unknown, base?: URL): URL | undefined {
  if (typeof value !== 'string' || !value || value.length > 16384) return;
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) return;
    return url;
  } catch { return; }
}

function fixedUrl(value: unknown, hosts: readonly string[], base?: URL): URL {
  const url = https(value, base);
  if (!url || !hosts.includes(url.hostname)) return unavailable();
  return url;
}

async function read(transport: UpstreamTransport, url: URL, headers: Record<string, string> = {}): Promise<string> {
  const response = await transport(url, {headers:{Accept:'application/json, text/html;q=0.9', ...headers}, maxBytes:LIMIT});
  if (!response.ok) {
    if (response.status === 401) throw new ProviderError('verification_required', 'This provider requires verification.');
    return unavailable();
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).length > LIMIT) return unavailable();
  return text;
}

function parseJson(text: string): JsonObject {
  try { return object(JSON.parse(text)) ?? unavailable(); } catch { return unavailable(); }
}

// Extract only an assigned object literal. Never evaluate upstream JavaScript.
// The scanner respects strings, preventing braces inside URLs/text from ending it.
function assignedObject(text: string, name: string): string | undefined {
  const match = new RegExp(`window\\.${name}\\s*=\\s*\\{`).exec(text);
  if (!match) return;
  const start = match.index + match[0].lastIndexOf('{');
  let depth = 0, quote = '', escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return text.slice(start, i + 1);
  }
}

function literalProperty(text: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|[,{\\s])(?:["']${name}["']|${name})\\s*:\\s*(["'])([^"'\\r\\n]*)\\1`).exec(text);
  return match?.[2].replace(/\\\//g, '/');
}

function inferType(url: URL, declared?: unknown): MediaType | undefined {
  if (typeof declared === 'string') {
    const normalized = declared.toLowerCase();
    if (normalized === 'dash' || normalized.includes('mpd')) return;
    if (normalized === 'hls' || normalized === 'application/vnd.apple.mpegurl' || normalized === 'application/x-mpegurl') return 'hls';
    if (normalized === 'mp4' || normalized === 'video/mp4') return 'mp4';
    if (normalized === 'webm' || normalized === 'video/webm') return 'webm';
  }
  if (/\.m3u8$/i.test(url.pathname)) return 'hls';
  if (/\.mp4$/i.test(url.pathname)) return 'mp4';
  if (/\.webm$/i.test(url.pathname)) return 'webm';
}

function captions(value: unknown): NonNullable<ResolvedMedia['subtitles']> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap(item => {
    const entry = object(item), url = https(entry?.url);
    // HTML video tracks understand WebVTT. Do not promise raw SRT support.
    if (!entry || !url || (!/\.vtt$/i.test(url.pathname) && entry.format !== 'vtt')) return [];
    const label = typeof entry.label === 'string' ? entry.label.slice(0, 100) : 'Subtitles';
    const language = typeof entry.language === 'string' ? entry.language : typeof entry.lang === 'string' ? entry.lang : 'und';
    return [{url:url.href, label, language:/^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(language) ? language : 'und'}];
  });
}

function sourceHeaders(value: unknown): Record<string, string> | undefined {
  const raw = object(value);
  if (!raw) return;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalized = key.toLowerCase();
    if (normalized !== 'referer' && normalized !== 'origin') continue;
    const url = https(value);
    if (!url) continue;
    headers[normalized === 'referer' ? 'Referer' : 'Origin'] = normalized === 'origin' ? url.origin : url.href;
  }
  return Object.keys(headers).length ? headers : undefined;
}

async function framextv(input: PlaybackRequest, transport: UpstreamTransport): Promise<ResolvedMedia> {
  const url = new URL('https://api.framextv.cc/api/stream');
  url.searchParams.set('type', input.kind);
  url.searchParams.set('id', String(input.id));
  if (input.kind === 'tv') {
    url.searchParams.set('season', String(input.season));
    url.searchParams.set('episode', String(input.episode));
  }
  const data = parseJson(await read(transport, url));
  if (data.success === false || !Array.isArray(data.sources)) return unavailable();
  for (const item of data.sources.slice(0, 20)) {
    const source = object(item), media = https(source?.url);
    if (!source || !media) continue;
    const type = inferType(media, source.type);
    if (!type) continue;
    return {url:media.href, type, subtitles:captions(data.subtitles), headers:sourceHeaders(source.headers)};
  }
  throw new ProviderError('unsupported', 'This provider has no compatible media format.');
}

async function vixsrc(input: PlaybackRequest, transport: UpstreamTransport): Promise<ResolvedMedia> {
  const episode = input.kind === 'tv' ? `/${input.season}/${input.episode}` : '';
  const api = new URL(`https://vixsrc.to/api/${input.kind}/${input.id}${episode}`);
  api.searchParams.set('autoplay', 'false');
  // Its embed token expires quickly; a fresh API response avoids stale CDN HTML.
  api.searchParams.set('_relay', String(Date.now()));
  const data = parseJson(await read(transport, api, VIX_HEADERS));
  const embed = fixedUrl(data.src, ['vixsrc.to'], api);
  if (!/^\/embed\/[1-9]\d*$/.test(embed.pathname)) return unavailable();
  const html = await read(transport, embed, VIX_HEADERS);
  const config = assignedObject(html, 'masterPlaylist');
  if (!config) return unavailable();
  const playlist = fixedUrl(literalProperty(config, 'url'), ['vixsrc.to']);
  if (!/^\/playlist\/[1-9]\d*$/.test(playlist.pathname)) return unavailable();
  const token = literalProperty(config, 'token'), expires = literalProperty(config, 'expires'), asn = literalProperty(config, 'asn');
  if (!token || !/^[A-Za-z0-9_.~-]{1,1024}$/.test(token) || !expires || !/^\d{9,12}$/.test(expires)) return unavailable();
  playlist.searchParams.set('token', token);
  playlist.searchParams.set('expires', expires);
  if (asn && /^\d{1,10}$/.test(asn)) playlist.searchParams.set('asn', asn);
  // These are the parameters used by the provider's own vixsrc player script.
  playlist.searchParams.set('h', '1');
  playlist.searchParams.set('lang', 'en');
  return {url:playlist.href, type:'hls', headers:VIX_HEADERS};
}

async function vidsrc(input: PlaybackRequest, transport: UpstreamTransport): Promise<ResolvedMedia> {
  const api = new URL('https://vidsrc.sh/vs_src.php');
  api.searchParams.set('type', input.kind);
  api.searchParams.set('id', String(input.id));
  if (input.kind === 'tv') {
    api.searchParams.set('season', String(input.season));
    api.searchParams.set('episode', String(input.episode));
  }
  api.searchParams.set('autoplay', '0');
  const data = parseJson(await read(transport, api, {Referer:'https://vidsrc.sh/'}));
  const landing = fixedUrl(data.src, VS_PLAYER_HOSTS);
  if (!landing.pathname.startsWith('/embed/')) return unavailable();
  const headers = {Referer:`${landing.origin}/`, Origin:landing.origin};
  const landingHtml = await read(transport, landing, {Referer:'https://vidsrc.sh/'});
  const landingConfig = assignedObject(landingHtml, 'CFG');
  if (!landingConfig) return unavailable();
  const next = fixedUrl(parseJson(landingConfig).playerUrl, [landing.hostname], landing);
  if (!next.pathname.startsWith('/embed/player/')) return unavailable();
  const html = await read(transport, next, headers);
  const literal = assignedObject(html, 'CONFIG');
  if (!literal) return unavailable();
  const config = parseJson(literal);
  if (config.turnstile === true) throw new ProviderError('verification_required', 'This provider requires verification.');
  let endpoint = config.api;
  if (input.kind === 'tv' && typeof config.streamBase === 'string') {
    const base = fixedUrl(config.streamBase, ['data.vidsrc.sh']);
    base.searchParams.set('season', String(input.season));
    base.searchParams.set('episode', String(input.episode));
    base.searchParams.set('stream_urls', '');
    endpoint = base.href;
  }
  const streamApi = fixedUrl(endpoint, ['data.vidsrc.sh']);
  if (streamApi.pathname !== '/api.php') return unavailable();
  if (typeof config.apiToken === 'string' && config.apiToken.length <= 4096) streamApi.searchParams.set('api_token', config.apiToken);
  const response = parseJson(await read(transport, streamApi, headers));
  if (response.status_code && String(response.status_code) !== '200') return unavailable();
  const mediaData = object(response.data), streams = mediaData?.stream_urls;
  // Encrypted browser-only metadata is not executed in this server process.
  // A verification gate is never skipped, and no decoder/DRM code is evaluated.
  if (!Array.isArray(streams)) throw new ProviderError('unsupported', 'This provider requires an unsupported playback protocol.');
  for (const candidate of streams.slice(0, 20)) {
    const url = https(candidate);
    if (!url || url.href.includes('__TOKEN__')) continue;
    const type = inferType(url);
    if (type) return {url:url.href, type, headers};
  }
  throw new ProviderError('unsupported', 'This provider has no compatible media format.');
}

export async function resolveProvider(input: PlaybackRequest, transport: UpstreamTransport, browserResolver?: BrowserResolver): Promise<ResolvedMedia> {
  const validInteger = (value: unknown, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max;
  if (!validInteger(input.id, 999999999) || !['movie','tv'].includes(input.kind)
    || (input.kind === 'tv' && (!validInteger(input.season, 999) || !validInteger(input.episode, 9999)))) return unavailable();
  switch (input.provider) {
    case 'framextv': return framextv(input, transport);
    case 'vixsrc': return vixsrc(input, transport);
    case 'vidsrc': return vidsrc(input, transport);
    case 'vidlink':
      if (!browserResolver) throw new ProviderError('unsupported', 'This provider needs the server browser resolver.');
      return browserResolver(input);
    default: return unavailable();
  }
}
