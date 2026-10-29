import {topicById} from './topics';
import {articleById,articleFor,articleStyles} from './articles';

export const STUDY_TOPIC_KEY = 'pocket-arcade:study:v1:topic';
type SessionStore = Pick<Storage,'getItem'|'setItem'> & Partial<Pick<Storage,'removeItem'>>;
export type TopicStorageFailure='read'|'write'|'remove';

// One consent-gated session value holds the current article, not a reading history.
// Legacy topic IDs are the IDs of the original QCC articles.
export function createTopicSession(getStorage:()=>SessionStore = ()=>sessionStorage,canRemember:()=>boolean = ()=>true){
  let selected:string|undefined;
  let loaded=false;
  let retained=true;
  let failure:TopicStorageFailure|undefined;
  const load=()=>{
    if(!canRemember()||loaded)return;
    loaded=true;
    try {const value=getStorage().getItem(STUDY_TOPIC_KEY);if(!selected&&value&&articleById(value))selected=value;}catch{retained=false;failure='read';}
  };
  const remember=()=>{
    if(selected&&canRemember())try{getStorage().setItem(STUDY_TOPIC_KEY,selected);retained=true;failure=undefined;}catch{retained=false;failure='write';}
  };
  load();
  return {
    topic(){load();const article=selected?articleById(selected):undefined;return article?topicById(article.topicId):undefined;},
    article(){load();return selected?articleById(selected):undefined;},
    retained:()=>retained,
    failure:()=>failure,
    remember,
    forget(){try{getStorage().removeItem?.(STUDY_TOPIC_KEY);retained=true;failure=undefined;}catch{retained=false;failure='remove';}},
    choose(id:string):boolean {
      if(!topicById(id))return false;
      const style=selected?articleById(selected)?.style:'qcc';
      const article=articleFor(id,style??'qcc');if(!article)return false;
      selected=article.id;loaded=true;remember();return true;
    },
    nextArticle(random:()=>number=Math.random){
      load();const current=selected?articleById(selected):undefined;if(!current)return undefined;
      const choices=articleStyles.filter(style=>style!==current.style&&articleFor(current.topicId,style));
      if(!choices.length)return undefined;
      const value=random();const i=Math.max(0,Math.min(choices.length-1,Math.floor((Number.isFinite(value)?value:0)*choices.length)));
      const next=articleFor(current.topicId,choices[i])!;selected=next.id;loaded=true;remember();return next;
    }
  };
}
