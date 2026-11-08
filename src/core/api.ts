// Where the browser finds the QCC backend. Set VITE_QCC_API_BASE at build time (for example
// https://qcc-backend.vercel.app) when the site and the backend live on different hosts. Left empty, the
// site keeps calling its own origin on the old Netlify paths.
export type ApiRoute='accounts'|'leaderboard'|'turn'|'movies';
export function apiBase(value:string|undefined=import.meta.env.VITE_QCC_API_BASE):string{
 const base=(value??'').trim().replace(/\/+$/,'');
 return /^https?:\/\/[^/?#]+$/.test(base)?base:'';
}
export function apiUrl(route:ApiRoute,base=apiBase()):string{
 if(base)return `${base}/api/${route}`;
 return route==='movies'?'/api/movies':`/.netlify/functions/${route}`;
}
