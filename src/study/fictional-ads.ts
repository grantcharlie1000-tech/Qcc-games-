import manifest from './fictional-ads-manifest.json';
import {studyAsset} from './media';
import './fictional-ads.css';

export type AdFormat='banner'|'square'|'portrait'|'tall'|'landscape';
export const fictionalAds=manifest;
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Selection is article-local, deterministic and independent of cookies or user data.
export function selectFictionalAd(articleId:string,slot:number,format:AdFormat){
  let hash=0;for(const c of articleId)hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
  const pool=manifest.filter(ad=>ad.format===format);
  return pool[(hash+Math.max(0,Math.floor(slot)))%pool.length];
}
export function renderFictionalAd(articleId:string,slot:number,format:AdFormat='banner'){
  const ad=selectFictionalAd(articleId,slot,format);
  return `<aside class="fictional-ad fictional-ad-${format}" aria-label="Fictional advertisement: ${escape(ad.brand)}"><span class="fictional-ad-label">Fictional advertisement</span><img src="${studyAsset(`fictional-ads/${ad.file}`)}" alt="Fictional ${escape(ad.brand)} advertisement. Illustration only; no product is offered for sale." width="${ad.width}" height="${ad.height}" loading="lazy" decoding="async"></aside>`;
}
export function renderFictionalAdRail(articleId:string,start=0,count=3){
  const formats:AdFormat[]=['tall','portrait','square'];
  return Array.from({length:count},(_,i)=>renderFictionalAd(articleId,start+i,formats[(start+i)%formats.length])).join('');
}
