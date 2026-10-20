# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: games/neon-coil/play.spec.ts >> short landscape bounds and unobscured player ranking 740x360
- Location: tests/games/neon-coil/play.spec.ts:189:3

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 290
Received:    426.65625
```

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 290
Received:    365.0625
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 5
Received: 10
```

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 290
Received:    364
```

```
Error: YOU overlaps #restart-game

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

```
Error: YOU overlaps #favourite-game

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

```
Error: YOU overlaps #rules-game

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

```
Error: YOU overlaps #game-menu

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
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
              - listitem:
                - generic: "6"
                - generic: Orbit
                - strong: "69"
              - listitem:
                - generic: "7"
                - generic: Ripple
                - strong: "69"
              - listitem:
                - generic: "8"
                - generic: Juniper
                - strong: "67"
              - listitem:
                - generic: "9"
                - generic: Mango
                - strong: "63"
              - listitem:
                - generic: "10"
                - generic: Cosmo
                - strong: "63"
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
  164 |     const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  165 |     try {
  166 |       await send('touchStart', [order === 'boost-first' ? boost : steer]);
  167 |       await send('touchStart', [boost, steer]);
  168 |       if (order === 'reacquire') {
  169 |         // CDP touchEnd identifies the contact to release; Boost stays down.
  170 |         await send('touchEnd', [steer]);
  171 |         steer.id = 3;
  172 |         await send('touchStart', [boost, steer]);
  173 |       }
  174 |       steer.y = 200; await send('touchMove', [boost, steer]); await page.clock.runFor(500);
  175 |       await page.screenshot({ path: `${evidence}/touch-${order}.png` });
  176 |       await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  177 |       expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
  178 |       expect(Number(await game(page).getAttribute('data-y'))).toBeLessThan(-40);
  179 |       // A further arena finger cannot steal the tracked steering pointer.
  180 |       await send('touchStart', [boost, steer, { x: 195, y: 600, id: 4 }]);
  181 |       await page.clock.runFor(150);
  182 |       expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
  183 |       await send('touchCancel', []); await page.clock.runFor(150);
  184 |       await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  185 |     } finally { await context.close(); }
  186 |   });
  187 | }
  188 | for (const size of [{ width: 844, height: 390 }, { width: 740, height: 360 }]) {
  189 |   test(`short landscape bounds and unobscured player ranking ${size.width}x${size.height}`, async ({ page }) => {
  190 |     await page.setViewportSize(size); await open(page);
  191 |     const bounds = async (selector: string) => (await page.locator(selector).boundingBox())!;
  192 |     const card = await bounds('.nc-card'), enter = await bounds('.nc-start');
  193 |     const footer = await bounds('#restart-game');
  194 |     await page.screenshot({ path: `${evidence}/intro-${size.width}.png` });
  195 |     expect.soft(card.y).toBeGreaterThanOrEqual(62);
  196 |     expect.soft(card.y + card.height).toBeLessThanOrEqual(footer.y - 8);
  197 |     expect.soft(enter.height).toBeGreaterThanOrEqual(44);
  198 |     expect.soft(enter.y + enter.height).toBeLessThanOrEqual(footer.y - 8);
  199 |     await page.locator('.nc-start').click(); await page.clock.runFor(150);
  200 |     await expect(page.locator('.nc-you')).toBeVisible();
  201 |     const you = await bounds('.nc-you');
  202 |     await page.screenshot({ path: `${evidence}/running-${size.width}.png` });
  203 |     expect.soft(await page.locator('.nc-ranking li').count()).toBe(5);
  204 |     expect.soft(you.y + you.height).toBeLessThanOrEqual(footer.y - 8);
  205 |     for (const selector of ['#restart-game', '#favourite-game', '#rules-game', '#game-menu', '.nc-boost']) {
  206 |       const control = await bounds(selector);
  207 |       const overlap = you.x < control.x + control.width && you.x + you.width > control.x && you.y < control.y + control.height && you.y + you.height > control.y;
> 208 |       expect.soft(overlap, `YOU overlaps ${selector}`).toBe(false);
      |                                                        ^ Error: YOU overlaps #game-menu
  209 |     }
  210 |   });
  211 | }
  212 | 
```