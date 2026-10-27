import {headersForTarget, MAX_MEDIA_BYTES, validateMediaUrl} from './media-security';
import {createMediaToken, readMediaToken} from './media-tokens';
import type {MediaCapability, MediaPurpose} from './media-tokens';
import type {UpstreamTransport} from './media-types';

const RANGE_BYTES = 4 * 1024 * 1024;
const PLAYLIST_BYTES = 1024 * 1024;
const REWRITTEN_PLAYLIST_BYTES = 8 * 1024 * 1024;
const SAFE_HEADERS = {
  'cache-control': 'private, no-store', 'netlify-cdn-cache-control': 'no-store',
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; sandbox; frame-ancestors 'none'",
};
const failure = (status: number, error: string) => Response.json({error}, {status, headers: SAFE_HEADERS});

export function boundedRange(value: string): string {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || !match[1] && !match[2]) throw new Error('Invalid byte range');
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error('Invalid byte range');
    return `bytes=-${Math.min(suffix, RANGE_BYTES)}`;
  }
  const start = Number(match[1]), end = match[2] ? Number(match[2]) : start + RANGE_BYTES - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || !Number.isSafeInteger(start + RANGE_BYTES - 1)) throw new Error('Invalid byte range');
  return `bytes=${start}-${Math.min(end, start + RANGE_BYTES - 1)}`;
}

// HLS byte ranges describe complete fragments: a partial fragment is unusable.
function segmentRange(value: string): string {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || !match[1] && !match[2]) throw new Error('Invalid byte range');
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || suffix > MAX_MEDIA_BYTES) throw new Error('Invalid byte range');
  } else {
    const start = Number(match[1]), end = match[2] ? Number(match[2]) : undefined;
    if (!Number.isSafeInteger(start) || end !== undefined && (!Number.isSafeInteger(end) || end < start || end - start + 1 > MAX_MEDIA_BYTES)) throw new Error('Invalid byte range');
  }
  return value;
}

