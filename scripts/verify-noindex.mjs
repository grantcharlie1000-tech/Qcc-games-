import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

test('published robots.txt allows crawlers to read noindex without a sitemap', async () => {
  assert.ok(existsSync('dist/robots.txt'), 'dist/robots.txt must be published');
  const robots = await readFile('dist/robots.txt', 'utf8');
  assert.equal(robots.replace(/\r\n/g, '\n').trim(), 'User-agent: *\nAllow: /');
});

test('every published HTML page has one noindex, nofollow meta in its head', async () => {
  const pages = (await readdir('dist', { recursive: true })).filter(file => /\.html$/i.test(file));
  assert.ok(pages.includes('index.html'), 'dist/index.html must be published');
  for (const page of pages) {
    const html = await readFile(join('dist', page), 'utf8');
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
    assert.ok(head, `${page}: missing head`);
    const robots = [...head.matchAll(/<meta\b[^>]*\sname\s*=\s*(['"])robots\1[^>]*>/gi)];
    assert.equal(robots.length, 1, `${page}: expected exactly one robots meta`);
    assert.match(robots[0][0], /\scontent\s*=\s*(['"])noindex,\s*nofollow\1/i, `${page}: robots directives`);
  }
});

test('Cloudflare Pages applies X-Robots-Tag to every route', async () => {
  const headers = await readFile('dist/_headers', 'utf8');
  const globalHeaders = headers.split(/\r?\n(?=\S)/).find(block => block.split(/\r?\n/, 1)[0] === '/*');
  assert.ok(globalHeaders, 'dist/_headers must have a /* rule');
  assert.match(globalHeaders, /^[ \t]+X-Robots-Tag:[ \t]*noindex,[ \t]*nofollow[ \t]*\r?$/mi);
});
