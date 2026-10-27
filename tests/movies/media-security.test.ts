import {describe, expect, it, vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {request as httpsRequest} from 'node:https';
import {createUpstreamTransport, validateMediaUrl, publicAddress, resolvePublicAddress, upstreamHeaders} from '../../netlify/functions/lib/media-security';

vi.mock('node:https', () => ({request: vi.fn()}));

describe('media relay upstream boundary', () => {
  it('rejects non-HTTPS, credentials, IP literals, local names and unexpected ports before connecting', () => {
    for (const value of ['http://cdn.example.org/a', 'https://user:pass@cdn.example.org/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://2130706433/a', 'https://cdn.example.org:444/a', 'https://localhost/a', 'https://metadata.google.internal/a', 'https://foo.local/a', 'file:///etc/passwd']) {
      expect(() => validateMediaUrl(value)).toThrow();
    }
    expect(validateMediaUrl('https://media.example.org/path/a.m3u8?signature=ok').hostname).toBe('media.example.org');
  });
  it('blocks private, reserved and mapped private addresses in either IP family', () => {
    for (const ip of ['0.0.0.0', '127.1.2.3', '10.20.30.40', '172.16.1.1', '192.168.1.5', '169.254.169.254', '100.100.100.200', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::', '::1', 'fe80::1', 'fc00::1', '2001:db8::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254']) expect(publicAddress(ip), ip).toBe(false);
    expect(publicAddress('8.8.8.8')).toBe(true);
    expect(publicAddress('2606:4700:4700::1111')).toBe(true);
  });
  it('rejects a mixed public/private DNS answer instead of trusting one safe address', async () => {
    await expect(resolvePublicAddress('media.example.org', async () => [{address: '8.8.8.8', family: 4}, {address: '10.0.0.1', family: 4}])).rejects.toThrow();
    await expect(resolvePublicAddress('media.example.org', async () => [])).rejects.toThrow();
    await expect(resolvePublicAddress('media.example.org', async () => [{address: '8.8.8.8', family: 4}])).resolves.toEqual({address: '8.8.8.8', family: 4});
  });
  it('constructs upstream headers from server metadata without forwarding visitor identity', () => {
    const headers = upstreamHeaders({authorization: 'visitor-token', 'x-forwarded-for': '192.0.2.5', forwarded: 'for=visitor', 'user-agent': 'visitor-browser', referer: 'https://vixsrc.to/', origin: 'https://vixsrc.to', 'x-playback-environment': 'hls', range: 'bytes=0-1023'});
    expect(headers).not.toHaveProperty('authorization');
    expect(headers).not.toHaveProperty('x-forwarded-for');
    expect(headers).not.toHaveProperty('forwarded');
    expect(headers['user-agent']).not.toBe('visitor-browser');
    expect(headers.referer).toBe('https://vixsrc.to/');
    expect(headers.range).toBe('bytes=0-1023');
    expect(() => upstreamHeaders({referer: 'https://example.org/\r\nCookie: secret'})).toThrow();
  });
  it('cancels promptly when a DNS resolver never settles', async () => {
    const controller = new AbortController();
    const transport = createUpstreamTransport(() => new Promise(() => {}));
    const pending = transport(new URL('https://media.example.org/source.mp4'), {signal: controller.signal});
    const rejected = expect(pending).rejects.toThrow('Caller cancelled');
    controller.abort(new Error('Caller cancelled'));
    await rejected;
  }, 1000);
  it('applies the transport deadline while waiting for DNS, before any socket exists', async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    try {
      const transport = createUpstreamTransport(() => new Promise(() => {}));
      const pending = transport(new URL('https://media.example.org/source.mp4'));
      const rejected = expect(pending).rejects.toMatchObject({name: 'TimeoutError'});
      deadline.abort(new DOMException('Resolution deadline exceeded', 'TimeoutError'));
      await rejected;
    } finally { timeout.mockRestore(); }
  }, 1000);
  it('discards a chunked redirect body instead of draining it while following the redirect', async () => {
    let produced = 0;
    const chunk = Buffer.alloc(1024 * 1024);
    const redirect = Object.assign(new Readable({read() {
      setImmediate(() => {
        if (this.destroyed) return;
        produced += chunk.byteLength;
        this.push(chunk);
        if (produced >= 32 * 1024 * 1024) this.push(null);
      });
    }}), {statusCode: 302, headers: {location: 'https://media.example.org/final', 'transfer-encoding': 'chunked'}});
    vi.mocked(httpsRequest).mockImplementation(((url: URL, _options: unknown, receive: (value: Readable) => void) => {
      const request = new EventEmitter() as EventEmitter & {end: () => void};
      request.end = () => {
        if (url.pathname === '/redirect') receive(redirect);
        else setTimeout(() => receive(Object.assign(Readable.from([Buffer.from('ok')]), {statusCode: 200, headers: {'content-type': 'text/plain'}})), 10);
      };
      return request;
    }) as typeof httpsRequest);
    try {
      const transport = createUpstreamTransport(async () => [{address: '8.8.8.8', family: 4}]);
      const response = await transport(new URL('https://media.example.org/redirect'), {maxBytes: 1024});
      expect(await response.text()).toBe('ok');
      expect(produced).toBe(0);
      expect(redirect.destroyed).toBe(true);
    } finally { redirect.destroy(); vi.mocked(httpsRequest).mockReset(); }
  });
  it('bounds unread upstream prefetch in bytes rather than treating the byte watermark as a chunk count', async () => {
    let produced = 0;
    const chunk = Buffer.alloc(64 * 1024);
    const incoming = Object.assign(new Readable({read() {
      if (produced >= 32 * 1024 * 1024) { this.push(null); return; }
      produced += chunk.byteLength;
      this.push(chunk);
    }}), {statusCode: 200, headers: {'content-type': 'application/octet-stream'}});
    vi.mocked(httpsRequest).mockImplementation(((_url: URL, _options: unknown, receive: (value: Readable) => void) => {
      const request = new EventEmitter() as EventEmitter & {end: () => void};
      request.end = () => receive(incoming);
      return request;
    }) as typeof httpsRequest);
    let response: Response | undefined;
    try {
      const transport = createUpstreamTransport(async () => [{address: '8.8.8.8', family: 4}]);
      response = await transport(new URL('https://media.example.org/large-asset'), {maxBytes: 1024 * 1024});
      await new Promise<void>(resolve => setImmediate(resolve));
      // The caller has not consumed the body. Only a few bounded chunks may
      // wait across the socket, Node-to-Web adapter and response queues.
      expect(produced).toBeLessThanOrEqual(256 * 1024);
    } finally {
      await response?.body?.cancel();
      incoming.destroy();
      vi.mocked(httpsRequest).mockReset();
    }
  });
});
