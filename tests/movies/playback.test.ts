import {expect, it} from 'vitest';
import {handlePlayback} from '../../netlify/functions/playback.mts';
import {readMediaToken} from '../../netlify/functions/lib/media-tokens';
import {ProviderError} from '../../netlify/functions/lib/media-types';
const secret = 'local-test-playback-secret-with-at-least-32-characters';
const request = (query = 'provider=framextv&type=movie&id=550') => new Request('https://qcc.example/api/playback?' + query, {headers: {cookie: 'qcc-private', authorization: 'Bearer private', 'user-agent': 'personal'}});
it('accepts only fixed providers and bounded title identifiers without an arbitrary target URL', async () => {
  let called = 0;
  for (const query of ['provider=other&type=movie&id=550', 'provider=framextv&type=movie&id=1e3', 'provider=vidsrc&type=tv&id=1', 'provider=vixsrc&type=tv&id=1&season=0&episode=1', 'provider=framextv&type=movie&id=1&url=https://private.example.org']) {
    const response = await handlePlayback(request(query), secret, async () => {called++; throw new Error('Not expected');});
    expect(response.status).toBe(400);
  }
  expect(called).toBe(0);
});
it('returns only encrypted first-party media URLs and scopes provider cookies to their origin', async () => {
  let parameters: unknown;
  const response = await handlePlayback(request('provider=vixsrc&type=tv&id=1399&season=2&episode=3'), secret, async input => {
    parameters = input;
    return {url: 'https://cdn.example.org/main.m3u8?secret=provider', type: 'hls', headers: {cookie: 'source-only', referer: 'https://vixsrc.to/'}, subtitles: [{url: 'https://subs.example.org/track.srt', label: 'English', language: 'en'}]};
  });
  expect(response.status).toBe(200);
  expect(parameters).toEqual({provider: 'vixsrc', kind: 'tv', id: 1399, season: 2, episode: 3});
  const text = await response.text(); expect(text).not.toContain('cdn.example'); expect(text).not.toContain('source-only');
  const data = JSON.parse(text); expect(data.source.url).toMatch(/^\/api\/media\?token=/); expect(data.source.type).toBe('hls');
  const media = readMediaToken(new URL(data.source.url, 'https://qcc.example').searchParams.get('token')!, secret);
  expect(media.url).toBe('https://cdn.example.org/main.m3u8?secret=provider'); expect(media.headers?.cookie).toBe('source-only');
  const subtitle = readMediaToken(new URL(data.subtitles[0].src, 'https://qcc.example').searchParams.get('token')!, secret);
  expect(subtitle.purpose).toBe('subtitle'); expect(subtitle.headers).not.toHaveProperty('cookie');
});
it('reports verification and unavailability without revealing upstream tokens or error details', async () => {
  const challenge = await handlePlayback(request(), secret, async () => {throw new ProviderError('verification_required', 'https://provider.example/api?secret=private');});
  expect(challenge.status).toBe(424); expect(await challenge.json()).toEqual({error: 'verification_required', message: 'This source requires human verification. Try another source.'});
  const failure = await handlePlayback(request(), secret, async () => {throw new Error('secret-private-token');});
  expect(failure.status).toBe(502); expect(await failure.text()).not.toContain('secret');
});
it('does not resolve or issue capabilities without a configured secret', async () => {
  let called = false;
  const response = await handlePlayback(request(), '', async () => {called = true; throw new Error();});
  expect(response.status).toBe(503); expect(called).toBe(false);
});
