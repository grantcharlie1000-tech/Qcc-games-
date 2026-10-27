import {createServer, type Server} from 'node:http';
import type {Browser, HTTPRequest} from 'puppeteer-core';
import {ProviderError, type PlaybackRequest, type ResolvedMedia, type UpstreamTransport} from './media-types';
import {RELAY_USER_AGENT, UpstreamLimitError} from './media-security';

const RESOLUTION_MS = 25_000;
const MAX_RESOURCE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_CONCURRENT_REQUESTS = 4;
const BOOTSTRAP_HOSTS = new Set(['vidlink.pro', 'cdn.jwplayer.com', 'cdn.jsdelivr.net']);
const SOURCE_HEADER_NAMES = new Set(['cookie', 'referer', 'origin', 'user-agent']);
const LANGUAGE_CODES: Record<string, string> = {
  English: 'en', Spanish: 'es', Español: 'es', French: 'fr', Français: 'fr',
  German: 'de', Deutsch: 'de', Italian: 'it', Italiano: 'it', Portuguese: 'pt',
  Português: 'pt', Japanese: 'ja', Korean: 'ko', Chinese: 'zh', Hindi: 'hi',
  Arabic: 'ar', Russian: 'ru', Turkish: 'tr', Dutch: 'nl', Polish: 'pl',
};
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === 'object' && !Array.isArray(value);

function mediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) return;
    return url.href;
  } catch { return; }
}

function sourceHeaders(value: unknown): Record<string, string> | undefined {
  if (value === undefined || value === null) return;
  if (!object(value)) throw new ProviderError('unavailable', 'The provider supplied invalid playback metadata.');
  const headers: Record<string, string> = {};
  let size = 0;
  for (const [name, item] of Object.entries(value)) {
    if (typeof item !== 'string' || /[\0\r\n]/.test(name + item)) throw new ProviderError('unavailable', 'The provider supplied invalid playback metadata.');
    const key = name.toLowerCase();
    if (!SOURCE_HEADER_NAMES.has(key)) continue;
    size += item.length;
    if (size > 8192) throw new ProviderError('unavailable', 'The provider supplied invalid playback metadata.');
    headers[key] = item;
  }
  return Object.keys(headers).length ? headers : undefined;
}

function captions(value: unknown): NonNullable<ResolvedMedia['subtitles']> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 80).flatMap(item => {
    if (!object(item) || !['vtt', 'srt'].includes(String(item.type))) return [];
    const url = mediaUrl(item.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const label = typeof item.language === 'string' ? item.language.slice(0, 80) : 'Subtitles';
    const language = LANGUAGE_CODES[label] ?? (/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(label) ? label : 'und');
    return [{url, label, language}];
  }).slice(0, 40);
}

/** Parse the public /api/b response; never execute provider code in the visitor's browser. */
export function parseVidLinkMedia(value: unknown): ResolvedMedia {
  if (!object(value) || !object(value.stream)) throw new ProviderError('unavailable', 'VidLink could not find this title.');
  const stream = value.stream;
  if (stream.drm || stream.drmInfo || stream.licenseUrl || (Array.isArray(stream.flags) && stream.flags.includes('drm-protected'))) {
    throw new ProviderError('unsupported', 'This source requires protected playback.');
  }
  const subtitles = captions(stream.captions);
  const playlist = mediaUrl(stream.playlist);
  const withSource = (url: string, type: 'hls' | 'mp4' | 'webm', headers?: unknown): ResolvedMedia => {
    const parsedHeaders = sourceHeaders(headers);
    return {url, type, ...(parsedHeaders ? {headers: parsedHeaders} : {}), ...(subtitles.length ? {subtitles} : {})};
  };
  if (playlist && (stream.deliveryType === 'hls' || (!stream.deliveryType && /\.m3u8(?:\?|$)/i.test(playlist)))) {
    return withSource(playlist, 'hls', stream.playlistHeaders);
  }
  if (object(stream.alternates)) {
    for (const alternate of Object.values(stream.alternates)) {
      if (!object(alternate) || alternate.type !== 'hls' || alternate.drm) continue;
      const url = mediaUrl(alternate.playlist);
      if (url) return withSource(url, 'hls', alternate.headers);
    }
  }
  if (object(stream.qualities)) {
    const choices = Object.entries(stream.qualities).flatMap(([quality, item]) => {
      if (!object(item) || !['mp4', 'webm'].includes(String(item.type)) || item.drm) return [];
      const url = mediaUrl(item.url);
      if (!url) return [];
      const codec = typeof item.codecName === 'string' ? item.codecName.toLowerCase() : '';
      return [{url, item, quality: Number.parseInt(quality, 10) || 0, hevc: /hevc|h265|hvc1|hev1/.test(codec) ? 1 : 0}];
    }).sort((a, b) => a.hevc - b.hevc || b.quality - a.quality);
    const chosen = choices[0];
    if (chosen) return withSource(chosen.url, chosen.item.type as 'mp4' | 'webm', chosen.item.headers);
  }
  if (stream.deliveryType === 'dash') throw new ProviderError('unsupported', 'This source only offers a format this player cannot relay.');
  throw new ProviderError('unavailable', 'VidLink could not find a playable source for this title.');
}

