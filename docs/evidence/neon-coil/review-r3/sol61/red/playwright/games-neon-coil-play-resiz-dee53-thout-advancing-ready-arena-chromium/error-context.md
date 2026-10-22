# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: games/neon-coil/play.spec.ts >> resize synchronizes ranking without advancing ready arena
- Location: tests/games/neon-coil/play.spec.ts:241:3

# Error details

```
Error: ready 390x844

expect(received).toBe(expected) // Object.is equality

Expected: 5
Received: 10
```

```
Error: ready 844x390

expect(received).toBe(expected) // Object.is equality

Expected: 5
Received: 10
```

```
Error: Stopped simulation cannot leave stale ranking indefinitely

expect(received).toBe(expected) // Object.is equality

Expected: 5
Received: 10
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic:
    - main:
      - region "Neon Coil" [ref=e2]:
        - generic:
          - link "Back to game library" [ref=e3] [cursor=pointer]:
            - /url: "#/"
          - heading "Neon Coil" [level=1]
          - button "Favourite Neon Coil" [ref=e6] [cursor=pointer]
          - button "Pause game" [ref=e9] [cursor=pointer]
          - button "Restart game" [ref=e12] [cursor=pointer]
          - button "Game rules" [ref=e15] [cursor=pointer]
          - button "Open menu" [ref=e19] [cursor=pointer]
        - generic [ref=e24]:
          - img "Neon Coil arena. Move the pointer without clicking, drag on touch, or use arrows and WASD to steer. Hold Space to boost. P pauses." [ref=e25]
          - generic:
            - text: NEON COIL
            - strong: "30"
            - generic: MASS · CLASSIC
          - button "Hold to boost" [disabled] [ref=e27]:
            - text: BOOST
            - generic [ref=e28]: Hold SPACE · spends mass
          - region [ref=e30]:
            - heading "Neon Coil Find your flow." [level=2] [ref=e31]:
              - text: Neon Coil
              - generic [ref=e32]: Find your flow.
            - paragraph [ref=e33]: Follow your pointer. Gather the glow.Outmaneuver 18 local bots in a living arena.
            - generic [ref=e34]:
              - generic [ref=e35]: 01 Move pointer or drag to steer
              - generic [ref=e36]: 02 Eat pellets to grow
              - generic [ref=e37]: 03 Hold Space to boost · costs mass
            - button "Enter arena" [ref=e38] [cursor=pointer]
            - paragraph [ref=e39]: Arrows / WASD also steer · P pause · Esc studyHeads hit other bodies. Your own coils are safe.
        - status [ref=e40]: Local bots only. Move your pointer to steer, Space to boost.
```

# Test source

