import {describe,expect,it} from 'vitest';
import {formatClock,formatRuntime,initials} from '../../src/movies/format';

describe('formatRuntime',()=>{
 it('writes hours and minutes, and drops whichever is zero',()=>{
  expect(formatRuntime(169)).toBe('2h 49m');
  expect(formatRuntime(120)).toBe('2h');
  expect(formatRuntime(49)).toBe('49m');
 });
 it('rounds to whole minutes first',()=>{
  expect(formatRuntime(60.4)).toBe('1h');
  expect(formatRuntime(45.6)).toBe('46m');
 });
 it('gives no text for a runtime that is not a positive number of minutes',()=>{
  expect(formatRuntime(0)).toBe('');
  expect(formatRuntime(-5)).toBe('');
  expect(formatRuntime(NaN)).toBe('');
 });
});

describe('formatClock',()=>{
 it('writes minutes and seconds under an hour',()=>{
  expect(formatClock(0)).toBe('0:00');
  expect(formatClock(5)).toBe('0:05');
  expect(formatClock(65)).toBe('1:05');
  expect(formatClock(754.9)).toBe('12:34');
  expect(formatClock(3599)).toBe('59:59');
 });
 it('adds hours from one hour on, with two-digit minutes and seconds',()=>{
  expect(formatClock(3600)).toBe('1:00:00');
  expect(formatClock(3725.2)).toBe('1:02:05');
 });
 it('reads a negative or missing position as the start',()=>{
  expect(formatClock(-3)).toBe('0:00');
  expect(formatClock(NaN)).toBe('0:00');
 });
});

describe('initials',()=>{
 it('takes the first letter of the first and the last name',()=>{
  expect(initials('Grace Hopper')).toBe('GH');
  expect(initials('ada lovelace')).toBe('AL');
  expect(initials('Mary Ann Jackson')).toBe('MJ');
 });
 it('counts letters only, so punctuation never shows',()=>{
  expect(initials('(Adam) West')).toBe('AW');
  expect(initials('"Sherlock" Holmes')).toBe('SH');
  expect(initials('Jean-Luc Picard')).toBe('JP');
 });
 it('gives one letter for a one-word name',()=>{
  expect(initials('Cher')).toBe('C');
 });
 it('gives a neutral placeholder when a name has no letters',()=>{
  for(const name of ['','   ','123','()','… ·'])expect(initials(name)).toBe('?');
 });
 it('keeps a letter outside Basic Latin whole, surrogate pairs included',()=>{
  expect(initials('𝒜dam 𝒲est')).toBe('𝒜𝒲');
  expect(Array.from(initials('𝒜dam 𝒲est'))).toHaveLength(2);
  expect(initials('Élodie Ñúñez')).toBe('ÉÑ');
 });
});