function embedUrl(input: PlaybackRequest): URL {
  if (input.provider !== 'vidlink') throw new ProviderError('unsupported', 'This provider does not use the browser resolver.');
  const integer = (value: unknown, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= max;
  if (!integer(input.id, 99_999_999) || !['movie', 'tv'].includes(input.kind) ||
      (input.kind === 'tv' && (!integer(input.season, 999) || !integer(input.episode, 9999)))) {
    throw new ProviderError('unavailable', 'The playback request is invalid.');
  }
  return new URL(input.kind === 'movie'
    ? `https://vidlink.pro/movie/${input.id}?autoplay=false`
    : `https://vidlink.pro/tv/${input.id}/${input.season}/${input.episode}?autoplay=false`);
}

async function denyNetworkProxy(): Promise<{server: Server; url: string}> {
  // Interception handles the approved HTTP requests. Anything missed, including
  // WebSockets or a popup, hits this denying proxy rather than the local network.
  const server = createServer((_request, response) => { response.writeHead(403); response.end(); });
  server.on('connect', (_request, socket) => socket.destroy());
  server.on('upgrade', (_request, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  server.unref();
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); throw new Error('Could not isolate the browser network.'); }
  return {server, url: `http://127.0.0.1:${address.port}`};
}

interface TransferBudget {
  signal: AbortSignal;
  consume: (size: number) => void;
  exhausted: () => void;
}

async function bodyWithinLimit(response: Response, limit: number, budget: TransferBudget): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      budget.signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new UpstreamLimitError();
      budget.consume(next.value.byteLength);
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof UpstreamLimitError) budget.exhausted();
    await reader.cancel().catch(() => {}); throw error;
  }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

const aborted = (signal: AbortSignal): Promise<never> => new Promise((_resolve, reject) => {
  const fail = () => reject(new ProviderError('unavailable', 'VidLink took too long to find a source.'));
  if (signal.aborted) fail(); else signal.addEventListener('abort', fail, {once: true});
});

