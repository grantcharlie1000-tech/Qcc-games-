// Issues short-lived Cloudflare TURN credentials. The TURN key ID and API token stay in server environment variables; a
// browser only ever receives credentials that expire after `TTL_SECONDS`. Requests are rate-limited per client address
// here (per function instance) and by Netlify's rate-limit rule in netlify/functions/turn.mts.
export const TTL_SECONDS=3600;
export const LIMIT_PER_WINDOW=6,WINDOW_MS=60_000;
export interface TurnEnv{keyId?:string;apiToken?:string}
type Fetch=(input:string,init?:RequestInit)=>Promise<Response>;

export function createTurnHandler(env:TurnEnv,fetcher:Fetch=globalThis.fetch.bind(globalThis),now:()=>number=Date.now){
  const hits=new Map<string,number[]>();
  function limited(client:string):boolean{
    const t=now(),recent=(hits.get(client)??[]).filter(at=>t-at<WINDOW_MS);
    if(recent.length>=LIMIT_PER_WINDOW){hits.set(client,recent);return true;}
    recent.push(t);hits.set(client,recent);
    if(hits.size>5000)for(const [key,list] of hits)if(!list.some(at=>t-at<WINDOW_MS))hits.delete(key);
    return false;
  }
  return async function handle(request:Request,clientIp=''):Promise<Response>{
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    const respond=(body:unknown,status=200,extra:Record<string,string>={})=>Response.json(body,{status,headers:{...headers,...extra}});
    if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'POST'}});
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(request.url).origin)return respond({error:'This request is not allowed.'},403);
    const client=clientIp||request.headers.get('x-nf-client-connection-ip')||request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
    if(limited(client))return respond({error:'Too many relay requests. Try again in a minute.'},429,{'Retry-After':'60'});
    if(!env.keyId||!env.apiToken||!/^[A-Za-z0-9_-]{8,128}$/.test(env.keyId))return respond({error:'Relay fallback is not configured.'},503);
    try{
      const upstream=await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.keyId}/credentials/generate-ice-servers`,{
        method:'POST',headers:{Authorization:`Bearer ${env.apiToken}`,'Content-Type':'application/json'},body:JSON.stringify({ttl:TTL_SECONDS}),
        signal:AbortSignal.timeout(5000)
      });
      if(!upstream.ok)return respond({error:'Relay credentials are temporarily unavailable.'},502);
      const iceServers=publicIceServers(await upstream.json());
      if(!iceServers.length)return respond({error:'Relay credentials are temporarily unavailable.'},502);
      return respond({iceServers,ttl:TTL_SECONDS});
    }catch{return respond({error:'Relay credentials are temporarily unavailable.'},502);}
  };
}

/** Keeps TURN entries only (STUN is configured in the client) and drops port 53, which browsers block or time out on. */
export function publicIceServers(body:unknown):{urls:string[];username:string;credential:string}[]{
  const raw=(body as {iceServers?:unknown})?.iceServers;
  const list=Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[];
  const out:{urls:string[];username:string;credential:string}[]=[];
  for(const s of list){
    if(!s||typeof s!=='object')continue;
    const {urls,username,credential}=s as Record<string,unknown>;
    if(typeof username!=='string'||typeof credential!=='string')continue;
    const turn=(Array.isArray(urls)?urls:[urls]).filter((u):u is string=>typeof u==='string'&&/^turns?:/.test(u)&&!/:53(\?|$)/.test(u));
    if(turn.length)out.push({urls:turn,username,credential});
  }
  return out;
}
