import type {GameId} from '../core/types';

/** A presentation value, never a source of game state. */
export interface DisplayStat {label:string;value:string|number}

/** Adapt the existing setLevel captions without changing their saved/model values. */
export function extraStats(id:GameId,text:string):DisplayStat[]{
  if(!text.trim())return [];
  const parts=text.split(' · ').map(value=>value.trim());
  return parts.map((value,index)=>{
    if(id==='neon-coil')return index===0?{label:'Mode',value}:index===1?{label:'Rank',value}:{label:'Local bots',value:value.replace(/ local bots$/,'')};
    if(id==='color-connect')return {label:index?'Grid':'Level',value};
    if(id==='water-sort'&&index)return {label:'Difficulty',value};
    if(id==='slipline'&&index)return {label:'Tier',value};
    const prefix=value.match(/^(Length|Level|Garden|Shot|Day|Daily)\s+(.+)$/);
    if(prefix)return {label:prefix[1],value:prefix[2]};
    const suffix=value.match(/^([\d/]+)\s+(floors|animals|home|lines)$/);
    if(suffix)return {label:({floors:'Floors',animals:'Animals',home:'Home',lines:'Lines'} as Record<string,string>)[suffix[2]],value:suffix[1]};
    const labels:Partial<Record<GameId,string>>={'fruit-merge':'Largest fruit',minesweeper:'Difficulty','ball-run':'Mode','flappy-bird':'Course',pool:'Rack',fivefold:'Mode'};
    return {label:labels[id]??'Level',value:id==='ball-run'?value.replace(/ mode$/,''):value};
  });
}

export function statElement(stat:DisplayStat,className:string,labelTag:'span'|'small'='span'):HTMLSpanElement{
  const item=document.createElement('span'),label=document.createElement(labelTag),value=document.createElement('strong');
  item.className=className;label.className='metric-label';label.textContent=stat.label;value.textContent=String(stat.value);item.append(label,value);return item;
}
