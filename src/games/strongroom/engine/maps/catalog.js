export const DEFAULT_MAP_ID='customs-house';
export const MAP_CATALOG=Object.freeze([{id:'customs-house',name:'Customs House',location:'Coastal records and cash depot',description:'Two strongrooms joined by a narrow interior corridor.',tempo:'Tactical',colors:['#62a8b7','#34525a','#101b20']}]);
export const normalizeMapId=value=>value==='harbor'?'harbor':DEFAULT_MAP_ID;
export const mapById=value=>value==='harbor'?{id:'harbor',name:'Harbor',location:'Lighting diagnostic',description:'Original donor map for matched rendering comparisons.',tempo:'Tactical',colors:['#62a8b7','#34525a','#101b20']}:MAP_CATALOG[0];
