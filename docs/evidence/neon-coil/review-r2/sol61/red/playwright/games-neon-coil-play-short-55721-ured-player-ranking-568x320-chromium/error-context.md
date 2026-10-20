# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: games/neon-coil/play.spec.ts >> short landscape bounds and unobscured player ranking 568x320
- Location: tests/games/neon-coil/play.spec.ts:190:3

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 250
Received:    351.875
```

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 250
Received:    290.28125
```

```
Error: Enter overlaps #restart-game

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

```
Error: Enter overlaps #favourite-game

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

```
Error: Every sampled Enter point reaches Enter

expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 2

@@ -4,8 +4,8 @@
    true,
    true,
    true,
    true,
    true,
-   true,
-   true,
+   false,
+   false,
  ]
```

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 250
Received:    252.5
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
          - img "Neon Coil arena. Move the pointer without clicking, drag on touch, or use arrows and WASD to steer. Hold Space to boost. P pauses." [active] [ref=e25]
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
  119 |   const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await open(page);
  120 |   for (let run = 0; run < 3; run++) {
  121 |     await page.getByRole('button', { name: 'Enter arena', exact: true }).click(); await page.locator('.nc-boost').focus();
  122 |     await page.keyboard.down('Enter'); await page.clock.runFor(150); await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  123 |     await page.keyboard.up('Enter'); await page.clock.runFor(150); await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  124 |     if (run === 0) {
  125 |       await page.locator('.nc-canvas').focus(); await page.keyboard.down('Space'); await page.clock.runFor(150);
  126 |       await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  127 |       await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.clock.runFor(150);
  128 |       await expect(game(page)).toHaveAttribute('data-boosting', 'false'); await page.keyboard.up('Space');
  129 |     }
  130 |     await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); const before = (await saved(page)).ticks;
  131 |     await page.clock.fastForward(8000);
  132 |     await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); const after = (await saved(page)).ticks;
  133 |     expect(after - before).toBeLessThanOrEqual(15);
  134 |     await page.getByRole('link', { name: 'Back to game library', exact: true }).click(); await expect(game(page)).toHaveCount(0);
  135 |     await page.keyboard.press('p'); await page.clock.runFor(150);
  136 |     await page.evaluate(() => localStorage.setItem('pocket-arcade:v1:save:neon-coil', JSON.stringify({ version: 1, data: { version: 1, snakes: 'broken' } })));
  137 |     await page.getByRole('link', { name: 'Play Neon Coil', exact: true }).click(); await expect(game(page)).toHaveAttribute('data-tick', '0');
  138 |   }
  139 |   expect(errors).toEqual([]);
  140 | });
  141 | test('the library retains original grid Snake and opens Neon Coil separately', async ({ page }) => {
  142 |   await open(page); await page.getByRole('link', { name: 'Back to game library', exact: true }).click();
  143 |   await expect(page.locator('.game-card')).toHaveCount(14);
  144 |   await expect(page.getByRole('link', { name: 'Play Snake', exact: true })).toBeVisible();
  145 |   await page.getByRole('link', { name: 'Play Snake', exact: true }).click();
  146 |   await expect(page.getByRole('button', { name: 'Start slithering', exact: true })).toBeVisible();
  147 |   await page.keyboard.press('ArrowRight'); await page.clock.runFor(690);
  148 |   await expect(page.locator('#game-score strong')).toHaveText('10');
  149 |   await expect(page.locator('.snake-game')).toHaveCount(1); await expect(game(page)).toHaveCount(0);
  150 |   await page.getByRole('link', { name: 'Back to game library', exact: true }).click();
  151 |   await page.getByRole('link', { name: 'Play Neon Coil', exact: true }).click();
  152 |   await expect(page.getByRole('button', { name: 'Enter arena', exact: true })).toBeVisible();
  153 |   await expect(game(page)).toHaveAttribute('data-tick', '0'); await expect(page.locator('.snake-game')).toHaveCount(0);
  154 | });
  155 | 
  156 | for (const order of ['steering-first', 'boost-first', 'reacquire'] as const) {
  157 |   test(`native touch ownership: ${order}`, async ({ browser, browserName }) => {
  158 |     test.skip(browserName !== 'chromium', 'Native multi-touch requires Chromium CDP.');
  159 |     const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  160 |     await seedStudyTopic(context); const page = await context.newPage(); await open(page); await page.locator('.nc-start').tap();
  161 |     const cdp = await context.newCDPSession(page);
  162 |     const b = (await page.locator('.nc-boost').boundingBox())!;
  163 |     const boost = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 };
  164 |     const steer = { x: 195, y: 422, id: 2 };
  165 |     const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  166 |     try {
  167 |       await send('touchStart', [order === 'boost-first' ? boost : steer]);
  168 |       await send('touchStart', [boost, steer]);
  169 |       if (order === 'reacquire') {
  170 |         // CDP touchEnd identifies the contact to release; Boost stays down.
  171 |         await send('touchEnd', [steer]);
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
  191 |     await page.setViewportSize(size); await open(page);
  192 |     const bounds = async (selector: string) => (await page.locator(selector).boundingBox())!;
  193 |     const card = await bounds('.nc-card'), enter = await bounds('.nc-start');
  194 |     const footer = await bounds('#restart-game');
  195 |     await page.screenshot({ path: `${evidence}/intro-${size.width}.png` });
  196 |     expect.soft(card.x).toBeGreaterThanOrEqual(0);
  197 |     expect.soft(card.x + card.width).toBeLessThanOrEqual(size.width);
  198 |     expect.soft(card.y).toBeGreaterThanOrEqual(62);
  199 |     expect.soft(card.y + card.height).toBeLessThanOrEqual(footer.y - 8);
  200 |     expect.soft(enter.height).toBeGreaterThanOrEqual(44);
  201 |     expect.soft(enter.y + enter.height).toBeLessThanOrEqual(footer.y - 8);
  202 |     for (const selector of ['#restart-game', '#favourite-game', '#rules-game', '#game-menu']) {
  203 |       const control = await bounds(selector);
  204 |       const overlap = enter.x < control.x + control.width && enter.x + enter.width > control.x && enter.y < control.y + control.height && enter.y + enter.height > control.y;
  205 |       expect.soft(overlap, `Enter overlaps ${selector}`).toBe(false);
  206 |     }
  207 |     // Cover the whole actionable button, including its bottom-right area where Restart covered it.
  208 |     const hits = await page.locator('.nc-start').evaluate(button => {
  209 |       const b = button.getBoundingClientRect();
  210 |       return [.1, .5, .9].flatMap(x => [.1, .5, .9].map(y => button.contains(document.elementFromPoint(b.x + b.width * x, b.y + b.height * y))));
  211 |     });
  212 |     expect.soft(hits, 'Every sampled Enter point reaches Enter').toEqual(Array(9).fill(true));
  213 |     expect.soft(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([size.width, size.height]);
  214 |     await page.locator('.nc-start').click(); await page.clock.runFor(150);
  215 |     await expect(page.locator('.nc-you')).toBeVisible();
  216 |     const you = await bounds('.nc-you');
  217 |     await page.screenshot({ path: `${evidence}/running-${size.width}.png` });
  218 |     expect.soft(await page.locator('.nc-ranking li').count()).toBe(5);
> 219 |     expect.soft(you.y + you.height).toBeLessThanOrEqual(footer.y - 8);
      |                                     ^ Error: expect(received).toBeLessThanOrEqual(expected)
  220 |     for (const selector of ['#restart-game', '#favourite-game', '#rules-game', '#game-menu', '.nc-boost']) {
  221 |       const control = await bounds(selector);
  222 |       const overlap = you.x < control.x + control.width && you.x + you.width > control.x && you.y < control.y + control.height && you.y + you.height > control.y;
  223 |       expect.soft(overlap, `YOU overlaps ${selector}`).toBe(false);
  224 |     }
  225 |   });
  226 | }
  227 | test('short narrow viewport keeps intro and Boost within the supported 320px width', async ({ page }) => {
  228 |   await page.setViewportSize({ width: 320, height: 568 }); await open(page);
  229 |   for (const selector of ['.nc-card', '.nc-start', '.nc-boost']) {
  230 |     const box = (await page.locator(selector).boundingBox())!;
  231 |     expect.soft(box.x, selector).toBeGreaterThanOrEqual(0);
  232 |     expect.soft(box.x + box.width, selector).toBeLessThanOrEqual(320);
  233 |     expect.soft(box.y + box.height, selector).toBeLessThanOrEqual(498);
  234 |   }
  235 |   await page.screenshot({ path: `${evidence}/intro-320.png` });
  236 | });
  237 | 
```