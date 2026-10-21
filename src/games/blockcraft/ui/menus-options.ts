// Menu option model (no DOM): vanilla-worded labels for the world options, value steps for the buttons and sliders,
// and the controls help rows built from the input service's bindings.
import {VIEW_DISTANCES,type Difficulty,type GameSettings,type InputBinding} from '../engine/contracts';

export type OptionKey=keyof GameSettings;
export const DIFFICULTIES:readonly Difficulty[]=['peaceful','easy','normal','hard'];
const cap=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
const onOff=(v:boolean)=>v?'ON':'OFF';

export function fovLabel(fov:number){
  const f=Math.round(fov);
  return`FOV: ${f===70?'Normal':f===110?'Quake Pro':f}`;
}
/** Button / slider caption for a setting, e.g. "Difficulty: Normal", "Render Distance: 5 chunks". */
export function optionLabel(key:OptionKey,s:Readonly<GameSettings>):string{
  switch(key){
    case 'mode':return`Game Mode: ${cap(s.mode)}`;
    case 'difficulty':return`Difficulty: ${cap(s.difficulty)}`;
    case 'view':return`Render Distance: ${VIEW_DISTANCES[s.view]??VIEW_DISTANCES[1]} chunks`;
    case 'fov':return fovLabel(s.fov);
    case 'sensitivity':return`Sensitivity: ${sensitivityToSlider(s.sensitivity)}%`;
    case 'volume':return`Master Volume: ${s.volume<=0?'OFF':`${Math.round(s.volume*100)}%`}`;
    case 'keepInventory':return`Keep Inventory: ${onOff(s.keepInventory)}`;
    case 'daylightCycle':return`Daylight Cycle: ${onOff(s.daylightCycle)}`;
    case 'weatherCycle':return`Weather Cycle: ${onOff(s.weatherCycle)}`;
    case 'mobSpawning':return`Mob Spawning: ${onOff(s.mobSpawning)}`;
  }
}
/** One-line explanations shown under the toggles (vanilla game rule descriptions, shortened). */
export const OPTION_HINTS:Partial<Record<OptionKey,string>>={
  mode:'Survival: gather, craft and stay alive. Creative: unlimited blocks and flight.',
  keepInventory:'Keep items and experience after death.',
  daylightCycle:'Advance the time of day.',
  weatherCycle:'Change the weather.',
  mobSpawning:'Let mobs spawn naturally.'
};
/** The difficulty button cycles like vanilla: peaceful → easy → normal → hard → peaceful. */
export function nextDifficulty(d:Difficulty):Difficulty{return DIFFICULTIES[(DIFFICULTIES.indexOf(d)+1)%DIFFICULTIES.length];}
/** Mouse sensitivity slider in percent (10..400) ⇄ the settings multiplier (0.1..4). */
export const sensitivityFromSlider=(percent:number)=>Math.max(.1,Math.min(4,Math.round(percent)/100));
export const sensitivityToSlider=(value:number)=>Math.round(value*100);

// ---- Controls help ------------------------------------------------------------------------------------
const NAMED:Record<string,string>={Space:'Space',Tab:'Tab',Enter:'Enter',Backspace:'Backspace',CapsLock:'Caps Lock',Backquote:'`',Minus:'-',Equal:'=',
  BracketLeft:'[',BracketRight:']',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backslash:'\\',
  Mouse0:'Left Click',Mouse1:'Middle Click',Mouse2:'Right Click',Mouse3:'Mouse Back',Mouse4:'Mouse Forward'};
/** Readable name of a KeyboardEvent.code (or 'Mouse0'..'Mouse4'); chords use '+'. */
export function keyLabel(code:string):string{
  if(code.includes('+'))return code.split('+').map(keyLabel).join(' + ');
  if(NAMED[code])return NAMED[code];
  let m=/^Key([A-Z])$/.exec(code);if(m)return m[1];
  m=/^(?:Digit|Numpad)(\d)$/.exec(code);if(m)return code.startsWith('Numpad')?`Keypad ${m[1]}`:m[1];
  m=/^Arrow(Up|Down|Left|Right)$/.exec(code);if(m)return`${m[1]} Arrow`;
  m=/^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code);if(m)return`${m[2]} ${m[1]==='Control'?'Ctrl':m[1]==='Meta'?'Meta':m[1]}`;
  return code;
}
export interface ControlRow{label:string;keys:string}
/** Rows for the controls panel: every binding, then the keys the input service handles itself. */
export function controlRows(bindings:readonly InputBinding[]):ControlRow[]{
  const rows=bindings.map(b=>({label:b.label,keys:b.keys.length?b.keys.map(keyLabel).join(' / '):'Not bound'}));
  rows.push({label:'Select hotbar slot',keys:'1-9 / Scroll Wheel'},{label:'Hide HUD',keys:'F1'},{label:'Debug screen',keys:'F3'},
    {label:'Pause (Study Mode)',keys:'Escape'});
  return rows;
}
/** Touch controls help (the touch layer of the player controls). */
export const TOUCH_ROWS:readonly ControlRow[]=[
  {label:'Move',keys:'Drag the stick (push to the edge to sprint)'},
  {label:'Look around',keys:'Drag anywhere on the world'},
  {label:'Mine or attack',keys:'Touch and hold'},
  {label:'Place or use',keys:'Tap'},
  {label:'Jump and sneak',keys:'Buttons on the right'},
  {label:'Inventory',keys:'Inventory button'},
  {label:'Select hotbar slot',keys:'Tap a slot'}
];
