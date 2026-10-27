import {expect, it} from 'vitest';
import {handleMedia, rewritePlaylist, boundedRange, subtitleVtt} from '../../netlify/functions/lib/media-relay';
import {createMediaToken, readMediaToken} from '../../netlify/functions/lib/media-tokens';
import type {MediaCapability} from '../../netlify/functions/lib/media-tokens';
const secret = 'local-only-test-relay-secret-at-least-32-characters';
const cap: MediaCapability = {url: 'https://cdn.example.org/path/master.m3u8', provider: 'vixsrc', purpose: 'playlist', headers: {cookie: 'upstream-only'}, headerOrigin: 'https://cdn.example.org', expires: Math.floor(Date.now() / 1000) + 3600};
const tokenFor = (extra: Partial<MediaCapability> = {}) => createMediaToken({...cap, ...extra}, secret);
const request = (token: string, headers?: Record<string, string>) => new Request('https://qcc.example/api/media?token=' + token, {headers});

it('rewrites variants, audio, subtitles, maps, keys, segments and low-latency references into authenticated first-party URLs', () => {
  const input = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",URI="subs.m3u8"\n#EXT-X-KEY:METHOD=AES-128,URI="/key.bin"\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="1000@0"\n#EXT-X-PART:DURATION=0.333,URI="part.m4s"\n#EXT-X-STREAM-INF:BANDWIDTH=10000\nvideo.m3u8\n#EXTINF:4,\nhttps://segments.example.org/first.ts?signature=123\n';
  const output = rewritePlaylist(input, new URL(cap.url), cap, secret);
  expect(output).toContain('#EXT-X-MAP:URI="/api/media?token=');
  expect(output).toContain('BYTERANGE="1000@0"');
  expect(output).not.toContain('https://');
  const tokens = [...output.matchAll(/\/api\/media\?token=([A-Za-z0-9_-]+)/g)].map(m => readMediaToken(m[1], secret));
  expect(tokens.map(t => [t.url, t.purpose])).toEqual([
    ['https://cdn.example.org/path/audio.m3u8', 'playlist'], ['https://cdn.example.org/path/subs.m3u8', 'playlist'],
    ['https://cdn.example.org/key.bin', 'key'], ['https://cdn.example.org/path/init.mp4', 'segment'],
    ['https://cdn.example.org/path/part.m4s', 'segment'], ['https://cdn.example.org/path/video.m3u8', 'playlist'],
    ['https://segments.example.org/first.ts?signature=123', 'segment'],
  ]);
  expect(tokens.at(-1)?.headers).not.toHaveProperty('cookie');
  expect(tokens.every(t => t.expires === cap.expires)).toBe(true);
});
it('rejects private targets, unsupported DRM and external steering instead of leaving an unrelayed request', () => {
  for (const playlist of ['#EXTM3U\nhttps://127.0.0.1/secret', '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.apple.streamingkeydelivery",URI="skd://key"', '#EXTM3U\n#EXT-X-CONTENT-STEERING:SERVER-URI="https://other.example.org/steer"']) expect(() => rewritePlaylist(playlist, new URL(cap.url), cap, secret)).toThrow();
});
it('bounds progressive ranges, preserves suffix ranges, and rejects multipart or invalid ranges', () => {
  expect(boundedRange('bytes=100-')).toBe('bytes=100-4194403');
  expect(boundedRange('bytes=100-200')).toBe('bytes=100-200');
  expect(boundedRange('bytes=-512')).toBe('bytes=-512');
  for (const range of ['bytes=1-0', 'bytes=0-1,4-5', 'words=0-1', 'bytes=9007199254740999-', 'bytes=-0']) expect(() => boundedRange(range)).toThrow();
});
it('relays real range bytes without visitor credentials or upstream response cookies', async () => {
  let observed: any;
  const res = await handleMedia(request(tokenFor({url: 'https://cdn.example.org/movie.mp4', purpose: 'file'}), {range: 'bytes=100-199', cookie: 'qcc_session=private', authorization: 'Bearer private', 'x-forwarded-for': '10.0.0.1', 'user-agent': 'personal'}), secret, async (url, options) => {
    observed = {url: url.href, options};
    return new Response(new Uint8Array(100).fill(7), {status: 206, headers: {'content-type': 'video/mp4', 'content-range': 'bytes 100-199/1000', 'content-length': '100', 'set-cookie': 'tracker=1', 'access-control-allow-origin': '*'}});
  });
  expect(res.status).toBe(206); expect(res.headers.get('content-range')).toBe('bytes 100-199/1000');
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(100).fill(7));
  expect(observed.options.headers).toEqual({cookie: 'upstream-only', range: 'bytes=100-199'});
  expect(res.headers.get('set-cookie')).toBeNull(); expect(res.headers.get('access-control-allow-origin')).toBeNull();
  expect(res.headers.get('cache-control')).toBe('private, no-store');
});
it('rejects malformed capabilities before invoking the upstream transport', async () => {
  let calls = 0;
  const res = await handleMedia(request('forged'), secret, async () => {calls++; return new Response('bad');});
  expect(res.status).toBe(403); expect(calls).toBe(0);
});
it('rejects executable content and mismatched byte ranges without returning their body', async () => {
  const token = tokenFor({url: 'https://cdn.example.org/movie.mp4', purpose: 'file'});
  const executable = await handleMedia(request(token), secret, async () => new Response('<script>steal()</script>', {headers: {'content-type': 'text/html'}}));
  expect(executable.status).toBe(502); expect(await executable.text()).not.toContain('steal');
  const wrong = await handleMedia(request(token, {range: 'bytes=100-199'}), secret, async () => new Response(new Uint8Array(100), {status: 206, headers: {'content-type': 'video/mp4', 'content-range': 'bytes 0-99/1000'}}));
  expect(wrong.status).toBe(502);
});
it('rejects a large upstream that ignores ranges rather than truncating a movie', async () => {
  const res = await handleMedia(request(tokenFor({url: 'https://cdn.example.org/movie.mp4', purpose: 'file'})), secret, async () => new Response('data', {headers: {'content-type': 'video/mp4', 'content-length': '1000000000'}}));
  expect(res.status).toBe(502);
});
it('returns a large media file size to HEAD without treating metadata as a transfer', async () => {
  const req = new Request('https://qcc.example/api/media?token=' + tokenFor({url: 'https://cdn.example.org/movie.mp4', purpose: 'file'}), {method: 'HEAD'});
  const res = await handleMedia(req, secret, async () => new Response(null, {headers: {'content-type': 'video/mp4', 'content-length': '1000000000'}}));
  expect(res.status).toBe(200); expect(res.headers.get('content-length')).toBe('1000000000'); expect(await res.text()).toBe('');
});
it('preserves a complete HLS byte range above the progressive chunk size', async () => {
  let observed = '';
  const size = 5 * 1024 * 1024;
  const res = await handleMedia(request(tokenFor({url: 'https://cdn.example.org/segments.mp4', purpose: 'segment'}), {range: `bytes=0-${size - 1}`}), secret, async (_url, options) => {
    observed = options?.headers?.range ?? '';
    return new Response(new Uint8Array(size), {status: 206, headers: {'content-type': 'video/mp4', 'content-range': `bytes 0-${size - 1}/10000000`, 'content-length': String(size)}});
  });
  expect(observed).toBe('bytes=0-5242879'); expect(res.status).toBe(206); expect((await res.arrayBuffer()).byteLength).toBe(size);
});
it('rejects an oversized HLS byte range before making any partial upstream request', async () => {
  let called = false;
  const res = await handleMedia(request(tokenFor({url: 'https://cdn.example.org/segments.mp4', purpose: 'segment'}), {range: 'bytes=0-20971519'}), secret, async () => {called = true; return new Response('bad');});
  expect(res.status).toBe(416); expect(called).toBe(false);
});
it('rejects a shared HLS file when the server ignores the requested fragment range', async () => {
  const res = await handleMedia(request(tokenFor({url: 'https://cdn.example.org/segments.mp4', purpose: 'segment'}), {range: 'bytes=0-1023'}), secret, async () => new Response(new Uint8Array(8192), {headers: {'content-type': 'video/mp4', 'content-length': '8192'}}));
  expect(res.status).toBe(502);
});
it('bounds expanded playlist size rather than accepting an output larger than the function can return', () => {
  const playlist = '#EXTM3U\n' + ('#EXTINF:4,\nsegment.ts\n').repeat(20000);
  expect(() => rewritePlaylist(playlist, new URL(cap.url), {...cap, headers: {cookie: 'session=' + 'a'.repeat(512)}}, secret)).toThrow();
});
it('converts SRT subtitles to browser VTT and rejects an HTML error response', () => {
  expect(subtitleVtt('1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n')).toBe('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHello\n');
  expect(() => subtitleVtt('<html>Blocked</html>')).toThrow();
});
