import mauriMark from '../assets/mauri-mark.svg?raw';
import './style.css';
import './variants.css';
import {studyTopics} from './topics';
import {createTopicSession} from './session';
import {contributors,readingNotes} from './editorial';
import {ReadingPrivacy} from './privacy';
import {studyAsset,studyImagesReady,topicImage} from './media';
import {renderVariant} from './variant-view';
import {renderFictionalAd,renderFictionalAdRail} from './fictional-ads';

const html=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const subjects=[...new Set(studyTopics.map(topic=>topic.subject))];
const sources:Record<string,[string,string][]>={
 'te-tiriti':[['Waitangi Tribunal: Māori and English versions','https://www.waitangitribunal.govt.nz/en/about/the-treaty/maori-and-english-versions'],['NZHistory: Differences between the texts','https://nzhistory.govt.nz/page/differences-between-texts']],
 'wwi-causes':[['NZHistory: Origins of the First World War','https://nzhistory.govt.nz/war/first-world-war-overview/origins']],
 hauora:[['Ministry of Health: Te Whare Tapa Whā','https://www.health.govt.nz/maori-health/maori-health-models/te-whare-tapa-wha']]
};

export class StudyView {
  readonly root=document.createElement('section');
  private privacy=new ReadingPrivacy(remember=>{if(remember)this.session.remember();else this.session.forget();this.privacy.setTopicFailure(this.session.failure());});
  readonly session=createTopicSession(()=>sessionStorage,()=>this.privacy.allowed());
  private mode:'closed'|'choose'|'article'='closed';
  private message='';
  private updateMessage='';
  private updateReady=false;
  private updateBusy=false;
  private pendingAdvanceNotice=false;
  constructor(onInitialChoice:()=>void,onReturn:()=>void,onUpdate:()=>void=()=>{}){
    this.root.id='study-view';this.root.hidden=true;this.root.setAttribute('aria-label','Study Mode');document.body.append(this.root);
    this.root.addEventListener('click',event=>{
      const target=(event.target as Element).closest<HTMLElement>('button, [data-study-return]');
      if(target?.hasAttribute('data-study-update-reload'))onUpdate();
      if(target?.hasAttribute('data-study-next'))this.advanceArticle();
      if(target?.dataset.studyTopic&&this.session.choose(target.dataset.studyTopic)){
        this.privacy.setTopicFailure(this.session.failure());
        if(this.privacy.allowed()&&this.session.failure())this.privacy.showTopicStorageNotice(target,onInitialChoice);else onInitialChoice();
      }
      if(target?.hasAttribute('data-reading-choices'))this.privacy.open(target);
      if(target?.hasAttribute('data-study-return')&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onReturn();}
    });
    this.root.addEventListener('change',event=>{
      if((event.target as Element).id!=='study-topic')return;
      if(this.session.choose((event.target as HTMLSelectElement).value)){this.privacy.setTopicFailure(this.session.failure());this.showArticle(this.message,false);const select=this.root.querySelector<HTMLSelectElement>('#study-topic')!;select.focus({preventScroll:true});if(this.privacy.allowed()&&this.session.failure())this.privacy.showTopicStorageNotice(select);}
    });
  }
  setUpdateStatus(message:string,ready:boolean,busy=false){
    this.updateMessage=message;this.updateReady=ready;this.updateBusy=busy;
    const region=this.root.querySelector<HTMLElement>('[data-study-update]');
    if(!region)return;
    region.hidden=!message;
    region.querySelector('p')!.textContent=message;
    region.querySelector<HTMLButtonElement>('button')!.hidden=!ready;region.querySelector<HTMLButtonElement>('button')!.disabled=busy;
  }
  private updateRegion(){return '<aside class="study-update" data-study-update hidden><p role="status" id="study-update-status"></p><button data-study-update-reload aria-describedby="study-update-status" hidden>Reload to update</button></aside>';}
  get isOpen(){return this.mode!=='closed';}
  dismissPrivacy(){return this.privacy.dismiss();}
  private privacyButton(){return '<button class="study-choices-button" data-reading-choices>Reading storage choices</button>';}
  private header(select='',includeGames=true){return `<header class="study-header"><div class="study-wordmark">${mauriMark}<span>Mauri Study Notes</span></div><nav aria-label="Site navigation">${select}${this.privacyButton()}${includeGames?`<a class="study-return" href="${html(window.location.hash||'#/')}" data-study-return>Games</a>`:''}</nav></header>`;}
  showPicker(){
    this.privacy.detach();this.mode='choose';this.root.hidden=false;delete this.root.dataset.style;
    this.privacy.setTopicFailure(this.session.failure());
    this.root.innerHTML=`${this.header('',false)}${this.updateRegion()}<main class="study-picker study-page"><div class="study-picker-intro"><p class="study-eyebrow">The reading collection</p><h1 id="study-title" tabindex="-1">Choose your study topic</h1><p>Twenty topics, eighty original articles, and eight subjects to explore.</p><p>During a game, press <kbd>Esc</kbd> to pause and open a reading. Press it again or use Next article for a different style, or change topics while reading.</p></div><div class="study-topic-groups">${subjects.map(subject=>`<section aria-label="${html(subject)}"><h2>${html(subject)}</h2><div class="study-topic-list">${studyTopics.filter(t=>t.subject===subject).map(topic=>`<button class="study-topic" data-study-topic="${topic.id}">${html(topic.title)}</button>`).join('')}</div></section>`).join('')}</div></main>`;
    this.setUpdateStatus(this.updateMessage,this.updateReady,this.updateBusy);
    this.privacy.mount(this.root);this.focusHeading();
  }
  showArticle(message:string,focus=true){
    const topic=this.session.topic();if(!topic){this.showPicker();return;}
    this.privacy.detach();this.mode='article';this.message=message;this.root.hidden=false;
    const selectedArticle=this.session.article();
    const chapter=studyTopics.indexOf(topic)+1,author=contributors[(chapter-1)%contributors.length],notes=readingNotes[topic.id],image=topicImage(topic.id);
    const words=[topic.title,topic.subtitle,topic.objective,...topic.sections.flatMap(s=>[s.heading,...s.paragraphs]),...notes,topic.example.title,topic.example.question,...topic.example.steps,topic.example.result,topic.check.question].join(' ').split(/\s+/).length;
    const select=`<div class="study-topic-control"><label for="study-topic">Study topic</label><select id="study-topic">${subjects.map(subject=>`<optgroup label="${html(subject)}">${studyTopics.filter(t=>t.subject===subject).map(t=>`<option value="${t.id}"${t.id===topic.id?' selected':''}>${html(t.subtitle)}</option>`).join('')}</optgroup>`).join('')}</select></div>`;
    if(selectedArticle&&selectedArticle.style!=='qcc'){
      this.root.dataset.style=selectedArticle.style;
      this.root.innerHTML=`${this.updateRegion()}${/failed|memory/i.test(message)?`<p class="study-save-error" role="alert">${html(message)}</p>`:''}${renderVariant(selectedArticle,topic,select)}`;
      this.setUpdateStatus(this.updateMessage,this.updateReady,this.updateBusy);
      this.privacy.mount(this.root);window.scrollTo(0,0);
      if(focus)this.root.querySelector<HTMLElement>('#study-title')?.focus({preventScroll:true});
      this.showAdvanceNotice();
      return;
    }
    delete this.root.dataset.style;
    const body=topic.sections.map((section,index)=>`<section class="study-text-section"><h2>${html(section.heading)}</h2>${section.paragraphs.map(p=>`<p>${html(p)}</p>`).join('')}${index===1||index===2?`<p>${html(notes[index-1])}</p>`:''}</section>${index%2===1?`<div class="study-inline-ad">${renderFictionalAd(topic.id,index,'banner')}</div>`:''}`).join('');
    this.root.innerHTML=`${this.updateRegion()}${/failed|memory/i.test(message)?`<p class="study-save-error" role="alert">${html(message)}</p>`:''}<div class="study-reader-layout"><aside class="study-ad-rail study-ad-rail-left" data-ad-rail="left" aria-label="Left fictional advertisements">${renderFictionalAdRail(topic.id,0,4)}</aside><main class="study-chapter" data-format="long-read"><article aria-labelledby="study-title"><header class="study-article-heading"><p class="study-eyebrow">${html(topic.subject)} · Chapter ${String(chapter).padStart(2,'0')} / 20</p><h1 id="study-title" tabindex="-1">${html(topic.title)}</h1><p class="study-subtitle">${html(topic.subtitle)}</p><div class="study-byline">${studyImagesReady?`<img src="${studyAsset(`contributors/${author.portrait}.webp`)}" alt="Generated portrait of fictional contributor ${html(author.name)}" width="64" height="64">`:''}<div><span class="study-author-name">${html(author.name)}</span></div><span class="study-reading-time">${Math.ceil(words/180)} min read</span><time class="study-revision-date" datetime="2026-10-20">Revised 20 October 2026</time></div></header>${studyImagesReady&&image?`<figure class="study-hero"><img src="${studyAsset(`photos/${image.file}.webp`)}" alt="${html(image.alt)}" width="1280" height="853"><figcaption>${html(image.caption)}</figcaption></figure>`:''}<div class="study-article-body"><p class="study-objective"><strong>Learning focus</strong> ${html(topic.objective)}</p>${body}<p class="study-games-sentence">Ideas can also be explored through <a href="${html(window.location.hash||'#/')}" data-study-return aria-label="Games">games</a> and practical exercises.</p><section class="study-example"><p class="study-eyebrow">Put it into practice</p><h2>${html(topic.example.title)}</h2><p>${html(topic.example.question)}</p><ol>${topic.example.steps.map(step=>`<li>${html(step)}</li>`).join('')}</ol><p class="study-result">${html(topic.example.result)}</p></section><section class="study-check"><h2>Check your understanding</h2><p>${html(topic.check.question)}</p><details><summary>Read the explanation</summary><p>${html(topic.check.answer)}</p></details></section>${sources[topic.id]?`<section class="study-sources"><h2>Further reading</h2><ul>${sources[topic.id].map(([label,url])=>`<li><a href="${html(url)}" target="_blank" rel="noopener">${html(label)}</a></li>`).join('')}</ul></section>`:''}</div><footer class="study-chapter-footer"><p>${html(author.note)} All contributor names and portraits are fictional. These original revision notes are not official assessment guidance.</p>${select}<button data-study-next>Next article</button>${this.privacyButton()}</footer></article></main><aside class="study-ad-rail study-ad-rail-right" data-ad-rail="right" aria-label="Right fictional advertisements">${renderFictionalAdRail(topic.id,4,4)}</aside></div>`;
    this.setUpdateStatus(this.updateMessage,this.updateReady,this.updateBusy);
    this.privacy.mount(this.root);
    if(focus)this.root.querySelector<HTMLElement>('#study-title')?.focus({preventScroll:true});
    const sections=this.root.querySelectorAll<HTMLElement>('.study-text-section');sections[Math.floor(sections.length/2)]?.scrollIntoView({block:'start'});
    this.showAdvanceNotice();
  }
  private showAdvanceNotice(){
    if(!this.pendingAdvanceNotice)return;
    this.pendingAdvanceNotice=false;
    const opener=this.root.querySelector<HTMLElement>('[data-reading-choices]')??this.root.querySelector<HTMLElement>('#study-title');
    if(opener)this.privacy.showTopicStorageNotice(opener);
  }
  advanceArticle(){
    const previousFailure=this.session.failure();
    const next=this.session.nextArticle();if(!next)return false;
    this.privacy.setTopicFailure(this.session.failure());
    this.pendingAdvanceNotice=this.privacy.allowed()&&this.session.failure()==='write'&&previousFailure!=='write';
    this.root.dispatchEvent(new Event('study-article-change'));
    if(this.mode==='article')this.showArticle(this.message);
    return true;
  }
  hide(){this.privacy.detach();this.mode='closed';this.root.hidden=true;this.root.replaceChildren();}
  private focusHeading(){window.scrollTo(0,0);this.root.querySelector<HTMLElement>('#study-title')?.focus({preventScroll:true});}
}
