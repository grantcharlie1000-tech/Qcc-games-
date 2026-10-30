import {expect,test} from 'vitest';
import {isKeyboardKey,type KeyTarget} from '../../src/ui/focus';

const button:KeyTarget={tag:'BUTTON',type:'',editable:false};
const body:KeyTarget={tag:'BODY',type:'',editable:false};
const search:KeyTarget={tag:'INPUT',type:'search',editable:false};
const checkbox:KeyTarget={tag:'INPUT',type:'checkbox',editable:false};
const select:KeyTarget={tag:'SELECT',type:'',editable:false};
const textarea:KeyTarget={tag:'TEXTAREA',type:'',editable:false};
const editable:KeyTarget={tag:'DIV',type:'',editable:true};

// A Tab always means keyboard use, even when it lands in a field, because focus is moving with the keyboard.
test('Tab shows keyboard use wherever it is pressed',()=>{
  for(const target of [button,body,search,select])expect(isKeyboardKey('Tab',target)).toBe(true);
});

// Keys that act on a control or move within the page count as keyboard use.
test('arrows, Enter, Space and Escape show keyboard use on a button or on the page',()=>{
  for(const key of ['ArrowDown','Enter',' ','Escape'])expect(isKeyboardKey(key,button)).toBe(true);
  expect(isKeyboardKey('ArrowRight',body)).toBe(true);
});

// A checkbox takes Space as a control, so toggling one from the keyboard still counts as keyboard use.
test('a checkbox takes its keys as a control, so Space and Enter show keyboard use',()=>{
  expect(isKeyboardKey(' ',checkbox)).toBe(true);
  expect(isKeyboardKey('Enter',checkbox)).toBe(true);
});

// Typing on a phone's on-screen keyboard arrives as keys aimed at the field, so none of these may switch the page to keyboard mode.
test('typing into a field, a select, a textarea or editable text does not show keyboard use',()=>{
  for(const key of ['a','Enter','Backspace',' ','Escape','ArrowLeft'])expect(isKeyboardKey(key,search)).toBe(false);
  expect(isKeyboardKey('ArrowDown',select)).toBe(false);
  expect(isKeyboardKey('a',textarea)).toBe(false);
  expect(isKeyboardKey('a',editable)).toBe(false);
});

// Pressing Shift or Control on its own is not an action, so it leaves the mode as it is.
test('a lone modifier never shows keyboard use',()=>{
  for(const key of ['Shift','Control','Alt','Meta'])expect(isKeyboardKey(key,button)).toBe(false);
});