```ts
  172 |         steer.id = 3;
  173 |         await send('touchStart', [boost, steer]);
  174 |       }
  175 |       steer.y = 200; await send('touchMove', [boost, steer]); await page.clock.runFor(500);
  176 |       await page.screenshot({ path: `${evidence}/touch-${order}.png` });
  177 |       await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  178 |       expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
  179 |       expect(Number(await game(page).getAttribute('data-y'))).toBeLessThan(-40);
  180 |       // A further arena finger cannot steal the tracked steering pointer.
  181 |       await send('touchStart', [boost, steer, { x: 195, y: 600, id: 4 }]);
  182 |       await page.clock.runFor(150);
  183 |       expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
  184 |       await send('touchCancel', []); await page.clock.runFor(150);
  185 |       await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  186 |     } finally { await context.close(); }
  187 |   });
  188 | }
  189 | for (const size of [{ width: 844, height: 390 }, { width: 740, height: 360 }, { width: 568, height: 320 }, { width: 667, height: 375 }]) {
  190 |   test(`short landscape bounds and unobscured player ranking ${size.width}x${size.height}`, async ({ page }) => {
  191 |     // Reproduce rotating the supported small portrait phone while the intro is open.
  192 |     await page.setViewportSize(size.width === 568 ? { width: 320, height: 568 } : size); await open(page);
  193 |     if (size.width === 568) await page.setViewportSize(size);
  194 |     const bounds = async (selector: string) => (await page.locator(selector).boundingBox())!;
  195 |     const card = await bounds('.nc-card'), enter = await bounds('.nc-start');
  196 |     const footer = await bounds('#restart-game');
  197 |     await page.screenshot({ path: `${evidence}/intro-${size.width}.png` });
  198 |     expect.soft(card.x).toBeGreaterThanOrEqual(0);
  199 |     expect.soft(card.x + card.width).toBeLessThanOrEqual(size.width);
  200 |     expect.soft(card.y).toBeGreaterThanOrEqual(62);
  201 |     expect.soft(card.y + card.height).toBeLessThanOrEqual(footer.y - 8);
  202 |     expect.soft(enter.height).toBeGreaterThanOrEqual(44);
  203 |     expect.soft(enter.y + enter.height).toBeLessThanOrEqual(footer.y - 8);
  204 |     for (const selector of ['#restart-game', '#favourite-game', '#rules-game', '#game-menu']) {
  205 |       const control = await bounds(selector);
  206 |       const overlap = enter.x < control.x + control.width && enter.x + enter.width > control.x && enter.y < control.y + control.height && enter.y + enter.height > control.y;
  207 |       expect.soft(overlap, `Enter overlaps ${selector}`).toBe(false);
  208 |     }
  209 |     // Cover the whole actionable button, including its bottom-right area where Restart covered it.
  210 |     const hits = await page.locator('.nc-start').evaluate(button => {
  211 |       const b = button.getBoundingClientRect();
  212 |       return [.1, .5, .9].flatMap(x => [.1, .5, .9].map(y => button.contains(document.elementFromPoint(b.x + b.width * x, b.y + b.height * y))));
  213 |     });
  214 |     expect.soft(hits, 'Every sampled Enter point reaches Enter').toEqual(Array(9).fill(true));
  215 |     expect.soft(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([size.width, size.height]);
  216 |     await page.locator('.nc-start').click(); await page.clock.runFor(150);
  217 |     await expect(page.locator('.nc-you')).toBeVisible();
  218 |     const you = await bounds('.nc-you');
  219 |     await page.screenshot({ path: `${evidence}/running-${size.width}.png` });
  220 |     expect.soft(await page.locator('.nc-ranking li').count()).toBe(5);
  221 |     expect.soft(you.y + you.height).toBeLessThanOrEqual(footer.y - 8);
  222 |     for (const selector of ['#restart-game', '#favourite-game', '#rules-game', '#game-menu', '.nc-boost']) {
  223 |       const control = await bounds(selector);
  224 |       const overlap = you.x < control.x + control.width && you.x + you.width > control.x && you.y < control.y + control.height && you.y + you.height > control.y;
  225 |       expect.soft(overlap, `YOU overlaps ${selector}`).toBe(false);
  226 |     }
  227 |   });
  228 | }
  229 | test('short narrow viewport keeps intro and Boost within the supported 320px width', async ({ page }) => {
  230 |   await page.setViewportSize({ width: 320, height: 568 }); await open(page);
  231 |   for (const selector of ['.nc-card', '.nc-start', '.nc-boost']) {
  232 |     const box = (await page.locator(selector).boundingBox())!;
  233 |     expect.soft(box.x, selector).toBeGreaterThanOrEqual(0);
  234 |     expect.soft(box.x + box.width, selector).toBeLessThanOrEqual(320);
  235 |     expect.soft(box.y + box.height, selector).toBeLessThanOrEqual(498);
  236 |   }
  237 |   await page.screenshot({ path: `${evidence}/intro-320.png` });
  238 | });
  239 | 
  240 | for (const lifecycle of ['ready', 'paused', 'dead', 'running'] as const) {
  241 |   test(`resize synchronizes ranking without advancing ${lifecycle} arena`, async ({ page }) => {
  242 |     const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  243 |     await page.setViewportSize({ width: 1280, height: 720 }); await open(page);
  244 |     if (lifecycle !== 'ready') await page.locator('.nc-start').click();
  245 |     if (lifecycle === 'paused') {
  246 |       await page.clock.runFor(150); await page.locator('#pause-game').click();
  247 |     } else if (lifecycle === 'dead') {
  248 |       await page.keyboard.down('ArrowLeft');
  249 |       for (let n = 0; n < 44; n++) await page.clock.fastForward(250);
  250 |       await page.keyboard.up('ArrowLeft'); await expect(game(page)).toHaveAttribute('data-phase', 'dead');
  251 |     }
  252 |     await expect(page.locator('.nc-ranking li')).toHaveCount(10);
  253 |     await page.evaluate(() => {
  254 |       const announcer = document.querySelector<HTMLElement>('#announcer')!;
  255 |       announcer.dataset.resizeAnnouncements = '0';
  256 |       new MutationObserver(records => { announcer.dataset.resizeAnnouncements = String(Number(announcer.dataset.resizeAnnouncements) + records.length); }).observe(announcer, { childList: true, subtree: true });
  257 |       window.dispatchEvent(new Event('pagehide'));
  258 |     });
  259 |     const before = await saved(page);
  260 |     const bestBefore = await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:neon-coil'));
  261 |     // No fake-clock advancement: canvas and HUD must synchronize in the same native resize delivery.
  262 |     for (const size of [{ width: 390, height: 844, rows: 5 }, { width: 1280, height: 720, rows: 10 }, { width: 844, height: 390, rows: 5 }]) {
  263 |       await page.setViewportSize(size);
  264 |       await expect.poll(() => page.locator('.nc-canvas').evaluate(c => ({ w: (c as HTMLCanvasElement).width, h: (c as HTMLCanvasElement).height }))).toEqual({ w: size.width, h: size.height });
  265 |       expect.soft(await page.locator('.nc-ranking li').count(), `${lifecycle} ${size.width}x${size.height}`).toBe(size.rows);
  266 |       await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  267 |       expect(await saved(page)).toEqual(before);
  268 |     }
  269 |     if (lifecycle !== 'running') {
  270 |       await page.clock.runFor(300); await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  271 |       expect(await saved(page)).toEqual(before);
> 272 |       expect.soft(await page.locator('.nc-ranking li').count(), 'Stopped simulation cannot leave stale ranking indefinitely').toBe(5);
      |                                                                                                                               ^ Error: Stopped simulation cannot leave stale ranking indefinitely
  273 |     }
  274 |     expect(await page.locator('#announcer').getAttribute('data-resize-announcements')).toBe('0');
  275 |     expect(await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:neon-coil'))).toBe(bestBefore);
  276 |     expect(errors).toEqual([]);
  277 |     await page.screenshot({ path: `${evidence}/resize-${lifecycle}.png` });
  278 |     if (lifecycle === 'paused') await page.locator('#pause-game').click();
  279 |     if (lifecycle === 'running' || lifecycle === 'paused') {
  280 |       await page.clock.runFor(200);
  281 |       expect(Number(await game(page).getAttribute('data-tick'))).toBeGreaterThan(before.ticks);
  282 |     }
  283 |   });
  284 | }
  285 | 
```