export function rewritePlaylist(body: string, base: URL, capability: MediaCapability, secret: string): string {
  if (Buffer.byteLength(body) > PLAYLIST_BYTES || !body.replace(/^\uFEFF/, '').startsWith('#EXTM3U')) throw new Error('Invalid playlist');
  let variant = false;
  let referenceBytes = 0, outputBytes = 0;
  const rewrite = (value: string, purpose: MediaPurpose) => {
    if (!value || value.includes('{$')) throw new Error('Unsupported playlist URL');
    const url = validateMediaUrl(new URL(value, base));
    const headers = headersForTarget(capability.headers, capability.headerOrigin, url);
    const result = '/api/media?token=' + createMediaToken({...capability, url: url.href, purpose, headers}, secret);
    referenceBytes += Buffer.byteLength(result);
    if (referenceBytes > REWRITTEN_PLAYLIST_BYTES) throw new Error('Expanded playlist too large');
    return result;
  };
  const rewriteLine = (line: string): string => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (!trimmed.startsWith('#')) {
      const purpose = variant || /\.m3u8(?:$|[?#])/i.test(trimmed) ? 'playlist' : /\.(?:vtt|srt)(?:$|[?#])/i.test(trimmed) ? 'subtitle' : 'segment';
      variant = false; return rewrite(trimmed, purpose);
    }
    if (/^#EXT-X-(?:CONTENT-STEERING|DEFINE):/.test(trimmed)) throw new Error('Unsupported playlist feature');
    if (/^#EXT-X-SESSION-DATA:/.test(trimmed) || !trimmed.startsWith('#EXT')) return '';
    if (/^#EXT-X-(?:SESSION-)?KEY:/.test(trimmed) && (/METHOD=(?!AES-128(?:,|$)|NONE(?:,|$))/.test(trimmed) || /KEYFORMAT="(?!identity")/.test(trimmed))) throw new Error('Protected media is unsupported');
    if (/^#EXT-X-STREAM-INF:/.test(trimmed)) variant = true;
    const purpose: MediaPurpose = /^#EXT-X-(?:SESSION-)?KEY:/.test(trimmed) ? 'key' : /^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/.test(trimmed) ? 'playlist' : 'segment';
    if (/(?:^|[, :])URI\s*=\s*[^"\s]/.test(trimmed)) throw new Error('Invalid playlist URI');
    return trimmed.replace(/\bURI="([^"]*)"/g, (_match, value: string) => `URI="${rewrite(value, purpose)}"`);
  };
  return body.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map(line => {
    const result = rewriteLine(line);
    outputBytes += Buffer.byteLength(result) + 1;
    if (outputBytes > REWRITTEN_PLAYLIST_BYTES) throw new Error('Expanded playlist too large');
    return result;
  }).join('\n');
}

export function subtitleVtt(value: string): string {
  let body = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (body.length > 2 * 1024 * 1024 || /<\s*(?:html|script|!doctype)\b/i.test(body) || body.includes('\0')) throw new Error('Invalid subtitles');
  if (/^WEBVTT(?:\s|$)/.test(body)) return body.replace(/(?:^|\n)STYLE\n[\s\S]*?(?=\n\n|$)/g, '');
  if (!/\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(body)) throw new Error('Unsupported subtitles');
  body = body.replace(/\b(\d{2}:\d{2}:\d{2}),(\d{3})\b/g, '$1.$2');
  return 'WEBVTT\n\n' + body;
}

function validContentRange(value: string | null, wanted: string, length: string | null, maxBytes: number): boolean {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? '');
  if (!match) return false;
  const [start, end, total] = match.slice(1).map(Number);
  if (![start, end, total].every(Number.isSafeInteger) || start < 0 || end < start || end >= total || end - start + 1 > maxBytes || length !== null && Number(length) !== end - start + 1) return false;
  const request = /^bytes=(\d*)-(\d*)$/.exec(wanted)!;
  if (!request[1]) return start === Math.max(0, total - Number(request[2])) && end === total - 1;
  return start === Number(request[1]) && end === (request[2] ? Math.min(Number(request[2]), total - 1) : total - 1);
}

export async function handleMedia(req: Request, secret: string, transport: UpstreamTransport): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return failure(405, 'method_not_allowed');
  if (secret.length < 32) return failure(503, 'playback_not_configured');
  let cap: MediaCapability;
  try {cap = readMediaToken(new URL(req.url).searchParams.get('token') ?? '', secret);} catch {return failure(403, 'invalid_or_expired_media');}
  let range: string | undefined;
  try {
    if (req.headers.has('range')) range = cap.purpose === 'segment' ? segmentRange(req.headers.get('range')!) : boundedRange(req.headers.get('range')!);
    else if (cap.purpose === 'file' && req.method !== 'HEAD') range = `bytes=0-${RANGE_BYTES - 1}`;
    if (range && !['file', 'segment'].includes(cap.purpose)) return failure(416, 'invalid_range');
  } catch {return failure(416, 'invalid_range');}
  let upstream: Response | undefined;
  try {
    const target = validateMediaUrl(cap.url);
    const limit = cap.purpose === 'playlist' ? PLAYLIST_BYTES : cap.purpose === 'subtitle' ? 2 * 1024 * 1024 : cap.purpose === 'key' ? 4096 : range && cap.purpose === 'file' ? RANGE_BYTES : MAX_MEDIA_BYTES;
    upstream = await transport(target, {method: req.method as 'GET' | 'HEAD', headers: {...headersForTarget(cap.headers, cap.headerOrigin, target), ...(range ? {range} : {})}, maxBytes: limit, signal: req.signal});
    if (upstream.status === 416) {
      const headers = new Headers(SAFE_HEADERS), contentRange = upstream.headers.get('content-range');
      if (/^bytes \*\/\d+$/.test(contentRange ?? '')) headers.set('content-range', contentRange!);
      await upstream.body?.cancel(); return new Response(null, {status: 416, headers});
    }
    if (!upstream.ok) {await upstream.body?.cancel(); return failure(502, 'source_unavailable');}
    const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (/html|javascript|ecmascript|xml/.test(contentType)) throw new Error('Unexpected executable media');
    const headers = new Headers(SAFE_HEADERS);
    const isPlaylist = cap.purpose === 'playlist' || /(?:mpegurl|m3u8)/.test(contentType);
    if (isPlaylist) {
      if (req.method === 'HEAD') return new Response(null, {headers: {...SAFE_HEADERS, 'content-type': 'application/vnd.apple.mpegurl'}});
      const body = rewritePlaylist(await upstream.text(), validateMediaUrl(upstream.url || target), cap, secret);
      headers.set('content-type', 'application/vnd.apple.mpegurl');
      return new Response(body, {headers});
    }
    if (cap.purpose === 'subtitle' || contentType === 'text/vtt' || /\.vtt(?:$|\?)/i.test(target.href)) {
      headers.set('content-type', 'text/vtt; charset=utf-8');
      return new Response(req.method === 'HEAD' ? null : subtitleVtt(await upstream.text()), {headers});
    }
    if (cap.purpose === 'key') {
      const body = req.method === 'HEAD' ? null : await upstream.arrayBuffer();
      if (body && body.byteLength !== 16) throw new Error('Invalid media key');
      headers.set('content-type', 'application/octet-stream'); return new Response(body, {headers});
    }
    if (!/^(?:video\/|audio\/|application\/(?:octet-stream|mp4)|binary\/octet-stream)/.test(contentType)) throw new Error('Unexpected media content');
    const length = upstream.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || req.method !== 'HEAD' && Number(length) > limit)) throw new Error('Media response too large');
    if (upstream.status === 206 && (!range || !validContentRange(upstream.headers.get('content-range'), range, length, limit))) throw new Error('Incorrect upstream byte range');
    if (range && upstream.status === 200) {
      const initialRange = /^bytes=0-(\d*)$/.exec(range);
      if (length === null || Number(length) > limit || !initialRange || initialRange[1] && Number(length) > Number(initialRange[1]) + 1) throw new Error('Source does not support ranges');
    }
    headers.set('content-type', contentType || 'application/octet-stream');
    headers.set('accept-ranges', 'bytes');
    if (length) headers.set('content-length', length);
    if (upstream.status === 206) headers.set('content-range', upstream.headers.get('content-range')!);
    return new Response(req.method === 'HEAD' ? null : upstream.body, {status: upstream.status, headers});
  } catch {
    await upstream?.body?.cancel().catch(() => {});
    return failure(req.signal.aborted ? 499 : 502, 'source_unavailable');
  }
}
