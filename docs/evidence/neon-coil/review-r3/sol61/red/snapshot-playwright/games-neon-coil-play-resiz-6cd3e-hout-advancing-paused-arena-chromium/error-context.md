# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: games/neon-coil/play.spec.ts >> resize synchronizes ranking without advancing paused arena
- Location: tests/games/neon-coil/play.spec.ts:242:3

# Error details

```
Error: paused 390x844

expect(received).toBe(expected) // Object.is equality

Expected: 5
Received: 10
```

```
Error: paused 844x390

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
          - button "Pause game" [active] [ref=e9] [cursor=pointer]
          - button "Restart game" [ref=e12] [cursor=pointer]
          - button "Game rules" [ref=e15] [cursor=pointer]
          - button "Open menu" [ref=e19] [cursor=pointer]
        - generic [ref=e24]:
          - img "Neon Coil arena. Move the pointer without clicking, drag on touch, or use arrows and WASD to steer. Hold Space to boost. P pauses." [ref=e25]
          - generic:
            - text: NEON COIL
            - strong: "30"
            - generic: MASS · CLASSIC
          - complementary "Live arena ranking":
            - heading "LIVE RANKING LOCAL BOTS" [level=2]:
              - text: LIVE RANKING
              - generic: LOCAL BOTS
            - list:
              - listitem:
                - generic: "1"
                - generic: Pebble
                - strong: "98"
              - listitem:
                - generic: "2"
                - generic: Nimbus
                - strong: "85"
              - listitem:
                - generic: "3"
                - generic: Kelp
                - strong: "79"
              - listitem:
                - generic: "4"
                - generic: Mochi
                - strong: "76"
              - listitem:
                - generic: "5"
                - generic: Saffron
                - strong: "74"
            - generic:
              - generic: "19"
              - generic: YOU
              - strong: "30"
          - button "Hold to boost" [ref=e27] [cursor=pointer]:
            - text: BOOST
            - generic [ref=e28]: Hold SPACE · spends mass
        - status [ref=e29]: 30 mass. Rank 19. Local bots only. Avoid other bodies and the rim.
```

# Test source

