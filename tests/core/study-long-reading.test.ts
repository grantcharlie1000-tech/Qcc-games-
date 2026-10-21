import {expect,test,vi} from 'vitest';
import {studyTopics} from '../../src/study/topics';
import {readingNotes} from '../../src/study/editorial';
import {createTopicSession} from '../../src/study/session';

test.each(studyTopics)('$id has a substantive long article, worked example and retrieval question',topic=>{
 const words=[topic.title,topic.subtitle,topic.objective,...topic.sections.flatMap(s=>[s.heading,...s.paragraphs]),...readingNotes[topic.id],topic.example.title,topic.example.question,...topic.example.steps,topic.example.result,topic.check.question].join(' ').trim().split(/\s+/).length;
 expect(words).toBeGreaterThanOrEqual(900);expect(words).toBeLessThanOrEqual(1300);expect(topic.sections.length).toBeGreaterThanOrEqual(6);
});

test('optional topic storage is not read or written before consent, while a topic still works in memory',()=>{
 const getItem=vi.fn(()=> 'quadratics'),setItem=vi.fn();let allowed=false;
 const session=createTopicSession(()=>({getItem,setItem}),()=>allowed);
 expect(session.topic()).toBeUndefined();expect(getItem).not.toHaveBeenCalled();
 expect(session.choose('forces')).toBe(true);expect(session.topic()?.id).toBe('forces');expect(setItem).not.toHaveBeenCalled();
 allowed=true;session.choose('forces');expect(setItem).toHaveBeenCalledWith('pocket-arcade:study:v1:topic','forces');
});

test('revoking consent prevents later optional reads and writes without losing the in-memory chapter',()=>{
 const data=new Map([['pocket-arcade:study:v1:topic','forces']]);let allowed=true;
 const getItem=vi.fn((key:string)=>data.get(key)??null),setItem=vi.fn((key:string,value:string)=>{data.set(key,value);});
 const removeItem=vi.fn((key:string)=>{data.delete(key);});
 const session=createTopicSession(()=>({getItem,setItem,removeItem}),()=>allowed);
 expect(session.topic()?.id).toBe('forces');allowed=false;session.forget();getItem.mockClear();setItem.mockClear();
 session.choose('hauora');expect(session.topic()?.id).toBe('hauora');expect(data.size).toBe(0);expect(getItem).not.toHaveBeenCalled();expect(setItem).not.toHaveBeenCalled();
});
