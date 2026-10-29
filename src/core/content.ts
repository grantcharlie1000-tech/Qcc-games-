/** Canonical object order makes JSONB round trips and serializer property order harmless. */
export function stableText(value:unknown):string {
 return JSON.stringify(value,(_key,next)=>next&&typeof next==='object'&&!Array.isArray(next)
  ?Object.fromEntries(Object.keys(next).sort().map(key=>[key,next[key]])):next);
}

/** Compact deterministic fingerprint; exact local comparisons still use stableText. */
export function contentHash(value:unknown):string {
 const text=stableText(value);let a=0x811c9dc5,b=0x9e3779b9;
 for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,0x01000193);b=Math.imul(b^c,0x85ebca6b);}
 return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0')+':'+text.length;
}
