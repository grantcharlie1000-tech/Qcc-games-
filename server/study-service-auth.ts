// Server-only, shared by ingress classification and the internal verify handler.
// Knowing an origin, proxy header, browser proof or QCC bearer is not service auth.
import {createHash,timingSafeEqual} from 'node:crypto';
const digest=(value:string)=>createHash('sha256').update(value).digest();
export function studyServiceAuthorized(request:Request,env:Record<string,string|undefined>):boolean {
 const expected=env.QCC_WHETU_SERVICE_SECRET,supplied=request.headers.get('x-qcc-whetu-service-secret')??'';
 return !!expected&&Buffer.byteLength(expected)>=32&&timingSafeEqual(digest(expected),digest(supplied));
}
export function studyBrowserProof(request:Request):string|null {
 const name='__Host-nceastudy_browser=';
 const matches=(request.headers.get('cookie')??'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(name));
 if(matches.length!==1)return null;
 const value=matches[0]!.slice(name.length);return /^[a-f0-9]{64}$/.test(value)?value:null;
}
