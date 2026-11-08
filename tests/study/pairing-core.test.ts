import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { it as test } from 'vitest';
import { createPairingHandler, type PairingStore, type PairingIntent, type PairingLink,type BrowserState, type QccIdentity, type WhetuIdentity } from '../../server/study-pairing-core';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const origin = 'https://study.example.test';
const base = '/api/integrations/nceastudy/link';
const cookieName = '__Host-nceastudy_pair';
const browserProof='b'.repeat(64),browserDigest=sha(browserProof);
const now = 1_800_000_000_000;

/** Test persistence only. NOT a production store or evidence of database/RLS safety. */
class TestStore implements PairingStore {
  intents = new Map<string, PairingIntent>();
  links: PairingLink[] = [];
  browsers=new Map<string,BrowserState>([[browserDigest,{digest:browserDigest,epoch:'1',qccAccountId:'qcc-alice',qccSessionHash:sha('server-only-bearer')}]]);
  async getBrowser(digest:string){return this.browsers.get(digest)??null;}
  async selectBrowser(input:{digest:string;qccAccountId:string|null;qccSessionHash:string|null;now:number}){const old=this.browsers.get(input.digest),changed=!old||old.qccAccountId!==input.qccAccountId||old.qccSessionHash!==input.qccSessionHash;const epoch=String(Number(old?.epoch??0)+(changed?1:0));this.browsers.set(input.digest,{...input,epoch});return {epoch,changed};}
  async create(intent: PairingIntent) { this.intents.set(intent.digest, structuredClone(intent)); return 'created' as const; }
  async read(digest: string) { return structuredClone(this.intents.get(digest) ?? null); }
  async review(input: Parameters<PairingStore['review']>[0]) {
    const intent = this.intents.get(input.digest);
    if (!intent || intent.state !== 'pending' || intent.expiresAt <= input.now || (intent.whetuSubject && (intent.whetuSubject !== input.whetuSubject||intent.whetuSessionId!==input.whetuSessionId))) return false;
    intent.whetuSubject = input.whetuSubject;intent.whetuSessionId=input.whetuSessionId; intent.challengeDigest = input.challengeDigest; return true;
  }
  async commit(input: Parameters<PairingStore['commit']>[0]) {
    const intent = this.intents.get(input.digest);
    if (!intent || intent.state !== 'pending' || intent.expiresAt <= input.now || intent.whetuSubject !== input.whetuSubject || intent.whetuSessionId!==input.whetuSessionId||intent.challengeDigest !== input.challengeDigest) return 'invalid' as const;
    if (this.links.some(link => link.qccAccountId === intent.qccAccountId || link.whetuSubject === input.whetuSubject)) return 'conflict' as const;
    this.links.push({ qccAccountId: intent.qccAccountId, whetuSubject: input.whetuSubject, linkedAt: input.now });
    intent.state = 'consumed'; return 'linked' as const;
  }
  async verifyContext(_input: { digest: string; whetuSubject: string; now: number }) { return null; }
  async revokeContext(_digest: string) {}
  async renewContext(_input:Parameters<PairingStore['renewContext']>[0]){return false;}
  async cancel(digest: string,browserDigest:string) { const intent = this.intents.get(digest); if (intent?.state === 'pending'&&intent.browserDigest===browserDigest) intent.state = 'cancelled'; }
}

