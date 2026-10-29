import {studyTopics} from './topics';
import {quantaDrafts} from './articles-quanta';
import {aeonDrafts} from './articles-aeon';
import {essayDrafts} from './articles-essay';
import {quantaDepth} from './article-depth-quanta';
import {aeonDepth} from './article-depth-aeon';
import {essayDepth} from './article-depth-essay';

export type ArticleStyle = 'qcc'|'quanta'|'aeon'|'essay';
export type ArticleDraft = {topicId:string; title:string; deck:string; paragraphs:string[]};
export type StudyArticle = ArticleDraft & {id:string; style:ArticleStyle; sources:readonly (readonly [string,string])[]};
export const articleStyles:readonly ArticleStyle[]=['qcc','quanta','aeon','essay'];

// Sources are further reading for the topic; the articles and examples are original.
const sources:Record<string,readonly (readonly [string,string])[]>={
  'close-reading':[['OpenStax: thinking critically about text','https://openstax.org/books/writing-guide/pages/16-5-writing-process-thinking-critically-about-text']],
  'essay-writing':[['OpenStax: integrating sources and quotations','https://openstax.org/books/writing-guide/pages/12-6-editing-focus-integrating-sources-and-quotations']],
  poetry:[['Poetry Foundation: glossary of poetic terms','https://www.poetryfoundation.org/education/glossary']],
  'film-language':[['British Film Institute: framing and editing','https://replay.bfi.org.uk/video/5fc71f92-6c56-5c30-8527-83def3d42023']],
  'linear-relationships':[['OpenStax: linear functions','https://openstax.org/books/college-algebra-2e/pages/4-1-linear-functions']],
  quadratics:[['OpenStax: quadratic functions','https://openstax.org/books/college-algebra-2e/pages/5-1-quadratic-functions']],
  trigonometry:[['OpenStax: right triangle trigonometry','https://openstax.org/books/precalculus/pages/5-4-right-triangle-trigonometry']],
  probability:[['OpenStax: probability rules','https://openstax.org/books/introductory-statistics-2e/pages/3-3-two-basic-rules-of-probability']],
  forces:[['OpenStax: Newton’s laws','https://openstax.org/books/college-physics-2e/pages/4-introduction-to-dynamics-newtons-laws-of-motion']],
  energy:[['OpenStax: conservation of energy','https://openstax.org/books/college-physics-2e/pages/7-section-summary']],
  'acids-bases':[['OpenStax: pH and pOH','https://openstax.org/books/chemistry-2e/pages/14-2-ph-and-poh']],
  inheritance:[['OpenStax: laws of inheritance','https://openstax.org/books/biology-2e/pages/12-3-laws-of-inheritance']],
  ecosystems:[['National Geographic: food webs','https://education.nationalgeographic.org/resource/food-web/']],
  'historical-evidence':[['NZHistory: historical evidence','https://nzhistory.govt.nz/te-akomanga/historical-concepts/what-is-history']],
  'te-tiriti':[['NZHistory: differences between the texts','https://nzhistory.govt.nz/page/differences-between-texts'],['Waitangi Tribunal: Māori and English versions','https://www.waitangitribunal.govt.nz/en/about/the-treaty/maori-and-english-versions']],
  'wwi-causes':[['NZHistory: origins of the First World War','https://nzhistory.govt.nz/war/first-world-war-overview/origins']],
  'rivers-flooding':[['USGS: impervious surfaces and flooding','https://www.usgs.gov/water-science-school/science/impervious-surfaces-and-flooding']],
  'supply-demand':[['OpenStax: demand and supply','https://openstax.org/books/principles-economics-3e/pages/3-introduction-to-demand-and-supply']],
  algorithms:[['Khan Academy: algorithms','https://www.khanacademy.org/computing/computer-science/algorithms']],
  hauora:[['Ministry of Health: Te Whare Tapa Whā','https://www.health.govt.nz/maori-health/maori-health-models/te-whare-tapa-wha']]
};
const depths={quanta:quantaDepth,aeon:aeonDepth,essay:essayDepth};
const newArticles=(style:Exclude<ArticleStyle,'qcc'>,drafts:ArticleDraft[]):StudyArticle[]=>drafts.map(draft=>({...draft,paragraphs:[...draft.paragraphs.slice(0,-1),...(depths[style][draft.topicId]??[]),...draft.paragraphs.slice(-1)],id:`${style}:${draft.topicId}`,style,sources:sources[draft.topicId]??[]}));
export const studyArticles:readonly StudyArticle[]=[
  ...studyTopics.map(topic=>({id:topic.id,topicId:topic.id,style:'qcc' as const,title:topic.title,deck:topic.subtitle,paragraphs:topic.sections.flatMap(section=>section.paragraphs),sources:sources[topic.id]??[]})),
  ...newArticles('quanta',quantaDrafts),...newArticles('aeon',aeonDrafts),...newArticles('essay',essayDrafts)
];
const index=new Map(studyArticles.map(article=>[article.id,article]));
export const articleById=(id:string)=>index.get(id);
export const articlesForTopic=(topicId:string)=>studyArticles.filter(article=>article.topicId===topicId);
export const articleFor=(topicId:string,style:ArticleStyle)=>articleById(style==='qcc'?topicId:`${style}:${topicId}`);
