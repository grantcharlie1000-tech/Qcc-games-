/** Splits a script on semicolons while keeping a trigger's BEGIN/END body together.
 * D1's exec treats each newline as its own statement, so callers run these one at a time. */
export function popularitySqlStatements(sql:string):string[]{
 const source=sql.replace(/--[^\n]*/g,'');
 const parts:string[]=[];
 let current='',depth=0;
 for(const word of source.match(/BEGIN|END|'[^']*'|[^;\s]+|\s+|;/gi)??[]){
  if(/^BEGIN$/i.test(word)){depth++;current+=word;continue;}
  if(/^END$/i.test(word)){current+=word;depth=Math.max(0,depth-1);continue;}
  if(word===';'&&depth===0){const statement=current.replace(/\s+/g,' ').trim();if(statement)parts.push(statement);current='';continue;}
  current+=word;
 }
 const tail=current.replace(/\s+/g,' ').trim();
 if(tail)parts.push(tail);
 return parts;
}
