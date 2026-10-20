# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: games/neon-coil/play.spec.ts >> native touch ownership: reacquire
- Location: tests/games/neon-coil/play.spec.ts:156:3

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < -1
Received:   0
```

# Test source

```ts
  76  |   await page.getByRole('button', { name: 'Continue arena', exact: true }).click(); await page.clock.runFor(200);
  77  |   expect(Number(await game(page).getAttribute('data-tick'))).toBeGreaterThan(paused.ticks);
  78  | });
  79  | test('resize, high DPI, reduced motion and controls fit desktop, ultrawide and touch widths', async ({ browser }) => {
  80  |   const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  81  |   await seedStudyTopic(context); const page = await context.newPage(); await open(page); await page.locator('.nc-start').click();
  82  |   for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 2560, height: 1080 }, { width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  83  |     await page.setViewportSize(size); await page.clock.runFor(100);
  84  |     expect(await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }))).toEqual({ w: size.width, h: size.height });
  85  |     await expect.poll(async () => {
  86  |       // ResizeObserver is delivered on a native layout frame, outside the fake clock.
  87  |       await page.clock.runFor(34);
  88  |       return page.locator('.nc-canvas').evaluate(c => ({ w: (c as HTMLCanvasElement).width, h: (c as HTMLCanvasElement).height }));
  89  |     }).toEqual({ w: size.width * 2, h: size.height * 2 });
  90  |     for (const selector of ['#pause-game', '#restart-game', '.nc-boost']) {
  91  |       const box = (await page.locator(selector).boundingBox())!;
  92  |       expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(size.width); expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  93  |     }
  94  |   }
  95  |   await context.close();
  96  | });
  97  | test('touch drag and a second finger on the boost control steer without scrolling', async ({ browser, browserName }) => {
  98  |   test.skip(browserName !== 'chromium', 'Native multi-touch evidence uses Chromium CDP; WebKit tests mouse and keyboard.');
  99  |   const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  100 |   await seedStudyTopic(context); const page = await context.newPage(); await open(page); await page.locator('.nc-start').tap();
  101 |   const cdp = await context.newCDPSession(page);
  102 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 422, id: 1 }] });
  103 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y: 300, id: 1 }] });
  104 |   await page.clock.runFor(450); expect(Number(await game(page).getAttribute('data-y'))).toBeLessThan(-20);
  105 |   const b = (await page.locator('.nc-boost').boundingBox())!, x = b.x + b.width / 2, y = b.y + b.height / 2;
  106 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300, id: 1 }, { x, y, id: 2 }] });
  107 |   await page.clock.runFor(250); await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  108 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  109 |   await page.clock.runFor(200); await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  110 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 3 }] });
  111 |   await page.clock.runFor(150); await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  112 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  113 |   await page.clock.runFor(150); await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  114 |   expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  115 |   await page.screenshot({ path: `${evidence}/touch-390.png` }); await context.close();
  116 | });
  117 | test('focusable boost, lost focus, frame stalls, disposal and invalid saves recover safely', async ({ page }) => {
  118 |   const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await open(page);
  119 |   for (let run = 0; run < 3; run++) {
  120 |     await page.getByRole('button', { name: 'Enter arena', exact: true }).click(); await page.locator('.nc-boost').focus();
  121 |     await page.keyboard.down('Enter'); await page.clock.runFor(150); await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  122 |     await page.keyboard.up('Enter'); await page.clock.runFor(150); await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  123 |     if (run === 0) {
  124 |       await page.locator('.nc-canvas').focus(); await page.keyboard.down('Space'); await page.clock.runFor(150);
  125 |       await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  126 |       await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.clock.runFor(150);
  127 |       await expect(game(page)).toHaveAttribute('data-boosting', 'false'); await page.keyboard.up('Space');
  128 |     }
  129 |     await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); const before = (await saved(page)).ticks;
  130 |     await page.clock.fastForward(8000);
  131 |     await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); const after = (await saved(page)).ticks;
  132 |     expect(after - before).toBeLessThanOrEqual(15);
  133 |     await page.getByRole('link', { name: 'Back to game library', exact: true }).click(); await expect(game(page)).toHaveCount(0);
  134 |     await page.keyboard.press('p'); await page.clock.runFor(150);
  135 |     await page.evaluate(() => localStorage.setItem('pocket-arcade:v1:save:neon-coil', JSON.stringify({ version: 1, data: { version: 1, snakes: 'broken' } })));
  136 |     await page.getByRole('link', { name: 'Play Neon Coil', exact: true }).click(); await expect(game(page)).toHaveAttribute('data-tick', '0');
  137 |   }
  138 |   expect(errors).toEqual([]);
  139 | });
  140 | test('the library retains original grid Snake and opens Neon Coil separately', async ({ page }) => {
  141 |   await open(page); await page.getByRole('link', { name: 'Back to game library', exact: true }).click();
  142 |   await expect(page.locator('.game-card')).toHaveCount(14);
  143 |   await expect(page.getByRole('link', { name: 'Play Snake', exact: true })).toBeVisible();
  144 |   await page.getByRole('link', { name: 'Play Snake', exact: true }).click();
  145 |   await expect(page.getByRole('button', { name: 'Start slithering', exact: true })).toBeVisible();
  146 |   await page.keyboard.press('ArrowRight'); await page.clock.runFor(690);
  147 |   await expect(page.locator('#game-score strong')).toHaveText('10');
  148 |   await expect(page.locator('.snake-game')).toHaveCount(1); await expect(game(page)).toHaveCount(0);
  149 |   await page.getByRole('link', { name: 'Back to game library', exact: true }).click();
  150 |   await page.getByRole('link', { name: 'Play Neon Coil', exact: true }).click();
  151 |   await expect(page.getByRole('button', { name: 'Enter arena', exact: true })).toBeVisible();
  152 |   await expect(game(page)).toHaveAttribute('data-tick', '0'); await expect(page.locator('.snake-game')).toHaveCount(0);
  153 | });
  154 | 
  155 | for (const order of ['steering-first', 'boost-first', 'reacquire'] as const) {
  156 |   test(`native touch ownership: ${order}`, async ({ browser, browserName }) => {
  157 |     test.skip(browserName !== 'chromium', 'Native multi-touch requires Chromium CDP.');
  158 |     const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  159 |     await seedStudyTopic(context); const page = await context.newPage(); await open(page); await page.locator('.nc-start').tap();
  160 |     const cdp = await context.newCDPSession(page);
  161 |     const b = (await page.locator('.nc-boost').boundingBox())!;
  162 |     const boost = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 };
  163 |     const steer = { x: 195, y: 422, id: 2 };
  164 |     const send = (type: string, touchPoints: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  165 |     try {
  166 |       await send('touchStart', [order === 'boost-first' ? boost : steer]);
  167 |       await send('touchStart', [boost, steer]);
  168 |       if (order === 'reacquire') {
  169 |         await send('touchEnd', [boost]);
  170 |         steer.id = 3;
  171 |         await send('touchStart', [boost, steer]);
  172 |       }
  173 |       steer.y = 200; await send('touchMove', [boost, steer]); await page.clock.runFor(500);
  174 |       await page.screenshot({ path: `${evidence}/touch-${order}.png` });
  175 |       await expect(game(page)).toHaveAttribute('data-boosting', 'true');
> 176 |       expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
      |                                                                   ^ Error: expect(received).toBeLessThan(expected)
  177 |       expect(Number(await game(page).getAttribute('data-y'))).toBeLessThan(-40);
  178 |       // A further arena finger cannot steal the tracked steering pointer.
  179 |       await send('touchStart', [boost, steer, { x: 195, y: 600, id: 4 }]);
  180 |       await page.clock.runFor(150);
  181 |       expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
  182 |       await send('touchCancel', []); await page.clock.runFor(150);
  183 |       await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  184 |     } finally { await context.close(); }
  185 |   });
  186 | }
  187 | for (const size of [{ width: 844, height: 390 }, { width: 740, height: 360 }]) {
  188 |   test(`short landscape bounds and unobscured player ranking ${size.width}x${size.height}`, async ({ page }) => {
  189 |     await page.setViewportSize(size); await open(page);
  190 |     const bounds = async (selector: string) => (await page.locator(selector).boundingBox())!;
  191 |     const card = await bounds('.nc-card'), enter = await bounds('.nc-start');
  192 |     const footer = await bounds('#restart-game');
  193 |     await page.screenshot({ path: `${evidence}/intro-${size.width}.png` });
  194 |     expect.soft(card.y).toBeGreaterThanOrEqual(62);
  195 |     expect.soft(card.y + card.height).toBeLessThanOrEqual(footer.y - 8);
  196 |     expect.soft(enter.height).toBeGreaterThanOrEqual(44);
  197 |     expect.soft(enter.y + enter.height).toBeLessThanOrEqual(footer.y - 8);
  198 |     await page.locator('.nc-start').click(); await page.clock.runFor(150);
  199 |     await expect(page.locator('.nc-you')).toBeVisible();
  200 |     const you = await bounds('.nc-you');
  201 |     await page.screenshot({ path: `${evidence}/running-${size.width}.png` });
  202 |     expect.soft(await page.locator('.nc-ranking li').count()).toBe(5);
  203 |     expect.soft(you.y + you.height).toBeLessThanOrEqual(footer.y - 8);
  204 |     for (const selector of ['#restart-game', '#favourite-game', '#rules-game', '#game-menu', '.nc-boost']) {
  205 |       const control = await bounds(selector);
  206 |       const overlap = you.x < control.x + control.width && you.x + you.width > control.x && you.y < control.y + control.height && you.y + you.height > control.y;
  207 |       expect.soft(overlap, `YOU overlaps ${selector}`).toBe(false);
  208 |     }
  209 |   });
  210 | }
  211 | 
```