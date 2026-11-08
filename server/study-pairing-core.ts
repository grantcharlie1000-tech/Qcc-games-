import { createHash, randomBytes } from 'node:crypto';

/** Server-only staging core, not registered with a live route. */
export interface QccIdentity {
  accountId: string;
  username: string;
  sessionHash: string;
  /** Verified authentication time for THIS session, never last_used. */
  authenticatedAt: number;
}
export interface WhetuIdentity {
  /** Immutable project/issuer-qualified Supabase subject, never email. */
  subject: string;
  sessionId: string;
  label: string;
  /** Verified authentication time for THIS session, not user.last_sign_in_at. */
  authenticatedAt: number;
  ownershipVerified: boolean;
}
export interface PairingIntent {
  digest: string;
  scope: 'qcc:whetu:link:v1';
  returnPath: '/nceastudy';
  qccAccountId: string;
  qccSessionHash: string;
  browserDigest: string;
  browserEpoch: string;
  qccConsentedAt: number;
  expiresAt: number;
  state: 'pending' | 'consumed' | 'cancelled';
  whetuSubject?: string;
  whetuSessionId?: string;
  challengeDigest?: string;
}
export interface PairingLink { qccAccountId: string; whetuSubject: string; linkedAt: number; }
export interface BrowserState {digest:string;epoch:string;qccAccountId:string|null;qccSessionHash:string|null;}
export interface PairingStore {
  selectBrowser(input:{digest:string;qccAccountId:string|null;qccSessionHash:string|null;now:number}):Promise<{epoch:string;changed:boolean}|null>;
  getBrowser(digest:string):Promise<BrowserState|null>;
  /** Durable insert plus bounded per-account rate budget, atomic; hash only. */
  create(intent: PairingIntent): Promise<'created' | 'rate-limited' | 'invalid'>;
  read(digest: string): Promise<PairingIntent | null>;
  /** Atomically bind once to subject, or rotate challenge for that same subject. */
  review(input: { digest: string; browserDigest:string;browserEpoch:string; whetuSubject: string; whetuSessionId:string; challengeDigest: string; now: number }): Promise<boolean>;
  /**
   * One durable DB transaction: lock intent, validate state/scope/expiry/binding/
   * challenge, enforce BOTH immutable unique principal constraints, insert link,
   * mark consumed. Never overwrite an existing link or copy/delete either app's
   * data. A plain SELECT then INSERT, or two separate databases, is NOT atomic.
   */
  commit(input: { digest: string; browserDigest:string;browserEpoch:string;whetuSessionId:string; challengeDigest: string; whetuSubject: string; whetuAuthenticatedAt: number; contextDigest: string; contextExpiresAt: number; now: number }): Promise<'linked' | 'invalid' | 'conflict'>;
  cancel(digest: string,browserDigest:string): Promise<void>;
  verifyContext(input: { digest: string;browserDigest:string;whetuSessionId:string; whetuSubject: string; now: number }): Promise<PairingLink | null>;
  revokeContext(digest: string): Promise<void>;
  renewContext(input:{browserDigest:string;browserEpoch:string;qccAccountId:string;qccSessionHash:string;whetuSubject:string;whetuSessionId:string;contextDigest:string;contextExpiresAt:number;now:number}):Promise<boolean>;
}
export interface PairingDependencies {
  env: Readonly<Record<string, string | undefined>>;
  /** Trusted deployment configuration, not Host/X-Forwarded-Host/user input. */
  origin: string;
  store: PairingStore;
  identities: {
    qccFromBearer(request: Request): Promise<QccIdentity | null>;
    qccFromSessionHash(hash: string): Promise<QccIdentity | null>;
    whetuFromVerifiedCookie(request: Request): Promise<WhetuIdentity | null>;
  };
  now?: () => number;
}
const BASE = '/api/integrations/nceastudy/link';
const COOKIE = '__Host-nceastudy_pair';
const CONTEXT_COOKIE = '__Host-nceastudy_context';
const BROWSER_COOKIE = '__Host-nceastudy_browser';
const TTL = 300_000;
const RECENT_AUTH = 600_000;
const MAX_BODY = 2048;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const proof = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const recent = (time: number, now: number) => Number.isSafeInteger(time) && time <= now && now - time < RECENT_AUTH;
const safeLabel = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) || 'Whetū student';
const cookie = (value: string, age: number, name = COOKIE) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function readProof(request: Request, name = COOKIE): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
  if (values.length !== 1) return null;
  const value = values[0]!.slice(name.length + 1);
  return proof(value) ? value : null;
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw 413;
  let length = 0; const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  if (reader) try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_BODY) { await reader.cancel(); throw 413; }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let data: unknown;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw 400; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw 400;
  return data as Record<string, unknown>;
}

