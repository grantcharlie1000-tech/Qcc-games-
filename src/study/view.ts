import './style.css';
import {studyTopics} from './topics';
import {createTopicSession} from './session';

const html=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const subjects=[...new Set(studyTopics.map(topic=>topic.subject))];
const arrow='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';

export class StudyView {
  readonly session=createTopicSession();
  readonly root=document.createElement('section');
  private mode:'closed'|'choose'|'article'='closed';
  private message='';

  constructor(onInitialChoice:()=>void,onReturn:()=>void){
    this.root.id='study-view';this.root.hidden=true;
    this.root.setAttribute('aria-label','Study Mode');
    document.body.append(this.root);
    this.root.addEventListener('click',event=>{
      const target=(event.target as Element).closest<HTMLElement>('button');
      if(target?.dataset.studyTopic){
        if(this.session.choose(target.dataset.studyTopic))onInitialChoice();
      }
      if(target?.hasAttribute('data-study-return'))onReturn();
    });
    this.root.addEventListener('change',event=>{
      if((event.target as Element).id!=='study-topic')return;
      if(this.session.choose((event.target as HTMLSelectElement).value)){
        this.showArticle(this.message,false);
        this.root.querySelector<HTMLSelectElement>('#study-topic')?.focus({preventScroll:true});
      }
    });
  }

  get isOpen(){return this.mode!=='closed';}

  private retention(){return this.session.retained()
    ?'Your topic is remembered for this browser session.'
    :'Session storage is unavailable. Your topic lasts until this page is reloaded.';}

  showPicker(){
    this.mode='choose';this.root.hidden=false;
    this.root.innerHTML=`<main class="study-picker study-page"><div class="study-wordmark">MAURI <span>/</span> STUDY NOTES</div>
      <div class="study-picker-intro"><p class="study-eyebrow">A little space to learn</p><h1 id="study-title" tabindex="-1">Choose your study topic</h1>
      <p>20 chapters for NCEA revision. Pick one for this session.</p><p class="study-picker-hint">During a game, press <kbd>Esc</kbd> to pause, save and open your chapter. You can change topics while reading.</p></div>
      <div class="study-topic-groups">${subjects.map(subject=>`<section aria-label="${html(subject)}"><h2>${html(subject)}</h2><div class="study-topic-list">${studyTopics.filter(t=>t.subject===subject).map((topic,i)=>`<button class="study-topic" data-study-topic="${topic.id}"><span>${String(i+1).padStart(2,'0')}</span><strong>${html(topic.subtitle)}</strong>${arrow}</button>`).join('')}</div></section>`).join('')}</div>
      <p class="study-session-note">${this.retention()}</p></main>`;
    this.focusHeading();
  }

  showArticle(message:string,focus=true){
    const topic=this.session.topic();if(!topic){this.showPicker();return;}
    this.mode='article';this.message=message;this.root.hidden=false;
    const chapter=studyTopics.indexOf(topic)+1;
    const svg=topic.diagram.svg.replace(/<\?xml[^>]*\?>\s*/,'')
      .replaceAll('id="arrow"',`id="${topic.id}-arrow"`).replaceAll('url(#arrow)',`url(#${topic.id}-arrow)`);
    this.root.innerHTML=`<div class="study-page">
      <header class="study-header"><div class="study-wordmark">MAURI <span>/</span> STUDY NOTES</div><button class="study-return" data-study-return>Return to Arcade ${arrow}</button></header>
      <div class="study-reader-layout"><aside class="study-sidebar"><p class="study-eyebrow">Your reading desk</p>
        <label for="study-topic">Study topic</label><select id="study-topic">${subjects.map(subject=>`<optgroup label="${html(subject)}">${studyTopics.filter(t=>t.subject===subject).map(t=>`<option value="${t.id}"${t.id===topic.id?' selected':''}>${html(t.subtitle)}</option>`).join('')}</optgroup>`).join('')}</select>
        <nav aria-label="Chapter contents"><p>In this chapter</p><ol>${topic.sections.map((s,i)=>`<li><a href="#study-section-${i}" data-study-anchor="study-section-${i}">${html(s.heading)}</a></li>`).join('')}<li><a href="#study-example" data-study-anchor="study-example">Worked example</a></li><li><a href="#study-check" data-study-anchor="study-check">Check your understanding</a></li></ol></nav>
        <p class="study-save-note" role="status">${html(message)}</p><p class="study-session-note">${this.retention()}</p>
      </aside>
      <main class="study-chapter"><div class="study-chapter-meta"><span>${html(topic.subject)} · NCEA revision</span><span>CHAPTER ${String(chapter).padStart(2,'0')} / 20</span></div>
        <h1 id="study-title" tabindex="-1">${html(topic.title)}</h1><p class="study-subtitle">${html(topic.subtitle)}</p>
        <p class="study-objective"><span>Learning focus</span>${html(topic.objective)}</p>
        <section id="study-section-0" tabindex="-1"><h2>${html(topic.sections[0].heading)}</h2>${topic.sections[0].paragraphs.map(p=>`<p>${html(p)}</p>`).join('')}</section>
        <figure class="study-figure"><div class="study-diagram">${svg}</div><figcaption><span>FIG. ${chapter}.1</span> ${html(topic.diagram.caption)}</figcaption></figure>
        ${topic.sections.slice(1).map((s,i)=>`<section id="study-section-${i+1}" tabindex="-1"><h2>${html(s.heading)}</h2>${s.paragraphs.map(p=>`<p>${html(p)}</p>`).join('')}</section>`).join('')}
        <section id="study-example" class="study-example" tabindex="-1"><p class="study-eyebrow">Put it into practice</p><h2>${html(topic.example.title)}</h2><p>${html(topic.example.question)}</p><ol>${topic.example.steps.map(step=>`<li>${html(step)}</li>`).join('')}</ol><p class="study-result">${html(topic.example.result)}</p></section>
        <section id="study-check" class="study-check" tabindex="-1"><h2>Check your understanding</h2><p>${html(topic.check.question)}</p><details><summary>Read the explanation</summary><p>${html(topic.check.answer)}</p></details></section>
        <footer class="study-chapter-footer"><span>Original revision notes · Use alongside your class materials.</span></footer>
      </main></div></div>`;
    // In-page contents must not change the arcade's hash route or unmount a game.
    this.root.querySelectorAll<HTMLAnchorElement>('[data-study-anchor]').forEach(link=>{
      link.addEventListener('click',event=>{
        event.preventDefault();const section=this.root.querySelector<HTMLElement>(`#${link.dataset.studyAnchor}`);
        section?.scrollIntoView({block:'start'});section?.focus({preventScroll:true});
      });
    });
    if(focus)this.focusHeading();else window.scrollTo(0,0);
  }

  hide(){this.mode='closed';this.root.hidden=true;this.root.replaceChildren();}
  private focusHeading(){window.scrollTo(0,0);this.root.querySelector<HTMLElement>('#study-title')?.focus({preventScroll:true});}
}