/** Normal public VidLink bootstrap in an ephemeral server-side browser. */
export async function resolveBrowserProvider(input: PlaybackRequest, transport: UpstreamTransport, signal?: AbortSignal): Promise<ResolvedMedia> {
  const entry = embedUrl(input);
  if (signal?.aborted) throw new ProviderError('unavailable', 'Playback resolution was cancelled.');
  const controller = new AbortController();
  const cancelFromCaller = () => controller.abort();
  signal?.addEventListener('abort', cancelFromCaller, {once: true});
  const timer = setTimeout(() => controller.abort(), RESOLUTION_MS);
  timer.unref();
  const abortResult = aborted(controller.signal);
  // Attach immediately: an abort during browser startup must not produce an
  // unhandled rejection while executable extraction is still completing.
  void abortResult.catch(() => {});
  let browser: Browser | undefined;
  let proxy: Awaited<ReturnType<typeof denyNetworkProxy>> | undefined;
  try {
    const [puppeteer, chromium] = await Promise.race([
      Promise.all([import('puppeteer-core'), import('@sparticuz/chromium')]), abortResult,
    ]);
    proxy = await denyNetworkProxy();
    const executablePath = process.env.MEDIA_BROWSER_EXECUTABLE || await Promise.race([chromium.default.executablePath(), abortResult]);
    const args = chromium.default.args.filter(arg => !arg.startsWith('--proxy-') && arg !== '--disable-web-security');
    args.push(`--proxy-server=${proxy.url}`, '--proxy-bypass-list=<-loopback>',
      '--host-resolver-rules=MAP * ~NOTFOUND', '--dns-prefetch-disable',
      '--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
    browser = await puppeteer.default.launch({executablePath, args, headless: true, signal: controller.signal, timeout: 12_000, protocolTimeout: 12_000});
    // A fresh Chromium process already owns a fresh temporary profile. Its
    // default context also works with the Lambda binary's single-process mode,
    // where opening an additional incognito context can crash Chromium.
    const context = browser.defaultBrowserContext();
    const page = await context.newPage();
    await page.setUserAgent(RELAY_USER_AGENT);
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    let settled = false;
    let requestCount = 0;
    let totalBytes = 0;
    let complete!: (result: ResolvedMedia) => void;
    let fail!: (error: Error) => void;
    const result = new Promise<ResolvedMedia>((resolve, reject) => {
      complete = value => { if (!settled) { settled = true; resolve(value); } };
      fail = error => { if (!settled) { settled = true; reject(error); controller.abort(); } };
    });
    const budget: TransferBudget = {
      signal: controller.signal,
      consume(size) {
        controller.signal.throwIfAborted();
        totalBytes += size;
        if (totalBytes > MAX_TOTAL_BYTES) throw new UpstreamLimitError();
      },
      exhausted: () => fail(new ProviderError('unavailable', 'VidLink exceeded the resolution size limit.')),
    };
    let activeRequests = 0;
    const waiting: {accept: () => void; reject: (reason: unknown) => void}[] = [];
    controller.signal.addEventListener('abort', () => {
      for (const waiter of waiting.splice(0)) waiter.reject(controller.signal.reason);
    }, {once: true});
    const acquireRequest = async (): Promise<() => void> => {
      controller.signal.throwIfAborted();
      if (activeRequests < MAX_CONCURRENT_REQUESTS) activeRequests++;
      else await new Promise<void>((accept, reject) => waiting.push({accept, reject}));
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const next = waiting.shift();
        if (next) next.accept(); else activeRequests--;
      };
    };
    const abortRequest = async (request: HTTPRequest) => { if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => {}); };
    const intercept = async (request: HTTPRequest) => {
      if (settled || controller.signal.aborted) return abortRequest(request);
      let url: URL;
      try { url = new URL(request.url()); } catch { return abortRequest(request); }
      if (url.hostname === 'challenges.cloudflare.com' || /\/cdn-cgi\/challenge-platform\//.test(url.pathname)) {
        fail(new ProviderError('verification_required', 'VidLink requires human verification. Try another source.'));
        return abortRequest(request);
      }
      if (url.protocol !== 'https:' || !BOOTSTRAP_HOSTS.has(url.hostname) || url.port || url.username || url.password ||
          request.method() !== 'GET' || ['image', 'font', 'media', 'websocket'].includes(request.resourceType()) ||
          (request.resourceType() === 'document' && request.frame() !== page.mainFrame()) ||
          /^\/api\/(?:venus|mercury|ads|analytics)(?:\/|$)/.test(url.pathname)) return abortRequest(request);
      if (++requestCount > 80) { fail(new ProviderError('unavailable', 'VidLink exceeded the resolution request limit.')); return abortRequest(request); }
      const isSource = url.hostname === 'vidlink.pro' && /^\/api\/b\/(?:movie|tv)\//.test(url.pathname);
      let release: (() => void) | undefined;
      try {
        release = await acquireRequest();
        if (settled || controller.signal.aborted) return abortRequest(request);
        const response = await transport(url, {
          method: 'GET', maxBytes: isSource ? 1024 * 1024 : MAX_RESOURCE_BYTES, signal: controller.signal,
          headers: {accept: '*/*', 'user-agent': RELAY_USER_AGENT, referer: entry.href, origin: entry.origin,
            ...(isSource ? {'x-playback-environment': 'hls'} : {})},
        });
        const bytes = await bodyWithinLimit(response, isSource ? 1024 * 1024 : MAX_RESOURCE_BYTES, budget);
        if (isSource) {
          if (!response.ok) throw new ProviderError(response.status === 403 ? 'verification_required' : 'unavailable', 'VidLink could not resolve this title. Try another source.');
          complete(parseVidLinkMedia(JSON.parse(bytes.toString('utf8'))));
          return abortRequest(request);
        }
        if (request.isNavigationRequest() && (!response.ok || /cf-turnstile|<title>Just a moment/i.test(bytes.toString('utf8')))) {
          throw new ProviderError(response.status === 403 || /cf-turnstile|<title>Just a moment/i.test(bytes.toString('utf8')) ? 'verification_required' : 'unavailable', 'VidLink could not open its public player. Try another source.');
        }
        const headers: Record<string, string> = {'cache-control': 'no-store'};
        for (const name of ['content-type', 'access-control-allow-origin', 'cross-origin-resource-policy']) {
          const value = response.headers.get(name); if (value) headers[name] = value;
        }
        if (!request.isInterceptResolutionHandled()) await request.respond({status: response.status, headers, body: bytes});
      } catch (error) {
        if (error instanceof UpstreamLimitError) budget.exhausted();
        else if (isSource || request.isNavigationRequest()) fail(error instanceof ProviderError ? error : new ProviderError('unavailable', 'VidLink could not resolve this title. Try another source.'));
        await abortRequest(request);
      } finally { release?.(); }
    };
    page.on('request', request => { void intercept(request).catch(() => fail(new ProviderError('unavailable', 'VidLink could not resolve this title.'))); });
    page.on('error', () => fail(new ProviderError('unavailable', 'The provider browser stopped unexpectedly.')));
    void page.goto(entry.href, {waitUntil: 'domcontentloaded', timeout: RESOLUTION_MS}).catch(() => {
      if (!settled && !controller.signal.aborted) fail(new ProviderError('unavailable', 'VidLink could not open its public player.'));
    });
    return await Promise.race([result, abortResult]);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('unavailable', 'VidLink is temporarily unavailable. Try another source.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancelFromCaller);
    controller.abort();
    if (browser) {
      const killTimer = setTimeout(() => browser?.process()?.kill('SIGKILL'), 1500);
      killTimer.unref();
      await browser.close().catch(() => {});
      clearTimeout(killTimer);
    }
    if (proxy) { proxy.server.closeAllConnections(); proxy.server.close(); }
  }
}
