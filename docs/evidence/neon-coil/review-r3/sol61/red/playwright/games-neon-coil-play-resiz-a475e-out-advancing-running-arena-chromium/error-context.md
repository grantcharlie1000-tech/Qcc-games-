# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: games/neon-coil/play.spec.ts >> resize synchronizes ranking without advancing running arena
- Location: tests/games/neon-coil/play.spec.ts:241:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/#/game/neon-coil
Call log:
  - navigating to "http://127.0.0.1:4173/#/game/neon-coil", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - heading "This site can’t be reached" [level=1] [ref=e7]
    - paragraph [ref=e8]:
      - strong [ref=e9]: 127.0.0.1
      - text: refused to connect.
    - generic [ref=e10]:
      - paragraph [ref=e11]: "Try:"
      - list [ref=e12]:
        - listitem [ref=e13]: Checking the connection
        - listitem [ref=e14]:
          - link "Checking the proxy and the firewall" [ref=e15] [cursor=pointer]:
            - /url: "#buttons"
    - generic [ref=e16]: ERR_CONNECTION_REFUSED
  - generic [ref=e17]:
    - button "Reload" [ref=e19] [cursor=pointer]
    - button "Details" [ref=e20] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect, seedStudyTopic, type Page } from '../../fixtures';
  2   | const evidence = process.env.NEON_COIL_EVIDENCE_DIR || 'docs/evidence/neon-coil';
  3   | const game = (page: Page) => page.locator('.nc-game');
  4   | const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pocket-arcade:v1:save:neon-coil')!).data);
  5   | async function open(page: Page) {
  6   |   await page.clock.install({ time: new Date('2026-10-20T10:00:00Z') });
  7   |   await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
> 8   |   await page.goto('/#/game/neon-coil');
      |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/#/game/neon-coil
  9   |   await expect(page.getByRole('button', { name: 'Enter arena', exact: true })).toBeVisible();
  10  | }
  11  | test('pointer movement without click, earned growth, Space boost, P pause, keyboard and restart', async ({ page }) => {
  12  |   const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  13  |   await page.setViewportSize({ width: 1440, height: 900 }); await open(page);
  14  |   await page.getByRole('button', { name: 'Enter arena', exact: true }).click();
  15  |   await page.mouse.move(1050, 450); await page.clock.runFor(900);
  16  |   expect(Number(await game(page).getAttribute('data-x'))).toBeGreaterThan(100);
  17  |   expect(Number(await game(page).getAttribute('data-mass'))).toBeGreaterThan(30);
  18  |   await page.mouse.move(720, 170); await page.clock.runFor(450);
  19  |   expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
  20  |   await page.keyboard.down('Space'); await page.clock.runFor(250);
  21  |   await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  22  |   await page.keyboard.press('p'); await expect(page.locator('#pause-overlay')).toBeVisible();
  23  |   const before = await saved(page); expect(before.snakes[0].boosting).toBe(false);
  24  |   expect(before.snakes[0].pathLength).toBeGreaterThan(220);
  25  |   await page.clock.runFor(1000); await page.mouse.move(100, 200); await page.keyboard.press('ArrowDown');
  26  |   expect(await saved(page)).toEqual(before);
  27  |   await page.keyboard.up('Space'); await page.keyboard.press('p'); await page.clock.runFor(200);
  28  |   await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  29  |   await page.keyboard.down('ArrowRight'); await page.clock.runFor(700); await page.keyboard.up('ArrowRight');
  30  |   expect(Math.abs(Number(await game(page).getAttribute('data-angle')))).toBeLessThan(.1);
  31  |   await page.keyboard.press('ArrowDown'); await page.clock.runFor(450);
  32  |   expect(Number(await game(page).getAttribute('data-angle'))).toBeGreaterThan(1);
  33  |   await page.getByRole('button', { name: 'Restart game', exact: true }).click();
  34  |   await expect(page.getByRole('button', { name: 'Enter arena', exact: true })).toBeVisible();
  35  |   await expect(game(page)).toHaveAttribute('data-tick', '0'); expect(errors).toEqual([]);
  36  | });
  37  | test('rim death creates real food, exposes death reason, and replay has one loop', async ({ page }) => {
  38  |   await open(page); await page.locator('.nc-start').click();
  39  |   // A real held direction reaches the physical rim; no test hook sets the death state.
  40  |   await page.keyboard.down('ArrowLeft');
  41  |   // Exercise 250 ms frame gaps through real held input and the production accumulator.
  42  |   // This avoids spending 660 software-rasterized frames on a straight trip to the rim.
  43  |   for (let n = 0; n < 44; n++) await page.clock.fastForward(250);
  44  |   await page.keyboard.up('ArrowLeft');
  45  |   await expect(game(page)).toHaveAttribute('data-phase', 'dead');
  46  |   await expect(page.locator('.nc-copy')).toContainText(/rim|body|Head-on/);
  47  |   expect(Number(await game(page).getAttribute('data-trails'))).toBeGreaterThan(5);
  48  |   await expect(page.getByRole('button', { name: 'Play again', exact: true })).toBeVisible();
  49  |   await page.screenshot({ path: `${evidence}/death-browser.png` });
  50  |   await page.getByRole('button', { name: 'Play again', exact: true }).click(); await page.clock.runFor(1000);
  51  |   const ticks = Number(await game(page).getAttribute('data-tick')); expect(ticks).toBeGreaterThan(50); expect(ticks).toBeLessThanOrEqual(60);
  52  |   await expect(page.locator('.nc-canvas')).toHaveCount(1);
  53  | });
  54  | test('real hover steering into a local bot body causes death and collectible pellets', async ({ page }) => {
  55  |   await page.setViewportSize({ width: 1280, height: 720 }); await open(page); await page.locator('.nc-start').click();
  56  |   await page.mouse.move(640, 180); // Pure pointer motion, without clicking or setting game state.
  57  |   for (let n = 0; n < 24; n++) await page.clock.fastForward(250);
  58  |   await expect(game(page)).toHaveAttribute('data-phase', 'dead');
  59  |   await expect(page.locator('.nc-copy')).toContainText('body');
  60  |   expect(Number(await game(page).getAttribute('data-trails'))).toBeGreaterThan(5);
  61  |   await page.screenshot({ path: `${evidence}/body-collision-browser.png` });
  62  |   await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  63  |   const ended = await saved(page); expect(ended.snakes[0].alive).toBe(false); expect(ended.snakes[0].body).toHaveLength(0);
  64  |   expect(ended.food.some((food: { trail: boolean }) => food.trail)).toBe(true);
  65  | });
  66  | test('Escape preserves host study, saves exactly, and saved continuation waits for user', async ({ page }) => {
  67  |   await open(page); await page.locator('.nc-start').click(); await page.clock.runFor(650);
  68  |   await page.keyboard.press('Escape'); await expect(page.locator('#study-view')).toBeVisible();
  69  |   const before = await saved(page); await page.clock.runFor(1200); await page.keyboard.press('Space'); await page.keyboard.press('ArrowUp');
  70  |   expect(await saved(page)).toEqual(before);
  71  |   await page.getByRole('link', { name: 'Games', exact: true }).click(); await page.clock.runFor(150);
  72  |   expect(Number(await game(page).getAttribute('data-tick'))).toBeGreaterThan(before.ticks);
  73  |   await page.getByRole('button', { name: 'Pause game', exact: true }).click(); const paused = await saved(page);
  74  |   await page.reload(); await expect(page.getByRole('button', { name: 'Continue arena', exact: true })).toBeVisible();
  75  |   await page.clock.runFor(800); await expect(game(page)).toHaveAttribute('data-tick', String(paused.ticks));
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
  90  |     expect(await page.locator('.nc-ranking li').count()).toBe(size.width < 600 || size.height < 600 ? 5 : 10);
  91  |     for (const selector of ['#pause-game', '#restart-game', '.nc-boost']) {
  92  |       const box = (await page.locator(selector).boundingBox())!;
  93  |       expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(size.width); expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  94  |     }
  95  |   }
  96  |   await context.close();
  97  | });
  98  | test('touch drag and a second finger on the boost control steer without scrolling', async ({ browser, browserName }) => {
  99  |   test.skip(browserName !== 'chromium', 'Native multi-touch evidence uses Chromium CDP; WebKit tests mouse and keyboard.');
  100 |   const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  101 |   await seedStudyTopic(context); const page = await context.newPage(); await open(page); await page.locator('.nc-start').tap();
  102 |   const cdp = await context.newCDPSession(page);
  103 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 422, id: 1 }] });
  104 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y: 300, id: 1 }] });
  105 |   await page.clock.runFor(450); expect(Number(await game(page).getAttribute('data-y'))).toBeLessThan(-20);
  106 |   const b = (await page.locator('.nc-boost').boundingBox())!, x = b.x + b.width / 2, y = b.y + b.height / 2;
  107 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300, id: 1 }, { x, y, id: 2 }] });
  108 |   await page.clock.runFor(250); await expect(game(page)).toHaveAttribute('data-boosting', 'true');
```