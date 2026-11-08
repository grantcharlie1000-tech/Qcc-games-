export const POPULARITY_D1_COMPATIBILITY_DATE:string;
export function startLocalCleanup():Promise<{call(request:Request):Promise<Response>;dispose():Promise<void>}>;
export function runLocalCleanup(time?:number):Promise<{ok:boolean;status:number;counts?:{tokens:number;daily:number;rate:number}}>;
