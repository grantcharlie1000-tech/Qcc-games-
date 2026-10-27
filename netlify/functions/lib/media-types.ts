export const MEDIA_PROVIDERS = ['framextv', 'vidlink', 'vixsrc', 'vidsrc'] as const;
export type MediaProvider = typeof MEDIA_PROVIDERS[number];
export type MediaType = 'hls' | 'mp4' | 'webm';
export interface PlaybackRequest {
  provider: MediaProvider;
  kind: 'movie' | 'tv';
  id: number;
  season?: number;
  episode?: number;
}
export interface ResolvedMedia {
  url: string;
  type: MediaType;
  subtitles?: {url: string; label: string; language: string}[];
  headers?: Record<string, string>;
}
export interface UpstreamOptions {
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  maxBytes?: number;
  signal?: AbortSignal;
}
export type UpstreamTransport = (url: URL, options?: UpstreamOptions) => Promise<Response>;
export class ProviderError extends Error {
  constructor(public readonly code: 'unavailable' | 'verification_required' | 'unsupported', message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}
