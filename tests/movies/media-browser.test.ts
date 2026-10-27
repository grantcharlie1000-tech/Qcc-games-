import {createServer} from 'node:http';
import {describe, expect, it, vi} from 'vitest';
import {parseVidLinkMedia, resolveBrowserProvider} from '../../netlify/functions/lib/media-browser';

describe('VidLink server metadata', () => {
  it('selects an HLS playlist and keeps only source-generated media headers', () => {
    const media = parseVidLinkMedia({sourceId: 'source', stream: {
      deliveryType: 'hls', playlist: 'https://video.example.net/master.m3u8?token=opaque',
      requiresProxy: true,
      playlistHeaders: {Cookie: 'source_session=generated', Referer: 'https://upstream.example/', 'X-Forwarded-For': 'private', Authorization: 'Bearer unexpected'},
      qualities: {}, captions: [
        {url: 'https://captions.example.net/en.srt', language: 'English', type: 'srt', hasCorsRestrictions: false},
        {url: 'javascript:alert(1)', language: 'Bad', type: 'srt'},
      ],
    }});
    expect(media).toEqual({
      url: 'https://video.example.net/master.m3u8?token=opaque', type: 'hls',
      headers: {cookie: 'source_session=generated', referer: 'https://upstream.example/'},
      subtitles: [{url: 'https://captions.example.net/en.srt', label: 'English', language: 'en'}],
    });
  });

  it('selects the best browser-compatible progressive quality before HEVC', () => {
    const media = parseVidLinkMedia({stream: {deliveryType: 'file', qualities: {
      '1080': {url: 'https://video.example.net/hevc.mp4', type: 'mp4', codecName: 'hevc', requiresProxy: true},
      '720': {url: 'https://video.example.net/avc.mp4', type: 'mp4', codecName: 'h264', requiresProxy: true},
      '360': {url: 'https://video.example.net/low.mp4', type: 'mp4', codecName: 'h264'},
    }, captions: []}});
    expect(media.url).toBe('https://video.example.net/avc.mp4');
    expect(media.type).toBe('mp4');
  });

  it('uses a supplied HLS alternate when the preferred delivery is DASH', () => {
    expect(parseVidLinkMedia({stream: {
      deliveryType: 'dash', playlist: 'https://video.example.net/master.mpd', qualities: {},
      alternates: {compatible: {type: 'hls', playlist: 'https://video.example.net/alternate.m3u8', headers: {Origin: 'https://source.example'}}},
    }})).toMatchObject({url: 'https://video.example.net/alternate.m3u8', type: 'hls', headers: {origin: 'https://source.example'}});
  });

  it('reports DASH-only and DRM sources as unsupported instead of pretending they are MP4', () => {
    for (const stream of [
      {deliveryType: 'dash', playlist: 'https://video.example.net/master.mpd', qualities: {}},
      {deliveryType: 'hls', playlist: 'https://video.example.net/master.m3u8', drm: {licenseUrl: 'https://license.example/'}},
    ]) expect(() => parseVidLinkMedia({stream})).toThrow(expect.objectContaining({code: 'unsupported'}));
  });

  it('rejects media credential URLs, non-HTTPS sources and header injection', () => {
    for (const url of ['http://video.example.net/film.mp4', 'https://user:password@video.example.net/film.mp4', 'file:///tmp/video.mp4']) {
      expect(() => parseVidLinkMedia({stream: {qualities: {'720': {url, type: 'mp4'}}}})).toThrow();
    }
    expect(() => parseVidLinkMedia({stream: {deliveryType: 'hls', playlist: 'https://video.example.net/master.m3u8', playlistHeaders: {Cookie: 'a=b\r\nX-Injected: yes'}}})).toThrow();
  });

  it('rejects invalid requests before starting browser or making a network request', async () => {
    let requests = 0;
    const transport = async () => { requests++; return new Response(); };
    await expect(resolveBrowserProvider({provider: 'framextv', kind: 'movie', id: 550}, transport)).rejects.toMatchObject({code: 'unsupported'});
    await expect(resolveBrowserProvider({provider: 'vidlink', kind: 'tv', id: 1, season: 0, episode: 1}, transport)).rejects.toMatchObject({code: 'unavailable'});
    await expect(resolveBrowserProvider({provider: 'vidlink', kind: 'movie', id: Number.NaN}, transport)).rejects.toMatchObject({code: 'unavailable'});
    expect(requests).toBe(0);
  });
});

