import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {studyImagesReady,topicImage} from '../../src/study/media';
import {studyTopics} from '../../src/study/topics';

test('public generated media is complete, verified and contains only public provenance',()=>{
 const manifest=JSON.parse(readFileSync('public/study/image-provenance.json','utf8'));
 expect(Object.keys(manifest).sort()).toEqual(['assets','disclosure','generation','version']);expect(manifest.version).toBe(1);expect(manifest.disclosure).toMatch(/fictional adults.*illustrative generated scenes/);expect(studyImagesReady).toBe(true);expect(manifest.assets).toHaveLength(12);
 const paths=new Set<string>();
 for(const asset of manifest.assets){
  expect(Object.keys(asset).sort()).toEqual(['bytes','height','kind','path','sha256','width']);expect(asset.path).toMatch(/^(contributors|photos)\/[a-z-]+\.webp$/);expect(paths.has(asset.path)).toBe(false);paths.add(asset.path);
  const bytes=readFileSync(`public/study/${asset.path}`);expect(bytes.subarray(0,4).toString()).toBe('RIFF');expect(bytes.subarray(8,12).toString()).toBe('WEBP');expect(bytes.length).toBe(asset.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
  const portrait=asset.path.startsWith('contributors/');expect([asset.width,asset.height]).toEqual(portrait?[512,512]:[1280,853]);expect(asset.kind).toBe(portrait?'fictional-contributor-portrait':'illustrative-photo');
 }
 for(const name of ['ari-rowan','mina-vale','leo-finch','nell-moss'])expect(paths.has(`contributors/${name}.webp`)).toBe(true);
 for(const topic of studyTopics){const image=topicImage(topic.id);if(image)expect(paths.has(`photos/${image.file}.webp`)).toBe(true);}
});
