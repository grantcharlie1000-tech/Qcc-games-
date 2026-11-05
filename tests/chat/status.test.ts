import {describe,expect,it} from 'vitest';
import {rowStatus} from '../../src/chat/components/status';
import type {ConversationRow} from '../../src/chat/shared';

const friend={username:'sam',displayName:'Sam',avatar:null};
const row=(kind:'text'|'snap',mine:boolean,viewed:boolean,unread=0):ConversationRow=>({friend,unread,last:{kind,mine,viewed,at:'2026-11-05T00:00:00Z'}});

describe('chat list status words',()=>{
 it('text rows say who has seen the message',()=>{
  expect(rowStatus(row('text',true,false)).words).toBe('Not seen yet');
  expect(rowStatus(row('text',true,true)).words).toBe("They've seen it");
  expect(rowStatus(row('text',false,true)).words).toBe("You've seen it");
  expect(rowStatus(row('text',false,false,1)).words).toBe('New message');
  expect(rowStatus(row('text',false,false,3)).words).toBe('3 new messages');
 });
 it('photo rows keep the word photo and say who has seen it',()=>{
  expect(rowStatus(row('snap',true,false)).words).toBe('Photo not seen yet');
  expect(rowStatus(row('snap',true,true)).words).toBe("They've seen your photo");
  expect(rowStatus(row('snap',false,true)).words).toBe("You've seen their photo");
  expect(rowStatus(row('snap',false,false)).words).toBe('New photo');
 });
 it('keeps the friends line for an empty chat',()=>{
  expect(rowStatus({friend,unread:0,last:null}).words).toBe("You're now friends");
 });
});
