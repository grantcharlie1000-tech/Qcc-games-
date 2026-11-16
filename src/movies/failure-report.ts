// Only a consenting tester who knows the private code sends a playback diagnostic.
// Never send account data, title, provider URL, browsing history, or device identifiers.
export type MovieFailureReason='frame-load-timeout'|'frame-ready-timeout'|'frame-error'|'frame-csp-blocked'|'no-playback-after-ready';
export type MovieFailureStage='connecting'|'loaded'|'ready'|'playing';
export const REPORT_CODE_PATTERN=/^[A-Za-z0-9_-]{24,128}$/;

export async function sendMovieFailureReport(code:string,reason:MovieFailureReason,stage:MovieFailureStage,online:boolean):Promise<boolean>{
 if(!REPORT_CODE_PATTERN.test(code))return false;
 try{
  const response=await fetch('/api/movie-failure-report',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   credentials:'omit',
   cache:'no-store',
   referrerPolicy:'no-referrer',
   keepalive:true,
   body:JSON.stringify({code,reason,stage,online}),
  });
  return response.status===204;
 }catch{return false;}
}
