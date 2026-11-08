/** A dormant release gate, not an account-linking or authentication protocol. */
export const WHETU_INTEGRATION='nceastudy-whetu-v1';
export const WHETU_ENTRY='/nceastudy';
export const WHETU_READINESS='/api/integrations/nceastudy';
export const WHETU_UNAVAILABLE='Study is not available inside this site yet.';

export interface IntegrationReadiness {
 integration:typeof WHETU_INTEGRATION;
 ready:true;
 framePath:typeof WHETU_ENTRY;
 excludedSubjects:string[];
 authentication:{embeddedPassword:true;embeddedSignup:true;externalProviderHandoff:true};
 accountLink:'verified-explicit-v1';
 revision:string;
}

export const integrationEnabled=(value:unknown):boolean=>value==='on';

/** Never accept a configurable external URL, anonymous mode or email-only link. */
export function parseIntegrationReadiness(value:unknown):IntegrationReadiness|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const data=value as Partial<IntegrationReadiness>;
 if(data.integration!==WHETU_INTEGRATION||data.ready!==true||data.framePath!==WHETU_ENTRY
  ||data.accountLink!=='verified-explicit-v1'||typeof data.revision!=='string'||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(data.revision)
  ||!Array.isArray(data.excludedSubjects)||!data.excludedSubjects.includes('history')||!data.excludedSubjects.includes('l2-history')
  ||data.authentication?.embeddedPassword!==true||data.authentication?.embeddedSignup!==true||data.authentication?.externalProviderHandoff!==true)return null;
 return data as IntegrationReadiness;
}

/** Readiness is public configuration. Deliberately send no QCC or Whetū credentials. */
export async function probeIntegration(fetcher:typeof fetch=fetch,signal?:AbortSignal):Promise<IntegrationReadiness> {
 const response=await fetcher(WHETU_READINESS,{
  method:'GET',headers:{Accept:'application/json'},credentials:'omit',mode:'same-origin',redirect:'error',cache:'no-store',signal,
 });
 if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')??'')
  ||!/(?:^|[,\s])no-store(?:$|[,\s])/i.test(response.headers.get('Cache-Control')??''))throw new Error(WHETU_UNAVAILABLE);
 const text=await response.text();
 if(text.length>16_384)throw new Error(WHETU_UNAVAILABLE);
 let data:unknown;try{data=JSON.parse(text);}catch{throw new Error(WHETU_UNAVAILABLE);}
 const ready=parseIntegrationReadiness(data);
 if(!ready)throw new Error(WHETU_UNAVAILABLE);
 return ready;
}
