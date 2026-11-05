import {describe,expect,it} from 'vitest';
import {appIcon} from '../../src/apps/icons';

describe('message action and receipt icons',()=>{
 it('draws a two-page copy control instead of a share action',()=>{
  const copy=appIcon('copy','Copy text');
  expect(copy).toContain('<rect');
  expect(copy).toContain('<path');
  expect(copy).toContain('aria-label="Copy text"');
  expect(copy).not.toContain('undefined');
  expect(copy).not.toBe(appIcon('share','Copy text'));
 });
 for(const kind of ['text','snap'] as const)it(`marks a confirmed ${kind} send with a check, not a spinner-like outline`,()=>{
  const sent=appIcon(`status-${kind}-sent`);
  expect(sent).not.toContain('stroke-dasharray');
  expect(sent).toContain('<path');
  expect(sent).not.toBe(appIcon(`status-${kind}-opened`));
 });
});
