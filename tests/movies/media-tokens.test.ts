import {expect, it} from 'vitest';
import {createMediaToken, readMediaToken} from '../../netlify/functions/lib/media-tokens';
const secret = 'test-secret-only-not-a-production-key-123456789';
const payload = {url: 'https://media.example.org/movie.mp4?provider_key=private', provider: 'framextv' as const, purpose: 'file' as const, headers: {cookie: 'provider_session=server-only'}, headerOrigin: 'https://media.example.org'};
it('encrypts upstream locations and credentials and authenticates the complete capability', () => {
  const token = createMediaToken(payload, secret, 1000);
  expect(token).not.toContain('provider_key');
  expect(Buffer.from(token, 'base64url').toString()).not.toContain('provider_session');
  expect(readMediaToken(token, secret, 1001)).toMatchObject(payload);
  const decoded = Buffer.from(token, 'base64url'); decoded[20] ^= 1;
  expect(() => readMediaToken(decoded.toString('base64url'), secret, 1001)).toThrow();
  expect(() => readMediaToken(token, 'different-long-test-secret-abcdefghijkl', 1001)).toThrow();
});
it('rejects expired capabilities, weak configuration and malformed or unbounded inputs', () => {
  const token = createMediaToken(payload, secret, 1000);
  expect(() => readMediaToken(token, secret, 1000 + 4 * 3600)).toThrow();
  expect(() => createMediaToken(payload, '', 1000)).toThrow();
  expect(() => readMediaToken('A'.repeat(24000), secret, 1001)).toThrow();
  expect(() => createMediaToken({...payload, url: 'http://127.0.0.1/private'}, secret, 1000)).toThrow();
});
