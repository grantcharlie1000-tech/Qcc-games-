import {describe,expect,it} from 'vitest';
import {createTurnHandler,publicIceServers,LIMIT_PER_WINDOW} from '../../src/multiplayer/turn-server';
import {iceServers,resetIceCache,validIceServers} from '../../src/multiplayer/ice';

const cloudflare={iceServers:[
  {urls:['stun:stun.cloudflare.com:3478','stun:stun.cloudflare.com:53']},
  {urls:['turn:turn.cloudflare.com:3478?transport=udp','turn:turn.cloudflare.com:53?transport=udp','turns:turn.cloudflare.com:443?transport=tcp'],username:'u',credential:'c'}
]};
const post=(headers:Record<string,string>={})=>new Request('https://games.example/.netlify/functions/turn',{method:'POST',headers});

describe('TURN credential function',()=>{
  it('keeps the master token server-side and returns only temporary TURN servers',async()=>{
    let seen:RequestInit|undefined,url='';
    const handle=createTurnHandler({keyId:'key_12345678',apiToken:'secret-token'},async(u,init)=>{url=u;seen=init;return Response.json(cloudflare);});
    const response=await handle(post(),'1.2.3.4');const body=await response.json();
    expect(response.status).toBe(200);
    expect(url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/key_12345678/credentials/generate-ice-servers');
    expect((seen!.headers as Record<string,string>).Authorization).toBe('Bearer secret-token');
    expect(JSON.stringify(body)).not.toContain('secret-token');
    expect(body.iceServers).toEqual([{urls:['turn:turn.cloudflare.com:3478?transport=udp','turns:turn.cloudflare.com:443?transport=tcp'],username:'u',credential:'c'}]);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('rate-limits each client and refuses other methods and origins',async()=>{
    const handle=createTurnHandler({keyId:'key_12345678',apiToken:'t'},async()=>Response.json(cloudflare));
    for(let i=0;i<LIMIT_PER_WINDOW;i++)expect((await handle(post(),'9.9.9.9')).status).toBe(200);
    expect((await handle(post(),'9.9.9.9')).status).toBe(429);
    expect((await handle(post(),'8.8.8.8')).status).toBe(200);
    expect((await handle(new Request('https://games.example/x'),'7.7.7.7')).status).toBe(405);
    expect((await handle(post({origin:'https://evil.example'}),'7.7.7.7')).status).toBe(403);
  });
  it('reports missing configuration and upstream failures without leaking details',async()=>{
    expect((await createTurnHandler({})(post(),'1.1.1.1')).status).toBe(503);
    expect((await createTurnHandler({keyId:'key_12345678',apiToken:'t'},async()=>new Response('no',{status:401}))(post(),'1.1.1.1')).status).toBe(502);
  });
  it('accepts the older single-object response shape',()=>{
    expect(publicIceServers({iceServers:{urls:['turn:a:3478'],username:'u',credential:'c'}})).toHaveLength(1);
  });
});

describe('client ICE configuration',()=>{
  it('adds TURN when the function answers and falls back to STUN with a reason',async()=>{
    resetIceCache();
    const ok=await iceServers(async()=>Response.json({iceServers:[cloudflare.iceServers[1]],ttl:3600}),0);
    expect(ok.turn).toBe(true);expect(ok.iceServers.length).toBe(2);
    resetIceCache();
    const missing=await iceServers(async()=>new Response('',{status:503}),0);
    expect(missing.turn).toBe(false);expect(missing.message).toMatch(/not configured/);
    const offline=await iceServers(async()=>{throw new Error('offline');},0);
    expect(offline.turn).toBe(false);
  });
  it('validates server lists',()=>{
    expect(validIceServers([{urls:'javascript:alert(1)'}])).toBeNull();
    expect(validIceServers([{urls:['turn:x:3478'],username:'a',credential:'b'}])).toEqual([{urls:['turn:x:3478'],username:'a',credential:'b'}]);
  });
});
