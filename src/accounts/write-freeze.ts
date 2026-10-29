/** Server-only maintenance switch. Read for every request so warm functions obey changes. */
export const writeFrozen=():boolean=>process.env.QCC_WRITE_FREEZE==='1';
export function readOnlyResponse():Response {
 return Response.json({error:'read_only',retryable:true},{status:503,headers:{'Retry-After':'120','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
