import {ANSWERS, GUESSES} from './words';
export type Mark = 'correct'|'present'|'absent';
export type Mode = 'daily'|'practice';
export interface Round {answer:string; guesses:string[]; input:string; puzzle?:number; date?:string; seed?:number}
export interface Stats {played:number; wins:number; streak:number; maxStreak:number; distribution:number[]; last:number|null}
export interface State {mode:Mode; daily:Round; practice:Round; stats:Record<Mode,Stats>}
const allowed = new Set(GUESSES);
export const validGuess = (s:string) => allowed.has(s.toLowerCase());
export function score(guess:string, answer:string):Mark[] {
  guess=guess.toLowerCase(); answer=answer.toLowerCase(); const marks:Mark[]=Array(5).fill('absent'), counts:Record<string,number>={};
  for(let i=0;i<5;i++) if(guess[i]===answer[i]) marks[i]='correct'; else counts[answer[i]]=(counts[answer[i]]||0)+1;
  for(let i=0;i<5;i++) if(marks[i]!=='correct' && counts[guess[i]]>0) {marks[i]='present'; counts[guess[i]]--;}
  return marks;
}
export function aucklandDate(now:()=>Date=()=>new Date()):string {const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now()); const get=(t:string)=>p.find(x=>x.type===t)!.value; return `${get('year')}-${get('month')}-${get('day')}`;}
const day=(date:string)=>{const [y,m,d]=date.split('-').map(Number); return Date.UTC(y,m-1,d)/86400000;};
export function dailyAnswer(date:string) {const puzzle=day(date)-day('2026-10-27')+1; return {puzzle,answer:ANSWERS[((puzzle-1)%ANSWERS.length+ANSWERS.length)%ANSWERS.length]};}
export function newDaily(date:string):Round {return {...dailyAnswer(date),date,guesses:[],input:''};}
export function newPractice(seed:number):Round {seed=seed>>>0; let x=seed+0x6d2b79f5; x=Math.imul(x^(x>>>15),x|1); x^=x+Math.imul(x^(x>>>7),x|61); return {seed,answer:ANSWERS[((x^(x>>>14))>>>0)%ANSWERS.length],guesses:[],input:''};}
export const nextSeed=(seed:number)=>(Math.imul(seed,1664525)+1013904223)>>>0;
const emptyStats=():Stats=>({played:0,wins:0,streak:0,maxStreak:0,distribution:[0,0,0,0,0,0],last:null});
export function createState(date:string,seed:number=(Math.random()*4294967296)>>>0):State {return {mode:'daily',daily:newDaily(date),practice:newPractice(seed),stats:{daily:emptyStats(),practice:emptyStats()}};}
export const finished=(r:Round)=>r.guesses.length>=6 || r.guesses.includes(r.answer);
export function refreshDaily(s:State,date:string):boolean {if(s.daily.date===date)return false; s.daily=newDaily(date); return true;}
export function applyGuess(s:State,guess:string):boolean {const r=s[s.mode]; guess=guess.toLowerCase(); if(finished(r)||!validGuess(guess))return false; r.guesses.push(guess); r.input=''; if(finished(r)){const st=s.stats[s.mode], won=guess===r.answer; st.played++; if(won){st.wins++; st.distribution[r.guesses.length-1]++; st.streak=s.mode==='daily'&&st.last!==r.puzzle!-1?1:st.streak+1; st.maxStreak=Math.max(st.maxStreak,st.streak);}else st.streak=0; if(s.mode==='daily')st.last=r.puzzle!;} return true;}
export function keyboardState(r:Round):Record<string,Mark> {const out:Record<string,Mark>={}, rank={absent:1,present:2,correct:3}; for(const g of r.guesses)score(g,r.answer).forEach((m,i)=>{if(!out[g[i]]||rank[m]>rank[out[g[i]]])out[g[i]]=m;}); return out;}
export function shareText(r:Round,blind:boolean):string {const result=r.guesses.includes(r.answer)?String(r.guesses.length):'X'; return `Fivefold ${r.puzzle===undefined?'Practice':`#${r.puzzle}`} ${result}/6\n\n${r.guesses.map(g=>score(g,r.answer).map(m=>m==='correct'?(blind?'🟧':'🟩'):m==='present'?(blind?'🟦':'🟨'):'⬛').join('')).join('\n')}\n\nnceastudy.netlify.app`;}
const rec=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const count=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<1e7;
function readStats(v:unknown):Stats|undefined {if(!rec(v)||![v.played,v.wins,v.streak,v.maxStreak].every(count)||!Array.isArray(v.distribution)||v.distribution.length!==6||!v.distribution.every(count)||!(v.last===null||Number.isSafeInteger(v.last)))return; const s=v as unknown as Stats; if(s.wins>s.played||s.streak>s.maxStreak||s.maxStreak>s.wins||s.distribution.reduce((a,b)=>a+b,0)!==s.wins)return; return {...s,distribution:[...s.distribution]};}
function readRound(v:unknown,mode:Mode):Round|undefined {if(!rec(v)||typeof v.answer!=='string'||!ANSWERS.includes(v.answer)||!Array.isArray(v.guesses)||v.guesses.length>6||!v.guesses.every(g=>typeof g==='string'&&/^[a-z]{5}$/.test(g)&&validGuess(g))||typeof v.input!=='string'||!/^[a-z]{0,5}$/.test(v.input))return; const guesses=v.guesses as string[]; if(guesses.slice(0,-1).includes(v.answer)||(finished({answer:v.answer,guesses,input:''})&&v.input))return; if(mode==='daily'){if(typeof v.date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v.date)||new Date(day(v.date)*86400000).toISOString().slice(0,10)!==v.date)return; const d=dailyAnswer(v.date); if(v.answer!==d.answer||v.puzzle!==d.puzzle)return; return {...d,date:v.date,guesses:[...guesses],input:v.input};} if(!Number.isInteger(v.seed)||Number(v.seed)<0||Number(v.seed)>4294967295)return; const r=newPractice(Number(v.seed)); if(r.answer!==v.answer)return; return {...r,guesses:[...guesses],input:v.input};}
export function restoreState(v:unknown,today:string):State|undefined {try {if(!rec(v)||v.version!==1||(v.mode!=='daily'&&v.mode!=='practice')||!rec(v.stats))return; const daily=readRound(v.daily,'daily'),practice=readRound(v.practice,'practice'),d=readStats(v.stats.daily),p=readStats(v.stats.practice); if(!daily||!practice||!d||!p||p.last!==null||(d.played===0)!==(d.last===null)||(d.last!==null&&d.last>daily.puzzle!)||(finished(daily)&&d.last!==daily.puzzle)||(!finished(daily)&&d.last===daily.puzzle))return; const s:State={mode:v.mode,daily,practice,stats:{daily:d,practice:p}}; refreshDaily(s,today); return s;}catch{return;}}
export const serializeState=(s:State)=>({version:1,...structuredClone(s)});