describe.runIf(!!process.env.MEDIA_BROWSER_TEST_EXECUTABLE)('isolated VidLink browser', () => {
  it('resolves through the supplied transport while denying unapproved HTTP and WebSocket traffic', async () => {
    let leakedConnections = 0;
    const leakTarget = createServer((_request, response) => response.end('must not be reached'));
    leakTarget.on('connection', () => { leakedConnections++; });
    await new Promise<void>((resolve, reject) => { leakTarget.once('error', reject); leakTarget.listen(0, '127.0.0.1', resolve); });
    const address = leakTarget.address();
    if (!address || typeof address === 'string') throw new Error('Fixture listener failed');
    const seen: {url: string; environment?: string; cookie?: string}[] = [];
    vi.stubEnv('MEDIA_BROWSER_EXECUTABLE', process.env.MEDIA_BROWSER_TEST_EXECUTABLE!);
    try {
      const media = await resolveBrowserProvider({provider: 'vidlink', kind: 'movie', id: 550}, async (url, options) => {
        seen.push({url: url.href, environment: options?.headers?.['x-playback-environment'], cookie: options?.headers?.cookie});
        if (url.pathname === '/movie/550') return new Response(`<!doctype html><script>
          new WebSocket('wss://127.0.0.1:${address.port}/leak');
          fetch('https://unapproved.example/track').catch(()=>{});
          fetch('/api/b/movie/server-generated-id?multiLang=0').catch(()=>{});
        </script>`, {headers: {'content-type': 'text/html'}});
        if (url.pathname === '/api/b/movie/server-generated-id') return Response.json({stream: {deliveryType: 'hls', playlist: 'https://video.example.net/master.m3u8'}});
        throw new Error('Unexpected upstream URL');
      });
      expect(media).toEqual({url: 'https://video.example.net/master.m3u8', type: 'hls'});
      expect(seen.map(item => item.url)).toEqual([
        'https://vidlink.pro/movie/550?autoplay=false',
        'https://vidlink.pro/api/b/movie/server-generated-id?multiLang=0',
      ]);
      expect(seen[1].environment).toBe('hls');
      expect(seen.every(item => item.cookie === undefined)).toBe(true);
      expect(leakedConnections).toBe(0);
    } finally {
      vi.unstubAllEnvs();
      leakTarget.closeAllConnections();
      leakTarget.close();
    }
  }, 30_000);

  it('reports provider verification without completing the challenge or contacting a challenge domain', async () => {
    const seen: string[] = [];
    vi.stubEnv('MEDIA_BROWSER_EXECUTABLE', process.env.MEDIA_BROWSER_TEST_EXECUTABLE!);
    try {
      await expect(resolveBrowserProvider({provider: 'vidlink', kind: 'movie', id: 550}, async url => {
        seen.push(url.href);
        return new Response('<!doctype html><title>Just a moment...</title><div class="cf-turnstile"></div>', {status: 403, headers: {'content-type': 'text/html'}});
      })).rejects.toMatchObject({code: 'verification_required'});
      expect(seen).toEqual(['https://vidlink.pro/movie/550?autoplay=false']);
    } finally { vi.unstubAllEnvs(); }
  }, 30_000);

  it('does not start resolution when its caller has already cancelled', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    let requests = 0;
    vi.stubEnv('MEDIA_BROWSER_EXECUTABLE', process.env.MEDIA_BROWSER_TEST_EXECUTABLE!);
    try {
      await expect(resolveBrowserProvider({provider: 'vidlink', kind: 'movie', id: 550}, async url => {
        requests++;
        return url.pathname.startsWith('/api/b/')
          ? Response.json({stream: {deliveryType: 'hls', playlist: 'https://video.example.net/master.m3u8'}})
          : new Response('<script>fetch("/api/b/movie/cancel-test").catch(()=>{})</script>', {headers: {'content-type': 'text/html'}});
      }, cancelled.signal)).rejects.toMatchObject({code: 'unavailable'});
      expect(requests).toBe(0);
    } finally { vi.unstubAllEnvs(); }
  }, 30_000);

  it('limits concurrent bootstrap transfers while still resolving the source', async () => {
    let active = 0;
    let maximumActive = 0;
    vi.stubEnv('MEDIA_BROWSER_EXECUTABLE', process.env.MEDIA_BROWSER_TEST_EXECUTABLE!);
    try {
      const media = await resolveBrowserProvider({provider: 'vidlink', kind: 'movie', id: 550}, async url => {
        if (url.pathname === '/movie/550') return new Response(`<script>
          Promise.all(Array.from({length:12},(_,i)=>fetch('/bootstrap/'+i).then(r=>r.text())))
            .then(()=>fetch('/api/b/movie/concurrency'));
        </script>`, {headers: {'content-type': 'text/html'}});
        if (url.pathname.startsWith('/api/b/')) return Response.json({stream: {deliveryType: 'hls', playlist: 'https://video.example.net/master.m3u8'}});
        active++; maximumActive = Math.max(maximumActive, active);
        return new Response(new ReadableStream({async pull(controller) {
          await new Promise(resolve => setTimeout(resolve, 25));
          controller.enqueue(new TextEncoder().encode('fixture'));
          controller.close(); active--;
        }}), {headers: {'content-type': 'text/plain'}});
      });
      expect(media.type).toBe('hls');
      expect(maximumActive).toBeLessThanOrEqual(4);
    } finally { vi.unstubAllEnvs(); }
  }, 30_000);

  it('aborts every bootstrap request when noncritical assets exhaust the shared byte budget', async () => {
    let produced = 0;
    let sourceRequests = 0;
    const signals: AbortSignal[] = [];
    vi.stubEnv('MEDIA_BROWSER_EXECUTABLE', process.env.MEDIA_BROWSER_TEST_EXECUTABLE!);
    try {
      await expect(resolveBrowserProvider({provider: 'vidlink', kind: 'movie', id: 550}, async (url, options) => {
        if (url.pathname === '/movie/550') return new Response(`<script>
          Promise.allSettled(Array.from({length:8},(_,i)=>fetch('/bootstrap/'+i).then(r=>r.arrayBuffer())))
            .then(()=>fetch('/api/b/movie/over-budget'));
        </script>`, {headers: {'content-type': 'text/html'}});
        if (url.pathname.startsWith('/api/b/')) {
          sourceRequests++;
          return Response.json({stream: {deliveryType: 'hls', playlist: 'https://video.example.net/master.m3u8'}});
        }
        signals.push(options!.signal!);
        let chunks = 0;
        return new Response(new ReadableStream({pull(controller) {
          if (chunks++ === 16) { controller.close(); return; }
          const bytes = new Uint8Array(256 * 1024);
          produced += bytes.byteLength;
          controller.enqueue(bytes);
        }}), {headers: {'content-type': 'application/octet-stream'}});
      })).rejects.toMatchObject({code: 'unavailable', message: expect.stringContaining('size limit')});
      expect(sourceRequests).toBe(0);
      // Allow one queued stream chunk per active request; never buffer every
      // resource in full before noticing that the aggregate limit was crossed.
      expect(produced).toBeLessThanOrEqual(25 * 1024 * 1024);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every(signal => signal.aborted)).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  }, 30_000);
});
