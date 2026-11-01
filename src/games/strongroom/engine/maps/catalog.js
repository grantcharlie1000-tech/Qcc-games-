export const DEFAULT_MAP_ID='harbor';
export const MAP_CATALOG=Object.freeze([{id:'harbor',name:'Harbor',location:'Storm coast container port',description:'Covered lanes and container-yard flanks.',tempo:'Tactical',colors:['#62a8b7','#34525a','#101b20']}]);
export const normalizeMapId=()=>DEFAULT_MAP_ID;
export const mapById=()=>MAP_CATALOG[0];
