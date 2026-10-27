import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {Readable} from 'node:stream';
import {createBrotliDecompress, createGunzip, createInflate} from 'node:zlib';
import ipaddr from 'ipaddr.js';
import type {UpstreamTransport} from './media-types';

export const RELAY_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const MAX_MEDIA_BYTES = 18 * 1024 * 1024;
type Address = {address: string; family: number};
type Resolver = (hostname: string) => Promise<Address[]>;
export class UpstreamLimitError extends Error {
  constructor() { super('Upstream response exceeds transfer limit'); this.name = 'UpstreamLimitError'; }
}

export function validateMediaUrl(value: string | URL): URL {
  if (String(value).length > 10000) throw new Error('Invalid upstream target');
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash ||
      !/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || host.endsWith('.') || ipaddr.isValid(host) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|invalid|test|onion)$/.test(host)) throw new Error('Invalid upstream target');
  return url;
}

export function publicAddress(value: string): boolean {
  try { return ipaddr.process(value).range() === 'unicast'; } catch { return false; }
}

export async function resolvePublicAddress(hostname: string, resolve: Resolver = h => lookup(h, {all: true, verbatim: true}), signal?: AbortSignal): Promise<Address> {
  signal?.throwIfAborted();
  const addresses = signal ? await new Promise<Address[]>((accept, reject) => {
    const cancel = () => { signal.removeEventListener('abort', cancel); reject(signal.reason); };
    signal.addEventListener('abort', cancel, {once: true});
    // DNS itself may not be cancellable, but a late answer must never keep
    // the caller waiting or start a socket after the request is cancelled.
    try {
      resolve(hostname).then(value => {
        signal.removeEventListener('abort', cancel); accept(value);
      }, error => {
        signal.removeEventListener('abort', cancel); reject(error);
      });
    } catch (error) { signal.removeEventListener('abort', cancel); reject(error); }
  }) : await resolve(hostname);
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('Upstream address is not public');
  return addresses.find(item => item.family === 4) ?? addresses[0];
}

// These values come only from adapters or authenticated media capabilities, never
// a visitor's Request.headers. Cookies here are fresh provider-side credentials.
export function upstreamHeaders(values: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {'user-agent': RELAY_USER_AGENT, accept: '*/*', 'accept-encoding': 'identity'};
  for (const [raw, value] of Object.entries(values)) {
    const name = raw.toLowerCase();
    if (!['accept', 'range', 'referer', 'origin', 'cache-control', 'x-playback-environment', 'cookie'].includes(name)) continue;
    if (typeof value !== 'string' || value.length > 8192 || /[\r\n\0]/.test(value)) throw new Error('Invalid upstream header');
    if (name === 'referer' || name === 'origin') validateMediaUrl(value);
    result[name] = value;
  }
  return result;
}

export function headersForTarget(headers: Record<string, string> | undefined, credentialOrigin: string | undefined, target: URL): Record<string, string> {
  const safe = {...headers};
  if (target.origin !== credentialOrigin) for (const name of Object.keys(safe)) if (name.toLowerCase() === 'cookie') delete safe[name];
  return safe;
}

export function createUpstreamTransport(resolve?: Resolver): UpstreamTransport {
  return async (initial, options = {}) => {
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000);
    const maxBytes = Math.min(options.maxBytes ?? 2 * 1024 * 1024, MAX_MEDIA_BYTES);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid transfer limit');
    let url = validateMediaUrl(initial);
    let headers = upstreamHeaders(options.headers);
    for (let redirects = 0; redirects <= 4; redirects++) {
      signal.throwIfAborted();
      const address = await resolvePublicAddress(url.hostname, resolve, signal);
      signal.throwIfAborted();
      const target = url;
      const response = await new Promise<Response>((resolveResponse, reject) => {
        const req = httpsRequest(target, {
          method: options.method ?? 'GET', headers, signal,
          // DNS is checked once and this exact address is used by the socket.
          // TLS still authenticates target.hostname, with normal CA validation.
          servername: target.hostname,
          lookup: (_host, lookupOptions, callback) => {
            if (typeof lookupOptions === 'object' && lookupOptions.all) callback(null, [address] as any);
            else callback(null, address.address, address.family);
          },
        }, incoming => {
          const status = incoming.statusCode ?? 502;
          const outgoing = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined && !['set-cookie', 'connection', 'transfer-encoding'].includes(key)) outgoing.set(key, Array.isArray(value) ? value.join(', ') : value);
          if (options.method === 'HEAD' || [204, 205, 304].includes(status) || (status >= 300 && status < 400)) {
            // None of these responses needs a body. Draining a malicious
            // chunked redirect would evade maxBytes while the next hop runs.
            incoming.destroy();
            const response = new Response(null, {status, headers: outgoing});
            Object.defineProperty(response, 'url', {value: target.href});
            resolveResponse(response); return;
          }
          let source: Readable = incoming;
          const encoding = incoming.headers['content-encoding'];
          if (encoding === 'gzip') source = incoming.pipe(createGunzip());
          else if (encoding === 'br') source = incoming.pipe(createBrotliDecompress());
          else if (encoding === 'deflate') source = incoming.pipe(createInflate());
          else if (encoding && encoding !== 'identity') {incoming.destroy(); reject(new Error('Unsupported upstream encoding')); return;}
          if (source !== incoming) {
            outgoing.delete('content-encoding'); outgoing.delete('content-length');
            incoming.on('error', error => source.destroy(error));
          } else if (Number(incoming.headers['content-length']) > maxBytes) {
            incoming.destroy(); reject(new UpstreamLimitError()); return;
          }
          // Specify bytes explicitly: older Node adapters otherwise interpret
          // the source byte watermark as a count of potentially large chunks.
          const reader = (Readable.toWeb(source, {strategy: {
            highWaterMark: 64 * 1024,
            size: (chunk: Uint8Array) => chunk.byteLength,
          }}) as ReadableStream<Uint8Array>).getReader();
          let received = 0;
          const body = new ReadableStream<Uint8Array>({
            async pull(controller) {
              try {
                const {done, value} = await reader.read();
                if (done) {controller.close(); return;}
                received += value.byteLength;
                if (received > maxBytes) {await reader.cancel(); incoming.destroy(); controller.error(new UpstreamLimitError()); return;}
                controller.enqueue(value);
              } catch (error) {controller.error(error); incoming.destroy();}
            },
            async cancel() {await reader.cancel().catch(() => {}); incoming.destroy();},
          });
          const response = new Response(body, {status, headers: outgoing});
          Object.defineProperty(response, 'url', {value: target.href});
          resolveResponse(response);
        });
        req.on('error', reject); req.end();
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get('location');
      if (!location || redirects === 4) throw new Error('Invalid upstream redirect');
      url = validateMediaUrl(new URL(location, url));
      if (url.origin !== target.origin) {headers = {...headers}; delete headers.cookie;}
    }
    throw new Error('Too many upstream redirects');
  };
}

export const fetchUpstream = createUpstreamTransport();
