import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {studyImagesReady,topicImage} from '../../src/study/media';
import {studyTopics} from '../../src/study/topics';

test('retained topic illustrations are local, verified and have public provenance',()=>{
 const manifest=JSON.parse(readFileSync('public/study/image-provenance.json','utf8'));
 expect(Object.keys(manifest).sort()).toEqual(['assets','disclosure','generation','version']);expect(manifest.version).toBe(1);expect(manifest.generation).toContain('AI-generated');expect(manifest.disclosure).toContain('not documentary evidence');expect(studyImagesReady).toBe(true);expect(manifest.assets).toHaveLength(8);
 const paths=new Set<string>();
 for(const asset of manifest.assets){
  expect(Object.keys(asset).sort()).toEqual(['bytes','height','kind','path','sha256','width']);expect(asset.path).toMatch(/^photos\/[a-z-]+\.webp$/);expect(paths.has(asset.path)).toBe(false);paths.add(asset.path);
  const bytes=readFileSync(`public/study/${asset.path}`);expect(bytes.subarray(0,4).toString()).toBe('RIFF');expect(bytes.subarray(8,12).toString()).toBe('WEBP');expect(bytes.length).toBe(asset.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
  expect([asset.width,asset.height]).toEqual([1280,853]);expect(asset.kind).toBe('illustrative-photo');
 }
 for(const topic of studyTopics){const image=topicImage(topic.id);if(image){expect(paths.has(`photos/${image.file}.webp`)).toBe(true);expect(image.alt+' '+image.caption).not.toMatch(/fictional|generated|example|advertisement|demo\b/i);}}
 for(const topic of ['quadratics','historical-evidence','te-tiriti','wwi-causes'])expect(topicImage(topic)).toBeUndefined();
});
