// Cloudflare Pages receives only an opt-in, narrowly scoped playback failure event.
// No visitor IP, account, title, URL, or identifier is included in the email.
export interface MovieFailureEnv {
 QCC_MOVIE_REPORT_CODE?:string;
 QCC_MOVIE_REPORT_TO?:string;
 QCC_MOVIE_REPORT_FROM?:string;
 RESEND_API_KEY?:string;
}

const MAX_BODY_BYTES=512;
const REASONS=new Set(['frame-load-timeout','frame-ready-timeout','frame-error','frame-csp-blocked','no-playback-after-ready']);
const STAGES=new Set(['connecting','loaded','ready','playing']);
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const response=(status:number,error?:string)=>error?Response.json({error},{status,headers}):new Response(null,{status,headers});

async function sameCode(provided:string,expected:string):Promise<boolean>{
 const encoder=new TextEncoder();
 const [a,b]=await Promise.all([provided,expected].map(value=>crypto.subtle.digest('SHA-256',encoder.encode(value))));
 const left=new Uint8Array(a),right=new Uint8Array(b);
 let different=0;for(let i=0;i<left.length;i++)different|=left[i]^right[i];
 return different===0;
}

async function readSmallJson(request:Request):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)throw new Error('invalid_body');
 const chunks:Uint8Array[]=[];let length=0;
 while(true){
  const {done,value}=await reader.read();if(done)break;
  length+=value.byteLength;
  if(length>MAX_BODY_BYTES){await reader.cancel();throw new Error('body_too_large');}
  chunks.push(value);
 }
 const data=new Uint8Array(length);let offset=0;
 for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}

export async function handleMovieFailureReport(request:Request,env:MovieFailureEnv,now=Date.now()):Promise<Response>{
 if(request.method!=='POST')return response(405,'method_not_allowed');
 const origin=new URL(request.url).origin;
 if(request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return response(403,'origin_required');
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))return response(415,'json_required');
 if(!env.QCC_MOVIE_REPORT_CODE||env.QCC_MOVIE_REPORT_CODE.length<24
  ||!env.RESEND_API_KEY||!env.QCC_MOVIE_REPORT_TO||!env.QCC_MOVIE_REPORT_FROM)return response(503,'reports_unavailable');
 if(Number(request.headers.get('Content-Length'))>MAX_BODY_BYTES)return response(413,'body_too_large');

 let data:unknown;
 try{data=await readSmallJson(request);}
 catch(error){return response(error instanceof Error&&error.message==='body_too_large'?413:400,'invalid_report');}
 if(!data||typeof data!=='object'||Array.isArray(data))return response(400,'invalid_report');
 const value=data as Record<string,unknown>;
 if(Object.keys(value).length!==4||typeof value.code!=='string'||!/^[A-Za-z0-9_-]{24,128}$/.test(value.code)
  ||typeof value.reason!=='string'||!REASONS.has(value.reason)
  ||typeof value.stage!=='string'||!STAGES.has(value.stage)
  ||typeof value.online!=='boolean')return response(400,'invalid_report');
 if(!(await sameCode(value.code,env.QCC_MOVIE_REPORT_CODE)))return response(403,'invalid_report_code');

 const message=[
  'NCEAstudy movie playback diagnostic',
  'Time: '+new Date(now).toISOString(),
  'Reason: '+value.reason,
  'Stage: '+value.stage,
  'Browser online flag: '+(value.online?'online':'offline'),
  'A cross-origin iframe cannot expose DNS errors or failed requests within the video provider.',
  'No IP address, account, film title, URL or watch history is included in this message.',
 ].join('\n');
 try{
  const sent=await fetch('https://api.resend.com/emails',{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(6000),
   headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({from:env.QCC_MOVIE_REPORT_FROM,to:[env.QCC_MOVIE_REPORT_TO],subject:'NCEAstudy playback diagnostic',text:message}),
  });
  return sent.ok?response(204):response(502,'delivery_unavailable');
 }catch{return response(502,'delivery_unavailable');}
}
