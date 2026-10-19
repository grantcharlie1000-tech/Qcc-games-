import {afterEach, expect, test, vi} from 'vitest';
import {studyTopics, topicById} from '../../src/study/topics';
import {createTopicSession, STUDY_TOPIC_KEY} from '../../src/study/session';

afterEach(()=>vi.unstubAllGlobals());

test('twenty original chapters cover the requested subjects with real local diagrams and revision content',()=>{
  expect(studyTopics).toHaveLength(20);
  expect(new Set(studyTopics.map(t=>t.id)).size).toBe(20);
  for(const subject of ['English','Maths','Science','History','Geography','Economics','Digital Technologies','Health'])
    expect(studyTopics.some(t=>t.subject===subject)).toBe(true);
  for(const topic of studyTopics){
    expect(topic.sections.length).toBeGreaterThanOrEqual(3);
    expect(topic.sections.flatMap(s=>s.paragraphs).join(' ').length).toBeGreaterThan(1000);
    expect(topic.diagram.svg).toContain('viewBox=');
    expect(topic.diagram.svg).toContain('<title');
    expect(topic.diagram.svg).toContain('<desc');
    expect(topic.diagram.svg).not.toMatch(/<script|<image|https?:\/\/(?!www.w3.org\/2000\/svg)/);
    expect(topic.example.steps.length).toBeGreaterThanOrEqual(2);
    expect(topic.check.answer.length).toBeGreaterThan(30);
    expect(topicById(topic.id)).toBe(topic);
  }
  expect(topicById('not-a-topic')).toBeUndefined();
});

function memoryStorage(){const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};}

test('choice belongs to sessionStorage, survives a reload and starts empty in a fresh session',()=>{
  const storage=memoryStorage(),session=createTopicSession(()=>storage);
  expect(session.topic()).toBeUndefined();
  expect(session.choose('quadratics')).toBe(true);
  expect(storage.getItem(STUDY_TOPIC_KEY)).toBe('quadratics');
  expect(createTopicSession(()=>storage).topic()?.id).toBe('quadratics');
  expect(createTopicSession(()=>memoryStorage()).topic()).toBeUndefined();
});

test('invalid or outdated choices are rejected without losing the selected chapter',()=>{
  const storage=memoryStorage();storage.setItem(STUDY_TOPIC_KEY,'old-deleted-topic');
  const session=createTopicSession(()=>storage);
  expect(session.topic()).toBeUndefined();
  expect(session.choose('close-reading')).toBe(true);
  expect(session.choose('<img src=x>')).toBe(false);
  expect(session.topic()?.id).toBe('close-reading');
});

test('blocked session storage still supports study and reports that reload cannot retain the topic',()=>{
  const session=createTopicSession(()=>{throw new DOMException('Blocked','SecurityError');});
  expect(session.retained()).toBe(false);
  expect(session.choose('forces')).toBe(true);
  expect(session.topic()?.id).toBe('forces');
  expect(session.retained()).toBe(false);
});

test('a quota failure keeps the newest selection in memory instead of restoring the old one',()=>{
  const storage=memoryStorage();storage.setItem(STUDY_TOPIC_KEY,'forces');
  const session=createTopicSession(()=>({...storage,setItem(){throw new Error('quota');}}));
  session.choose('essay-writing');
  expect(session.topic()?.id).toBe('essay-writing');
  expect(session.retained()).toBe(false);
});
