import type {StudyArticle} from './articles';
import type {StudyTopic} from './topics';
import {studyAsset,topicImage} from './media';
import {renderFictionalAd,renderFictionalAdRail} from './fictional-ads';

const html=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const fallback={file:'reading-writing',alt:'An open notebook and reading materials on a desk',caption:'Generated illustration of a study workspace.'};
const photo=(topicId:string)=>topicImage(topicId)??fallback;
const games=()=>`<a href="${html(window.location.hash||'#/')}" data-study-return aria-label="Return to previous view">Return</a>`;
const choices=()=>'<button class="study-choices-button" data-reading-choices>Reading storage choices</button>';
const wordmark='<span class="variant-wordmark">Mauri Study Notes</span>';
const sourceList=(article:StudyArticle)=>`<section class="study-sources"><h2>Further reading</h2><ul>${article.sources.map(([label,url])=>`<li><a href="${html(url)}" target="_blank" rel="noopener">${html(label)}</a></li>`).join('')}</ul></section>`;
const practice=(topic:StudyTopic)=>`<section class="variant-practice"><h2>Try it yourself</h2><p>${html(topic.example.question)}</p><ol>${topic.example.steps.map(step=>`<li>${html(step)}</li>`).join('')}</ol><p>${html(topic.example.result)}</p><details><summary>Check your understanding</summary><p>${html(topic.check.question)}</p><p>${html(topic.check.answer)}</p></details></section>`;
const textBody=(article:StudyArticle,topic:StudyTopic)=>`<div class="study-article-body variant-prose">${article.paragraphs.map((paragraph,index)=>`<p${index===0?' class="variant-lede"':''}>${html(paragraph)}</p>${index===1?renderFictionalAd(article.id,1,'landscape'):index===3?renderFictionalAd(article.id,2,'banner'):''}`).join('')}${practice(topic)}${renderFictionalAd(article.id,3,'landscape')}${sourceList(article)}<p class="study-games-sentence">Continue exploring ideas through ${games()} and practical exercises.</p></div>`;
const essayTextBody=(article:StudyArticle,topic:StudyTopic)=>{
  const ad=(slot:number,format:'landscape'|'banner',layout:'compact'|'wide')=>`<div class="essay-ad-${layout}">${renderFictionalAd(article.id,slot,format)}</div>`;
  const paragraphs=article.paragraphs.map((paragraph,index)=>`<p${index===0?' class="variant-lede"':''}>${html(paragraph)}</p>${index===1?ad(1,'landscape','compact'):index===3?ad(2,'banner','compact'):''}`).join('');
  return `<div class="study-article-body variant-prose">${paragraphs}${ad(1,'landscape','wide')}${practice(topic)}${renderFictionalAd(article.id,3,'landscape')}${sourceList(article)}${ad(2,'banner','wide')}<p class="study-games-sentence">Continue exploring ideas through ${games()} and practical exercises.</p></div>`;
};
const imageMarkup=(topicId:string,classname:string)=>{const image=photo(topicId);return `<figure class="${classname}"><img src="${studyAsset(`photos/${image.file}.webp`)}" alt="${html(image.alt)}" width="1280" height="853"><figcaption>${html(image.caption)}</figcaption></figure>`;};
const footer=(select:string)=>`<footer class="variant-footer">${select}<button class="variant-next" data-study-next>Next article</button>${choices()}<p>Original learning notes from Mauri Study Notes.</p></footer>`;

export function renderVariant(article:StudyArticle,topic:StudyTopic,select:string){
  const image=photo(topic.id);
  const paragraphs=article.paragraphs.map((paragraph,index)=>`<p>${html(paragraph)}</p>${index===Math.floor(article.paragraphs.length/2)?`<div class="study-inline-ad">${renderFictionalAd(article.id,1,'banner')}</div>`:''}`).join('');
  return `<div class="study-reader-layout"><aside class="study-ad-rail study-ad-rail-left" aria-label="Left advertisements">${renderFictionalAdRail(article.id,0,2)}</aside><main class="study-chapter" data-format="long-read" data-article-id="${html(article.id)}"><article aria-labelledby="study-title"><header class="study-article-heading"><p class="study-eyebrow">${html(topic.subject)} · Study notes</p><h1 id="study-title" tabindex="-1">${html(article.title)}</h1><p class="study-subtitle">${html(article.deck)}</p></header><figure class="study-hero"><img src="${studyAsset(`photos/${image.file}.webp`)}" alt="${html(image.alt)}" width="1280" height="853"><figcaption>${html(image.caption)}</figcaption></figure><div class="study-article-body"><section class="study-text-section">${paragraphs}</section><p class="study-games-sentence">Continue exploring ideas through ${games()} and practical exercises.</p><section class="study-example"><h2>${html(topic.example.title)}</h2><p>${html(topic.example.question)}</p><ol>${topic.example.steps.map(step=>`<li>${html(step)}</li>`).join('')}</ol><p class="study-result">${html(topic.example.result)}</p></section><section class="study-check"><h2>Check your understanding</h2><p>${html(topic.check.question)}</p><details><summary>Read the explanation</summary><p>${html(topic.check.answer)}</p></details></section>${sourceList(article)}</div><footer class="study-chapter-footer"><p>These original revision notes are not official assessment guidance.</p>${select}<button data-study-next>Next article</button>${choices()}</footer></article></main><aside class="study-ad-rail study-ad-rail-right" aria-label="Right advertisements">${renderFictionalAdRail(article.id,4,2)}</aside></div>`;
}