function fixture({ flag }: { flag: string | undefined } = { flag: 'on' }) {
  const store = new TestStore(); let time = now; let remoteLookup = async () => {};
  let qcc: QccIdentity | null = { accountId: 'qcc-alice', username: 'Alice', sessionHash: sha('server-only-bearer'), authenticatedAt: now - 1000 };
  let whetu: WhetuIdentity | null = { subject: 'trusted-project:immutable-user-id',sessionId:'11111111-1111-4111-8111-111111111111', label: 'Student', authenticatedAt: now - 1000, ownershipVerified: true };
  const handler = createPairingHandler({
    env: { WHETU_NCEASTUDY_INTEGRATION: flag }, origin, store, now: () => time,
    identities: {
      qccFromBearer: async request => request.headers.get('authorization') === 'Bearer test-proof' ? qcc : null,
      qccFromSessionHash: async hash => qcc?.sessionHash === hash ? qcc : null,
      whetuFromVerifiedCookie: async () => { await remoteLookup(); return whetu; },
    },
  });
  const request = (action: string, body: unknown = {}, cookie?: string, extra: RequestInit = {}) => {
    const headers = new Headers({ Origin: origin, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' });
    if (action === 'start' || action === 'confirm') headers.set('Authorization', 'Bearer test-proof');
    headers.set('Cookie',`__Host-nceastudy_browser=${browserProof}${cookie?'; '+cookie:''}`);
    new Headers(extra.headers).forEach((value, key) => headers.set(key, value));
    return new Request(origin + base + '/' + action, { method: 'POST', body: JSON.stringify(body), ...extra, headers });
  };
  return { store, handler, request, duringRemoteLookup: (callback: () => Promise<void>) => { remoteLookup = callback; }, setTime: (value: number) => { time = value; }, setQcc: (value: QccIdentity | null) => { qcc = value; }, setWhetu: (value: WhetuIdentity | null) => { whetu = value; }, get qcc() { return qcc!; }, get whetu() { return whetu!; } };
}
async function begin(f: ReturnType<typeof fixture>) {
  const response = await f.handler(f.request('start', { consent: true }));
  assert.equal(response.status, 201);
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  return { response, cookie };
}
async function reviewed(f: ReturnType<typeof fixture>) {
  const started = await begin(f);
  const response = await f.handler(f.request('review', {}, started.cookie));
  assert.equal(response.status, 200);
  return { ...started, review: await response.json() as { qccUsername: string; whetuLabel: string; challenge: string } };
}

test('default-off refuses before inspecting identities or storing a transaction', async () => {
  for (const flag of [undefined, '', 'true', 'ON']) {
    const f = fixture({ flag });
    assert.equal((await f.handler(f.request('start', { consent: true }))).status, 404);
    assert.equal(f.store.intents.size, 0);
  }
});

test('start requires explicit consent and verified recent bearer ownership', async () => {
  const f = fixture();
  assert.equal((await f.handler(f.request('start', {}))).status, 400);
  assert.equal((await f.handler(f.request('start', { consent: true }, undefined, { headers: { Authorization: 'Bearer attacker' } }))).status, 401);
  f.setQcc({ ...f.qcc, authenticatedAt: now - 601_000 });
  assert.equal((await f.handler(f.request('start', { consent: true }))).status, 401);
  assert.equal(f.store.intents.size, 0);
});

test('start emits only a scoped HttpOnly host-only cookie and stores hashes, never credentials', async () => {
  const f = fixture(); const { response, cookie } = await begin(f);
  const header = response.headers.get('set-cookie')!;
  assert.match(header, /^__Host-nceastudy_pair=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=300$/);
  assert.doesNotMatch(header, /Domain=/);
  assert.deepEqual(await response.json(), { started: true, expiresIn: 300,intent:sha(cookie.split('=')[1]!) });
  const proof = cookie.split('=')[1]!;
  const stored = [...f.store.intents.values()][0]!;
  assert.equal(stored.digest, sha(proof));
  assert.equal(stored.scope, 'qcc:whetu:link:v1');
  assert.equal(stored.returnPath, '/nceastudy');
  assert.equal(stored.expiresAt, now + 300_000);
  assert.ok(!JSON.stringify(stored).includes(proof));
  assert.ok(!JSON.stringify(stored).includes('Bearer test-proof'));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('every state-changing request rejects missing/mismatched origin and cross-site fetch metadata', async () => {
  const f = fixture();
  for (const headers of [{ Origin: '' }, { Origin: 'https://evil.test' }, { 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[]) {
    assert.equal((await f.handler(f.request('start', { consent: true }, undefined, { headers }))).status, 403);
  }
  assert.equal(f.store.intents.size, 0);
});

test('rejects query credentials, extra fields, non-JSON and oversized bodies', async () => {
  const f = fixture();
  const query = new Request(origin + base + '/start?token=bad', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"consent":true}' });
  assert.equal((await f.handler(query)).status, 400);
  assert.equal((await f.handler(f.request('start', { consent: true, accountId: 'attacker' }))).status, 400);
  assert.equal((await f.handler(f.request('start', { consent: true }, undefined, { headers: { 'Content-Type': 'text/plain' } }))).status, 415);
  assert.equal((await f.handler(f.request('start', { consent: true, padding: 'x'.repeat(3000) }))).status, 413);
  assert.equal(f.store.intents.size, 0);
});

test('review requires verified recent Whetū ownership and exposes labels, not principal IDs', async () => {
  const f = fixture(); const { cookie } = await begin(f);
  f.setWhetu(null);
  assert.equal((await f.handler(f.request('review', {}, cookie))).status, 401);
  f.setWhetu({ subject: 'project:user',sessionId:'11111111-1111-4111-8111-111111111111', label: 'Student', authenticatedAt: now, ownershipVerified: false });
  assert.equal((await f.handler(f.request('review', {}, cookie))).status, 401);
  f.setWhetu({ ...f.whetu, ownershipVerified: true, authenticatedAt: now - 601_000 });
  assert.equal((await f.handler(f.request('review', {}, cookie))).status, 401);
  f.setWhetu({ ...f.whetu, authenticatedAt: now });
  const response = await f.handler(f.request('review', {}, cookie));
  assert.deepEqual(Object.keys(await response.json()).sort(), ['challenge', 'qccUsername', 'whetuLabel']);
  assert.equal(f.store.links.length, 0);
});

test('requires separate Whetū pair confirmation and consumes the intent exactly once', async () => {
  const f = fixture(); const { cookie, review } = await reviewed(f);
  assert.equal(review.qccUsername, 'Alice'); assert.equal(review.whetuLabel, 'Student');
  assert.equal((await f.handler(f.request('confirm', { challenge: review.challenge }, cookie))).status, 400);
  const body = { consent: true, challenge: review.challenge };
  const responses = await Promise.all([f.handler(f.request('confirm', body, cookie)), f.handler(f.request('confirm', body, cookie))]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.deepEqual(f.store.links, [{ qccAccountId: 'qcc-alice', whetuSubject: 'trusted-project:immutable-user-id', linkedAt: now }]);
  const cookies = responses.find(response => response.status === 200)!.headers.getSetCookie();
  assert.ok(cookies.some(value => value.endsWith('Max-Age=0')));
  assert.ok(cookies.some(value => value.startsWith('__Host-nceastudy_context=') && value.endsWith('Max-Age=900')));
});

test('expiration, cancelled intent and replayed review challenge never write a link', async () => {
  const f = fixture(); const { cookie, review } = await reviewed(f);
  const nextReview = await f.handler(f.request('review', {}, cookie)); assert.equal(nextReview.status, 200);
  assert.equal((await f.handler(f.request('confirm', { consent: true, challenge: review.challenge }, cookie))).status, 409);
  assert.equal((await f.handler(f.request('cancel', {intent:sha(cookie.split('=')[1]!)}, cookie))).status, 200);
  const challenge = (await nextReview.json()).challenge;
  assert.equal((await f.handler(f.request('confirm', { consent: true, challenge }, cookie))).status, 409);
  assert.equal(f.store.links.length, 0);
  const g = fixture(); const started = await reviewed(g); g.setTime(now + 300_000);
  assert.equal((await g.handler(g.request('confirm', { consent: true, challenge: started.review.challenge }, started.cookie))).status, 409);
  assert.equal(g.store.links.length, 0);
});

test('changed Whetū account or revoked QCC session invalidates an in-flight confirmation', async () => {
  for (const changed of ['qcc', 'whetu']) {
    const f = fixture(); const { cookie, review } = await reviewed(f);
    if (changed === 'qcc') f.setQcc(null); else f.setWhetu({ ...f.whetu, subject: 'project:other-user' });
    assert.ok([401, 409].includes((await f.handler(f.request('confirm', { consent: true, challenge: review.challenge }, cookie))).status));
    assert.equal(f.store.links.length, 0);
  }
});

test('binding cannot be retargeted after first review, even with the same transaction cookie', async () => {
  const f = fixture(); const { cookie } = await reviewed(f);
  f.setWhetu({ ...f.whetu, subject: 'project:other-user' });
  assert.equal((await f.handler(f.request('review', {}, cookie))).status, 409);
  assert.equal(f.store.links.length, 0);
});

test('pre-existing binding conflicts never overwrite either principal mapping', async () => {
  const f = fixture();
  f.store.links.push({ qccAccountId: 'someone-else', whetuSubject: f.whetu.subject, linkedAt: now - 1000 });
  const before = JSON.stringify(f.store.links);
  const { cookie, review } = await reviewed(f);
  const response = await f.handler(f.request('confirm', { consent: true, challenge: review.challenge }, cookie));
  assert.equal(response.status, 409);
  assert.equal(JSON.stringify(f.store.links), before);
  assert.ok(!JSON.stringify(await response.json()).includes('someone-else'));
});

test('malformed or duplicate transaction cookies cannot select a valid transaction', async () => {
  const f = fixture(); const { cookie } = await begin(f);
  for (const candidate of [undefined, `${cookieName}=short`, `${cookie}; ${cookieName}=${'a'.repeat(64)}`]) {
    assert.equal((await f.handler(f.request('review', {}, candidate))).status, 409);
  }
  assert.equal(f.store.links.length, 0);
});

test('future-dated recent authentication is rejected rather than extending ownership indefinitely', async () => {
  const f = fixture(); f.setQcc({ ...f.qcc, authenticatedAt: now + 60_000 });
  assert.equal((await f.handler(f.request('start', { consent: true }))).status, 401);
  assert.equal(f.store.intents.size, 0);
});


test('final approval rejects a different currently presented host bearer while old QCC session remains valid', async () => {
  const f = fixture(); const { cookie, review } = await reviewed(f);
  const response = await f.handler(f.request('confirm', { consent: true, challenge: review.challenge }, cookie, { headers: { Authorization: 'Bearer switched-account' } }));
  assert.equal(response.status, 401);
  assert.equal(f.store.links.length, 0);
});

test('authentication expiration while awaiting a remote identity lookup cannot commit', async () => {
  const f = fixture(); const { cookie, review } = await reviewed(f);
  f.setQcc({ ...f.qcc, authenticatedAt: now - 599_000 });
  f.duringRemoteLookup(async () => { await Promise.resolve(); f.setTime(now + 2000); });
  assert.equal((await f.handler(f.request('confirm', { consent: true, challenge: review.challenge }, cookie))).status, 401);
  assert.equal(f.store.links.length, 0);
});
