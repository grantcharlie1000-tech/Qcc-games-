import {topicById} from './topics';

export const STUDY_TOPIC_KEY = 'pocket-arcade:study:v1:topic';
type SessionStore = Pick<Storage,'getItem'|'setItem'>;

export function createTopicSession(getStorage:()=>SessionStore = ()=>sessionStorage){
  let selected:string|undefined;
  let retained=true;
  try {
    const value=getStorage().getItem(STUDY_TOPIC_KEY);
    if(value&&topicById(value))selected=value;
  } catch {retained=false;}
  return {
    topic:()=>selected?topicById(selected):undefined,
    retained:()=>retained,
    choose(id:string):boolean {
      if(!topicById(id))return false;
      selected=id;
      try {getStorage().setItem(STUDY_TOPIC_KEY,id);retained=true;} catch {retained=false;}
      return true;
    }
  };
}
