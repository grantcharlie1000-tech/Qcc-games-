// Key and mouse bindings (Java Edition defaults). Escape is never bound: it belongs to the arcade shell
// (Study Mode) and to the browser (leaving pointer lock).
import type {InputAction,InputBinding} from '../engine/contracts';

/** KeyboardEvent.code → action. KeyQ is `drop`, or `dropStack` while Ctrl is held. */
export const KEY_ACTIONS:Readonly<Record<string,InputAction>>={
  KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',
  Space:'jump',ShiftLeft:'sneak',ShiftRight:'sneak',ControlLeft:'sprint',ControlRight:'sprint',KeyR:'sprint',
  KeyQ:'drop',KeyF:'swapHands',KeyE:'inventory',KeyL:'advancements'
};
/** Mouse button index (MouseEvent.button) → action: left attacks, middle picks, right uses. */
export const MOUSE_ACTIONS:readonly InputAction[]=['attack','pick','use'];
/** Actions that still reach their consumer (the ui) while an inventory-like screen is open. */
export const SCREEN_ACTIONS:readonly InputAction[]=['inventory','advancements'];

const LABELS:Record<InputAction,string>={
  forward:'Walk forward',back:'Walk backward',left:'Strafe left',right:'Strafe right',
  jump:'Jump, swim up, fly up (double-tap to fly in Creative)',sneak:'Sneak, fly down',sprint:'Sprint (or double-tap forward)',
  attack:'Attack or mine',use:'Use item or place block',pick:'Pick block',drop:'Drop item',dropStack:'Drop the whole stack',
  swapHands:'Swap item with offhand',inventory:'Open or close the inventory',advancements:'Advancements'
};
const ORDER:InputAction[]=['forward','back','left','right','jump','sneak','sprint','attack','use','pick','drop','dropStack','swapHands','inventory','advancements'];
const MOUSE_CODES:Partial<Record<InputAction,string>>={attack:'Mouse0',use:'Mouse2',pick:'Mouse1'};

/** Bindings for the controls help. A chord is written with '+' (dropStack: 'ControlLeft+KeyQ'). */
export const BINDINGS:readonly InputBinding[]=Object.freeze(ORDER.map(action=>{
  const keys=action==='dropStack'?['ControlLeft+KeyQ','ControlRight+KeyQ']
    :[...Object.entries(KEY_ACTIONS).filter(([,a])=>a===action).map(([code])=>code),...(MOUSE_CODES[action]?[MOUSE_CODES[action]!]:[])];
  return Object.freeze({action,label:LABELS[action],keys:Object.freeze(keys)});
}));
