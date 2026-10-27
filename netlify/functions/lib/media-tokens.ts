import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {MEDIA_PROVIDERS} from './media-types';
import type {MediaProvider} from './media-types';
import {upstreamHeaders, validateMediaUrl} from './media-security';

export type MediaPurpose = 'playlist' | 'segment' | 'file' | 'subtitle' | 'key';
export interface MediaCapability {
  url: string;
  provider: MediaProvider;
  purpose: MediaPurpose;
  headers?: Record<string, string>;
  headerOrigin?: string;
  expires: number;
}
export const MEDIA_TOKEN_SECONDS = 4 * 3600;
const aad = Buffer.from('qcc-media-v1');
const key = (secret: string) => {
  if (secret.length < 32) throw new Error('Media relay is not configured');
  return createHash('sha256').update(secret).digest();
};
function validate(value: MediaCapability, now: number) {
  if (!value || !MEDIA_PROVIDERS.includes(value.provider) || !['playlist', 'segment', 'file', 'subtitle', 'key'].includes(value.purpose) ||
      !Number.isSafeInteger(value.expires) || value.expires <= now || value.expires > now + MEDIA_TOKEN_SECONDS) throw new Error('Invalid media capability');
  validateMediaUrl(value.url);
  if (value.headers) upstreamHeaders(value.headers);
  if (value.headerOrigin && validateMediaUrl(value.headerOrigin).origin !== value.headerOrigin) throw new Error('Invalid credential origin');
}
export function createMediaToken(value: Omit<MediaCapability, 'expires'> & {expires?: number}, secret: string, now = Math.floor(Date.now() / 1000)): string {
  const payload = {...value, expires: value.expires ?? now + MEDIA_TOKEN_SECONDS};
  validate(payload, now);
  const plaintext = JSON.stringify(payload);
  if (plaintext.length > 14000) throw new Error('Media capability is too large');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function readMediaToken(token: string, secret: string, now = Math.floor(Date.now() / 1000)): MediaCapability {
  if (!token || token.length > 20000 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('Invalid media capability');
  const packed = Buffer.from(token, 'base64url');
  if (packed.length < 30 || packed[0] !== 1 || packed.toString('base64url') !== token) throw new Error('Invalid media capability');
  const decipher = createDecipheriv('aes-256-gcm', key(secret), packed.subarray(1, 13));
  decipher.setAAD(aad); decipher.setAuthTag(packed.subarray(13, 29));
  const value = JSON.parse(Buffer.concat([decipher.update(packed.subarray(29)), decipher.final()]).toString('utf8')) as MediaCapability;
  validate(value, now); return value;
}
export function mediaPath(value: Omit<MediaCapability, 'expires'> & {expires?: number}, secret: string): string {
  return '/api/media?token=' + createMediaToken(value, secret);
}
