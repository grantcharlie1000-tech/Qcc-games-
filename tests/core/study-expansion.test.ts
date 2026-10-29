import {expect, test} from 'vitest';
import {studyTopics} from '../../src/study/topics';
import {articlesForTopic, studyArticles} from '../../src/study/articles';
import {createTopicSession, STUDY_TOPIC_KEY} from '../../src/study/session';

function memoryStorage(){const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}

test('the collection has one original article per topic in each of four styles',()=>{
  expect(studyArticles).toHaveLength(80);
  expect(new Set(studyArticles.map(article=>article.id)).size).toBe(80);
  for(const topic of studyTopics){
    const articles=articlesForTopic(topic.id);
    expect(articles.map(article=>article.style).sort()).toEqual(['aeon','essay','qcc','quanta']);
    expect(articles.every(article=>article.topicId===topic.id)).toBe(true);
    for(const article of articles.filter(article=>article.style!=='qcc')){
      expect(article.paragraphs.length).toBeGreaterThanOrEqual(6);
      expect(article.paragraphs.join(' ').split(/\s+/).length).toBeGreaterThanOrEqual(350);
      expect(article.sources.length).toBeGreaterThan(0);
    }
  }
});

test('advancing excludes the last style and retains the chosen topic, including after reload',()=>{
  const storage=memoryStorage();const session=createTopicSession(()=>storage);
  session.choose('forces');
  let previous=session.article()!.style;
  for(let i=0;i<30;i++){
    const article=session.nextArticle(()=>0)!;
    expect(article.style).not.toBe(previous);
    expect(article.topicId).toBe('forces');
    expect(createTopicSession(()=>storage).article()?.id).toBe(article.id);
    previous=article.style;
  }
});

test('article selections stay in memory when optional storage is refused',()=>{
  const storage=memoryStorage();let permitted=false;
  const session=createTopicSession(()=>storage,()=>permitted);
  session.choose('poetry');session.nextArticle(()=>0);
  expect(storage.getItem(STUDY_TOPIC_KEY)).toBeNull();
  expect(session.article()?.topicId).toBe('poetry');
  permitted=true;session.remember();
  expect(createTopicSession(()=>storage).article()?.id).toBe(session.article()?.id);
});
