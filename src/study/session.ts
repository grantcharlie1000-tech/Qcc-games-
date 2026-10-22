import {topicById} from './topics';

export const STUDY_TOPIC_KEY = 'pocket-arcade:study:v1:topic';
type SessionStore = Pick<Storage,'getItem'|'setItem'> & Partial<Pick<Storage,'removeItem'>>;
export type TopicStorageFailure='read'|'write'|'remove';

// The permission function is consulted for every optional read/write, including
// changes made in another tab. A selected topic always remains usable in memory.
export function createTopicSession(getStorage:()=>SessionStore = ()=>sessionStorage,canRemember:()=>boolean = ()=>true){
  let selected:string|undefined;
  let loaded=false;
  let retained=true;
  let failure:TopicStorageFailure|undefined;
  const load=()=>{
    if(!canRemember()||loaded)return;
    loaded=true;
    try {const value=getStorage().getItem(STUDY_TOPIC_KEY);if(!selected&&value&&topicById(value))selected=value;}catch{retained=false;failure='read';}
  };
  load();
  return {
    topic(){load();return selected?topicById(selected):undefined;},
    retained:()=>retained,
    failure:()=>failure,
    forget(){try{getStorage().removeItem?.(STUDY_TOPIC_KEY);retained=true;failure=undefined;}catch{retained=false;failure='remove';}},
    choose(id:string):boolean {
      if(!topicById(id))return false;
      selected=id;loaded=true;
      if(canRemember())try{getStorage().setItem(STUDY_TOPIC_KEY,id);retained=true;failure=undefined;}catch{retained=false;failure='write';}
      return true;
    }
  };
}