```ts
  175 |       }
  176 |       steer.y = 200; await send('touchMove', [boost, steer]); await page.clock.runFor(500);
  177 |       await page.screenshot({ path: `${evidence}/touch-${order}.png` });
  178 |       await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  179 |       expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
  180 |       expect(Number(await game(page).getAttribute('data-y'))).toBeLessThan(-40);
  181 |       // A further arena finger cannot steal the tracked steering pointer.
  182 |       await send('touchStart', [boost, steer, { x: 195, y: 600, id: 4 }]);
  183 |       await page.clock.runFor(150);
  184 |       expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
  185 |       await send('touchCancel', []); await page.clock.runFor(150);
  186 |       await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  187 |     } finally { await context.close(); }
  188 |   });
  189 | }
  190 | for (const size of [{ width: 844, height: 390 }, { width: 740, height: 360 }, { width: 568, height: 320 }, { width: 667, height: 375 }]) {
  191 |   test(`short landscape bounds and unobscured player ranking ${size.width}x${size.height}`, async ({ page }) => {
  192 |     // Reproduce rotating the supported small portrait phone while the intro is open.
  193 |     await page.setViewportSize(size.width === 568 ? { width: 320, height: 568 } : size); await open(page);
  194 |     if (size.width === 568) await page.setViewportSize(size);
  195 |     const bounds = async (selector: string) => (await page.locator(selector).boundingBox())!;
  196 |     const card = await bounds('.nc-card'), enter = await bounds('.nc-start');
  197 |     const footer = await bounds('#restart-game');
  198 |     await page.screenshot({ path: `${evidence}/intro-${size.width}.png` });
  199 |     expect.soft(card.x).toBeGreaterThanOrEqual(0);
  200 |     expect.soft(card.x + card.width).toBeLessThanOrEqual(size.width);
  201 |     expect.soft(card.y).toBeGreaterThanOrEqual(62);
  202 |     expect.soft(card.y + card.height).toBeLessThanOrEqual(footer.y - 8);
  203 |     expect.soft(enter.height).toBeGreaterThanOrEqual(44);
  204 |     expect.soft(enter.y + enter.height).toBeLessThanOrEqual(footer.y - 8);
  205 |     for (const selector of ['#restart-game', '#favourite-game', '#rules-game', '#game-menu']) {
  206 |       const control = await bounds(selector);
  207 |       const overlap = enter.x < control.x + control.width && enter.x + enter.width > control.x && enter.y < control.y + control.height && enter.y + enter.height > control.y;
  208 |       expect.soft(overlap, `Enter overlaps ${selector}`).toBe(false);
  209 |     }
  210 |     // Cover the whole actionable button, including its bottom-right area where Restart covered it.
  211 |     const hits = await page.locator('.nc-start').evaluate(button => {
  212 |       const b = button.getBoundingClientRect();
  213 |       return [.1, .5, .9].flatMap(x => [.1, .5, .9].map(y => button.contains(document.elementFromPoint(b.x + b.width * x, b.y + b.height * y))));
  214 |     });
  215 |     expect.soft(hits, 'Every sampled Enter point reaches Enter').toEqual(Array(9).fill(true));
  216 |     expect.soft(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([size.width, size.height]);
  217 |     await page.locator('.nc-start').click(); await page.clock.runFor(150);
  218 |     await expect(page.locator('.nc-you')).toBeVisible();
  219 |     const you = await bounds('.nc-you');
  220 |     await page.screenshot({ path: `${evidence}/running-${size.width}.png` });
  221 |     expect.soft(await page.locator('.nc-ranking li').count()).toBe(5);
  222 |     expect.soft(you.y + you.height).toBeLessThanOrEqual(footer.y - 8);
  223 |     for (const selector of ['#restart-game', '#favourite-game', '#rules-game', '#game-menu', '.nc-boost']) {
  224 |       const control = await bounds(selector);
  225 |       const overlap = you.x < control.x + control.width && you.x + you.width > control.x && you.y < control.y + control.height && you.y + you.height > control.y;
  226 |       expect.soft(overlap, `YOU overlaps ${selector}`).toBe(false);
  227 |     }
  228 |   });
  229 | }
  230 | test('short narrow viewport keeps intro and Boost within the supported 320px width', async ({ page }) => {
  231 |   await page.setViewportSize({ width: 320, height: 568 }); await open(page);
  232 |   for (const selector of ['.nc-card', '.nc-start', '.nc-boost']) {
  233 |     const box = (await page.locator(selector).boundingBox())!;
  234 |     expect.soft(box.x, selector).toBeGreaterThanOrEqual(0);
  235 |     expect.soft(box.x + box.width, selector).toBeLessThanOrEqual(320);
  236 |     expect.soft(box.y + box.height, selector).toBeLessThanOrEqual(498);
  237 |   }
  238 |   await page.screenshot({ path: `${evidence}/intro-320.png` });
  239 | });
  240 | 
  241 | for (const lifecycle of ['ready', 'paused', 'dead', 'running'] as const) {
  242 |   test(`resize synchronizes ranking without advancing ${lifecycle} arena`, async ({ page }) => {
  243 |     const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  244 |     await page.setViewportSize({ width: 1280, height: 720 }); await open(page);
  245 |     if (lifecycle !== 'ready') await page.locator('.nc-start').click();
  246 |     if (lifecycle === 'paused') {
  247 |       await page.clock.runFor(150); await page.locator('#pause-game').click();
  248 |     } else if (lifecycle === 'dead') {
  249 |       await page.keyboard.down('ArrowLeft');
  250 |       for (let n = 0; n < 44; n++) await page.clock.fastForward(250);
  251 |       await page.keyboard.up('ArrowLeft'); await expect(game(page)).toHaveAttribute('data-phase', 'dead');
  252 |     }
  253 |     await expect(page.locator('.nc-ranking li')).toHaveCount(10);
  254 |     await page.evaluate(() => {
  255 |       const announcer = document.querySelector<HTMLElement>('#announcer')!;
  256 |       announcer.dataset.resizeAnnouncements = '0';
  257 |       new MutationObserver(records => { announcer.dataset.resizeAnnouncements = String(Number(announcer.dataset.resizeAnnouncements) + records.length); }).observe(announcer, { childList: true, subtree: true });
  258 |       window.dispatchEvent(new Event('pagehide'));
  259 |     });
  260 |     const before = await saved(page);
  261 |     const resizes: { width: number; height: number; rows: number; world: typeof before }[] = [];
  262 |     const bestBefore = await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:neon-coil'));
  263 |     // No fake-clock advancement: canvas and HUD must synchronize in the same native resize delivery.
  264 |     for (const size of [{ width: 390, height: 844, rows: 5 }, { width: 1280, height: 720, rows: 10 }, { width: 844, height: 390, rows: 5 }]) {
  265 |       await page.setViewportSize(size);
  266 |       await expect.poll(() => page.locator('.nc-canvas').evaluate(c => ({ w: (c as HTMLCanvasElement).width, h: (c as HTMLCanvasElement).height }))).toEqual({ w: size.width, h: size.height });
  267 |       expect.soft(await page.locator('.nc-ranking li').count(), `${lifecycle} ${size.width}x${size.height}`).toBe(size.rows);
  268 |       await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  269 |       const world = await saved(page); resizes.push({ ...size, world });
  270 |       expect(world).toEqual(before);
  271 |     }
  272 |     if (lifecycle !== 'running') {
  273 |       await page.clock.runFor(300); await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  274 |       expect(await saved(page)).toEqual(before);
> 275 |       expect.soft(await page.locator('.nc-ranking li').count(), 'Stopped simulation cannot leave stale ranking indefinitely').toBe(5);
      |                                                                                                                               ^ Error: Stopped simulation cannot leave stale ranking indefinitely
  276 |     }
  277 |     expect(await page.locator('#announcer').getAttribute('data-resize-announcements')).toBe('0');
  278 |     expect(await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:neon-coil'))).toBe(bestBefore);
  279 |     expect(errors).toEqual([]);
  280 |     await page.screenshot({ path: `${evidence}/resize-${lifecycle}.png` });
  281 |     await writeFile(`${evidence}/resize-${lifecycle}.json`, JSON.stringify({ lifecycle, before, resizes, after: await saved(page), errors, announcements: await page.locator('#announcer').getAttribute('data-resize-announcements'), bestBefore, bestAfter: await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:neon-coil')) }, null, 2));
  282 |     if (lifecycle === 'paused') await page.locator('#pause-game').click();
  283 |     if (lifecycle === 'running' || lifecycle === 'paused') {
  284 |       await page.clock.runFor(200);
  285 |       expect(Number(await game(page).getAttribute('data-tick'))).toBeGreaterThan(before.ticks);
  286 |     }
  287 |   });
  288 | }
  289 | 
```