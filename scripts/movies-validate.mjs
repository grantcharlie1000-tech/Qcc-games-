import {readFile,stat} from 'node:fs/promises';
// A build cannot publish a registry entry without its media and documented rights review.
const entries=JSON.parse(await readFile('public/movies/licenses.json','utf8'));
if(!Array.isArray(entries))throw new Error('Movie licenses must be an array');
const seen=new Set();
for(const entry of entries){
 if(!entry||typeof entry.key!=='string'||seen.has(entry.key)||!/^movies\/media\/[a-zA-Z0-9_-]+\.(mp4|webm)$/.test(entry.path)||!/^docs\/rights\/[a-z0-9-]+\.md$/.test(entry.evidence)||entry.reviewed!==true||entry.territory!=='Worldwide'||!['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','LicenseRef-QCC'].includes(entry.license)||typeof entry.credit!=='string'||!entry.credit.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires)||!(Date.parse(entry.expires+'T23:59:59Z')>=Date.now()))throw new Error('Unverified, expired or unsafe movie license entry');
 seen.add(entry.key);
 if(!(await stat('public/'+entry.path)).isFile())throw new Error('Licensed media file missing');
 const evidence=await readFile(entry.evidence,'utf8');
 if(evidence.trim().length<100)throw new Error('Rights review must document source, license, territory, dates and privacy review');
}
console.log(`Movie rights registry: ${entries.length} approved local files`);
