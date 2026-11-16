// Automatic best-effort operational diagnostics. Never send titles, accounts,
// video URLs, referers, IP addresses, cookies or persistent device identifiers.
export type MovieFailureReason='frame-load-timeout'|'frame-ready-timeout'|'frame-error'|'frame-csp-blocked'|'no-playback-after-ready'|'local-media-error'|'archive-frame-error';
export type MovieFailureStage='connecting'|'loaded'|'ready'|'playing';

export async function sendMovieFailureReport(reason:MovieFailureReason,stage:MovieFailureStage,online:boolean):Promise<boolean>{
 try{
  const response=await fetch('/api/movie-failure-report',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   credentials:'omit',
   cache:'no-store',
   referrerPolicy:'no-referrer',
   keepalive:true,
   body:JSON.stringify({reason,stage,online}),
  });
  return response.status===204;
 }catch{return false;}
}