/**
 * Local staging implementation only. No default store or browser identity
 * fallback is supplied. Route registration, verified session adapters, one
 * durable authority, edge IP rate-limits and release review remain mandatory.
 * This does not create an SSO session or authorise any learning-data request.
 */
export function createPairingHandler(deps: PairingDependencies) {
  const enabled = deps.env.WHETU_NCEASTUDY_INTEGRATION === 'on';
  const configured = new URL(deps.origin);
  if (configured.protocol !== 'https:' || configured.origin !== deps.origin) throw new Error('Pairing requires a trusted exact HTTPS origin.');
  const now = deps.now ?? Date.now;
  const respond = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, {
    status, headers: { 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra },
  });
  const invalid = () => respond({ error: 'Pairing expired, changed or unavailable. Start again.' }, 409);
  return async (request: Request): Promise<Response> => {
    if (!enabled) return respond({ error: 'Not found.' }, 404);
    const url = new URL(request.url);
    const action = url.pathname.slice(BASE.length + 1);
    if (url.origin !== deps.origin || !url.pathname.startsWith(BASE + '/') || !['start', 'review', 'confirm', 'cancel'].includes(action)) return respond({ error: 'Not found.' }, 404);
    if (url.search) return respond({ error: 'Query parameters are not accepted.' }, 400);
    if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
    // Origin is mandatory, including in non-browser clients. CORS alone is not CSRF protection.
    const fetchSite = request.headers.get('sec-fetch-site');
    if (request.headers.get('origin') !== deps.origin || (fetchSite !== null && fetchSite !== 'same-origin')) return respond({ error: 'Request not allowed.' }, 403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return respond({ error: 'Send JSON.' }, 415);
    try {
      const data = await readBody(request);
      const keys = Object.keys(data).sort().join(',');
      if (action === 'start' && (keys !== 'consent' || data.consent !== true)) return respond({ error: 'Explicit account-link consent is required.' }, 400);
      if (action === 'review' && keys !== '') return respond({ error: 'Invalid request.' }, 400);
      if (action === 'cancel' && (keys !== 'intent' || !proof(data.intent))) return respond({error:'Choose the pending intent to cancel.'},400);
      if (action === 'confirm' && (keys !== 'challenge,consent' || data.consent !== true || !proof(data.challenge))) return respond({ error: 'Confirm the displayed account pair explicitly.' }, 400);
      const browserProof=readProof(request,BROWSER_COOKIE);
      if(!browserProof)return invalid();
      const browserDigest=sha(browserProof),browser=await deps.store.getBrowser(browserDigest);
      if(!browser)return invalid();
      if(action==='cancel'){await deps.store.cancel(data.intent as string,browserDigest);return respond({cancelled:true});}
      if (action === 'start') {
        const qcc = await deps.identities.qccFromBearer(request);
        const time = now();
        if (!qcc || !proof(qcc.sessionHash) || !qcc.accountId || !/^[A-Za-z0-9_.-]{3,24}$/.test(qcc.username) || !recent(qcc.authenticatedAt, time)) return respond({ error: 'Sign in to NCEAStudy again before linking.' }, 401);
        if(browser.qccAccountId!==qcc.accountId||browser.qccSessionHash!==qcc.sessionHash)return invalid();
        const transaction = secret();
        const result = await deps.store.create({ digest: sha(transaction), scope: 'qcc:whetu:link:v1', returnPath: '/nceastudy', qccAccountId: qcc.accountId, qccSessionHash: qcc.sessionHash,browserDigest,browserEpoch:browser.epoch, qccConsentedAt: time, expiresAt: time + TTL, state: 'pending' });
        if(result==='invalid')return invalid();
        if (result !== 'created') return respond({ error: 'Too many pairing attempts. Try again later.' }, 429, { 'Retry-After': '60' });
        return respond({ started: true, expiresIn: 300,intent:sha(transaction) }, 201, { 'Set-Cookie': cookie(transaction, 300) });
      }
      const transaction = readProof(request);
      if (!transaction) return invalid();
      const digest = sha(transaction);
      const intent = await deps.store.read(digest);
      const time = now();
      if (!intent || intent.browserDigest!==browserDigest||intent.browserEpoch!==browser.epoch||browser.qccAccountId!==intent.qccAccountId||browser.qccSessionHash!==intent.qccSessionHash||intent.digest !== digest || intent.scope !== 'qcc:whetu:link:v1' || intent.returnPath !== '/nceastudy' || intent.state !== 'pending' || intent.expiresAt <= time || intent.qccConsentedAt > time || intent.expiresAt !== intent.qccConsentedAt + TTL) return invalid();
      const whetu = await deps.identities.whetuFromVerifiedCookie(request);
      if (!whetu || !whetu.subject || !whetu.sessionId || !whetu.ownershipVerified || !recent(whetu.authenticatedAt, now())) return respond({ error: 'Verify and sign in to Whetū again before linking.' }, 401);
      if (intent.whetuSubject && (intent.whetuSubject !== whetu.subject||intent.whetuSessionId!==whetu.sessionId)) return invalid();
      const qcc = await deps.identities.qccFromSessionHash(intent.qccSessionHash);
      if (!qcc || qcc.accountId !== intent.qccAccountId || qcc.sessionHash !== intent.qccSessionHash || !recent(qcc.authenticatedAt, now())) return respond({ error: 'Sign in to NCEAStudy again before linking.' }, 401);
      if (action === 'review') {
        const challenge = secret();
        if (!await deps.store.review({ digest,browserDigest,browserEpoch:browser.epoch,whetuSessionId:whetu.sessionId, whetuSubject: whetu.subject, challengeDigest: sha(challenge), now: now() })) return invalid();
        return respond({ qccUsername: qcc.username, whetuLabel: safeLabel(whetu.label), challenge });
      }
      const currentQcc = await deps.identities.qccFromBearer(request);
      if (!currentQcc || currentQcc.accountId !== intent.qccAccountId || currentQcc.sessionHash !== intent.qccSessionHash || !recent(currentQcc.authenticatedAt, now()) || !recent(whetu.authenticatedAt, now())) return respond({ error: 'Account changed or authentication expired. Start again.' }, 401);
      const context = secret();
      // Store must check the challenge, bound subject and expiry under its write
      // lock again. The earlier read is NOT a substitute for atomic validation.
      const result = await deps.store.commit({ digest,browserDigest,browserEpoch:browser.epoch,whetuSessionId:whetu.sessionId, whetuSubject: whetu.subject, challengeDigest: sha(data.challenge as string), whetuAuthenticatedAt: whetu.authenticatedAt, contextDigest: sha(context), contextExpiresAt: now() + 900_000, now: now() });
      if (result !== 'linked') return invalid();
      const response = respond({ linked: true });
      response.headers.append('Set-Cookie', cookie('', 0));
      response.headers.append('Set-Cookie', cookie(context, 900, CONTEXT_COOKIE));
      return response;
    } catch (error) {
      if (error === 413) return respond({ error: 'Request too large.' }, 413);
      if (error === 400) return respond({ error: 'Invalid JSON.' }, 400);
      // Never log errors or forward provider messages: these can contain tokens,
      // SQL parameters, cookies or account data. No retry of uncertain commits.
      return respond({ error: 'Pairing temporarily unavailable.' }, 503);
    }
  };
}
