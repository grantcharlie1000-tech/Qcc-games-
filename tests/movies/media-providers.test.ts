import {describe, expect, it} from 'vitest';
import {resolveProvider} from '../../netlify/functions/lib/media-providers';
import type {PlaybackRequest, UpstreamTransport} from '../../netlify/functions/lib/media-types';

const movie: PlaybackRequest = {provider:'framextv', kind:'movie', id:550};
const json = (body: unknown) => Response.json(body);

describe('server-side playback providers', () => {
  it('resolves FrameXTV video and captions without loading its tracking/player scripts', async () => {
    const transport: UpstreamTransport = async url => {
      expect(url.origin + url.pathname).toBe('https://api.framextv.cc/api/stream');
      expect(url.searchParams.get('id')).toBe('550');
      expect(url.searchParams.get('type')).toBe('movie');
      return json({success:true,provider:'titan',sources:[{url:'https://cdn.example.test/movie.mp4',type:'mp4',quality:'1080p'}],subtitles:[{url:'https://cache.vdrk.site/english.vtt',label:'English',language:'en'}]});
    };
    expect(await resolveProvider(movie, transport)).toMatchObject({url:'https://cdn.example.test/movie.mp4',type:'mp4',subtitles:[{url:'https://cache.vdrk.site/english.vtt',label:'English',language:'en'}]});
  });

  it('preserves the selected television episode in upstream metadata requests', async () => {
    const transport: UpstreamTransport = async url => {
      expect(url.searchParams.get('type')).toBe('tv');
      expect(url.searchParams.get('season')).toBe('2');
      expect(url.searchParams.get('episode')).toBe('3');
      return json({success:true,sources:[{url:'https://cdn.example.test/show.m3u8',type:'hls'}]});
    };
    expect((await resolveProvider({...movie,kind:'tv',season:2,episode:3},transport)).type).toBe('hls');
  });

  it('ignores unsupported DASH and invalid URLs when a compatible source exists', async () => {
    const transport: UpstreamTransport = async () => json({success:true,sources:[
      {url:'https://cdn.example.test/encrypted.mpd',type:'dash'},
      {url:'javascript:alert(1)',type:'mp4'},
      {url:'https://cdn.example.test/film.webm',type:'webm'},
    ]});
    expect(await resolveProvider(movie,transport)).toMatchObject({url:'https://cdn.example.test/film.webm',type:'webm'});
  });

  it('builds the VixSrc playlist from its literal configuration and standard playback parameters', async () => {
    const transport: UpstreamTransport = async (url, options) => {
      expect(options?.headers?.Referer).toBe('https://vixsrc.to/');
      if (url.pathname === '/api/tv/1399/2/3') return json({src:'/embed/170060?token=page-token&expires=2000000000&lang=en'});
      expect(url.pathname).toBe('/embed/170060');
      return new Response(`<script>window.masterPlaylist = {
        params: {'token':'manifest-token','expires':'2000000000','asn':''},
        url: 'https://vixsrc.to/playlist/170060',
      }; window.canPlayFHD = true;</script>`);
    };
    const result = await resolveProvider({provider:'vixsrc',kind:'tv',id:1399,season:2,episode:3},transport);
    expect(result).toMatchObject({type:'hls',headers:{Referer:'https://vixsrc.to/',Origin:'https://vixsrc.to'}});
    expect(result.url).toBe('https://vixsrc.to/playlist/170060?token=manifest-token&expires=2000000000&h=1&lang=en');
  });

  it('rejects a provider response trying to redirect metadata resolution to another host', async () => {
    const transport: UpstreamTransport = async () => json({src:'https://127.0.0.1/private'});
    await expect(resolveProvider({...movie,provider:'vixsrc'},transport)).rejects.toMatchObject({code:'unavailable'});
  });

  it('does not execute JavaScript embedded in a VixSrc configuration', async () => {
    let visits = 0;
    const transport: UpstreamTransport = async () => ++visits === 1
      ? json({src:'/embed/170060'})
      : new Response(`<script>window.masterPlaylist = (()=>{throw new Error('executed');})();</script>`);
    await expect(resolveProvider({...movie,provider:'vixsrc'},transport)).rejects.toMatchObject({code:'unavailable'});
  });

  it('hands VidLink to the isolated server browser adapter', async () => {
    const transport: UpstreamTransport = async () => {throw new Error('HTTP resolver should not guess the WASM-derived ID');};
    const resolved = {url:'https://cdn.example.test/vidlink.m3u8',type:'hls' as const};
    expect(await resolveProvider({...movie,provider:'vidlink'},transport,async input => {
      expect(input).toEqual({...movie,provider:'vidlink'});
      return resolved;
    })).toEqual(resolved);
  });

  it('reports unavailable browser support honestly instead of falling back to a direct iframe', async () => {
    await expect(resolveProvider({...movie,provider:'vidlink'},async()=>json({}))).rejects.toMatchObject({code:'unsupported'});
  });

  it('stops at a VidSrc verification gate before calling its protected stream API', async () => {
    const visited: string[] = [];
    const transport: UpstreamTransport = async (url, options) => {
      visited.push(url.hostname + url.pathname);
      if (url.hostname === 'vidsrc.sh') return json({src:'https://stellarconductornexus.com/embed/movie/550?vs=landing-token'});
      if (url.pathname === '/embed/movie/550') {
        expect(options?.headers?.Referer).toBe('https://vidsrc.sh/');
        return new Response('<script>window.CFG = {"playerUrl":"/embed/player/movie/550?vs=player-token"};</script>');
      }
      expect(options?.headers?.Referer).toBe('https://stellarconductornexus.com/');
      return new Response('<script>window.CONFIG = {"api":"https://data.vidsrc.sh/api.php?type=movie&tmdb=550&stream_urls","turnstile":true,"apiToken":"single-use"};</script>');
    };
    await expect(resolveProvider({...movie,provider:'vidsrc'},transport)).rejects.toMatchObject({code:'verification_required'});
    expect(visited).toEqual(['vidsrc.sh/vs_src.php','stellarconductornexus.com/embed/movie/550','stellarconductornexus.com/embed/player/movie/550']);
  });

  it('resolves a normal ungated VidSrc stream response and uses the supplied API token', async () => {
    const transport: UpstreamTransport = async url => {
      if (url.hostname === 'vidsrc.sh') return json({src:'https://stellarconductornexus.com/embed/movie/550?vs=landing-token'});
      if (url.pathname === '/embed/movie/550') return new Response('<script>window.CFG = {"playerUrl":"/embed/player/movie/550?vs=player-token"};</script>');
      if (url.pathname === '/embed/player/movie/550') return new Response('<script>window.CONFIG = {"api":"https://data.vidsrc.sh/api.php?type=movie&tmdb=550&stream_urls","turnstile":false,"apiToken":"single-use"};</script>');
      expect(url.origin + url.pathname).toBe('https://data.vidsrc.sh/api.php');
      expect(url.searchParams.get('api_token')).toBe('single-use');
      return json({status_code:200,data:{stream_urls:['https://cdn.example.test/stream.m3u8']}});
    };
    expect(await resolveProvider({...movie,provider:'vidsrc'},transport)).toMatchObject({url:'https://cdn.example.test/stream.m3u8',type:'hls'});
  });

  it('rejects encrypted VidSrc results rather than evaluating provider code', async () => {
    const transport: UpstreamTransport = async url => {
      if (url.hostname === 'vidsrc.sh') return json({src:'https://stellarconductornexus.com/embed/movie/550'});
      if (url.pathname === '/embed/movie/550') return new Response('<script>window.CFG = {"playerUrl":"/embed/player/movie/550"};</script>');
      if (url.pathname === '/embed/player/movie/550') return new Response('<script>window.CONFIG = {"api":"https://data.vidsrc.sh/api.php?type=movie&tmdb=550&stream_urls","turnstile":false};</script>');
      return json({status_code:200,vs:{wasm_url:'https://data.vidsrc.sh/decryptor.wasm'},data:{stream_urls:'encrypted'}});
    };
    await expect(resolveProvider({...movie,provider:'vidsrc'},transport)).rejects.toMatchObject({code:'unsupported'});
  });

  it('rejects invalid title identifiers and episode input before any upstream request', async () => {
    const transport: UpstreamTransport = async () => {throw new Error('must not request');};
    await expect(resolveProvider({...movie,id:0},transport)).rejects.toMatchObject({code:'unavailable'});
    await expect(resolveProvider({...movie,kind:'tv',season:0,episode:1},transport)).rejects.toMatchObject({code:'unavailable'});
  });
});
