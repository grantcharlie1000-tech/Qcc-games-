import { test, expect, originalTheme, keyboardMode } from "../fixtures";
import type { Page, Locator, CDPSession } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import { glyphFillMask, settleGlassInk, HIDDEN_INK } from "../glass-contrast";
import {
  pixels,
  textContrast,
  boundary,
  difference,
  displacement,
  rgb,
  ratio,
} from "./pixels";
import contract from "./contract.json" with { type: "json" };
const OUTPUT = "/workspace/liquid-glass/screenshots";
const surfaces = [
  { name: "shell", route: "/", bar: ".app-tabbar", menu: ".app-menu" },
  {
    name: "movies",
    route: "/#/movies/browse/movie",
    bar: ".movies-mobile-nav",
    menu: ".movies-menu",
  },
];
const frames = (page: Page, n = 2) =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const tick = () => (--n <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
async function stage(page: Page, background: string) {
  await page.evaluate(async (background) => {
    document.querySelector("#score-background")?.remove();
    const el = document.createElement("div");
    el.id = "score-background";
    el.setAttribute("aria-hidden", "true");
    const fills: Record<string, string> = {
      black: "#000",
      white: "#fff",
      gray: "#808080",
      saturated: "linear-gradient(90deg,#f00,#00f,#00ff40)",
      grid: "repeating-linear-gradient(0deg,transparent 0 15px,#111 15px 16px),repeating-linear-gradient(90deg,#fff 0 15px,#111 15px 16px)",
    };
    el.style.cssText = "position:fixed;inset:0;z-index:1;pointer-events:none;";
    if (background.endsWith("photo")) {
      const image = new Image();
      image.src =
        background === "bright-photo"
          ? "/study/photos/river-catchment.webp"
          : "/study/photos/produce-market.webp";
      await image.decode();
      el.style.background = `url("${image.src}") center/cover`;
    } else el.style.background = fills[background];
    document.body.append(el);
  }, background);
  await frames(page, 3);
}
async function contrast(page: Page, bar: Locator) {
  await settleGlassInk(bar);
  const box = (await bar.boundingBox())!;
  const boxes = await bar.evaluate((root) => {
    const base = root.getBoundingClientRect(),
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
      out = [];
    while (walker.nextNode()) {
      const node = walker.currentNode,
        p = node.parentElement!;
      if (!node.textContent?.trim() || !p.getClientRects().length) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const b = range.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      p.setAttribute("data-score-ink", "");
      out.push({
        x: b.x - base.x,
        y: b.y - base.y,
        w: b.width,
        h: b.height,
        color: (() => {
          const style = getComputedStyle(p),
            color = style.color.match(/[\d.]+/g)!.map(Number);
          let opacity = color[3] ?? 1;
          for (let el: Element | null = p; el; el = el.parentElement)
            opacity *= parseFloat(getComputedStyle(el).opacity);
          return `rgba(${color[0]},${color[1]},${color[2]},${opacity})`;
        })(),
      });
    }
    return out;
  });
  const mask = await glyphFillMask(page, bar, "[data-score-ink]");
  const hide = await page.addStyleTag({
    content: `[data-score-ink]{-webkit-text-fill-color:${HIDDEN_INK}!important}`,
  });
  const bg = await bar.screenshot({ animations: "disabled" });
  await hide.evaluate((e) => e.parentNode?.removeChild(e));
  const sample = textContrast(
    await pixels(bg),
    await pixels(Buffer.from(mask, "base64")),
    boxes,
    box,
  );
  return { ...sample, labels: boxes.length };
}
async function usable(page: Page, menu: Locator) {
  await menu.focus();
  await keyboardMode(page);
  await page.keyboard.press("Enter");
  const dialog = page.locator("dialog[open]").first();
  const opened = await dialog.isVisible();
  await page.keyboard.press("Escape");
  await frames(page, 24);
  const returned =
    !(await dialog.isVisible()) &&
    (await menu.evaluate((el) => document.activeElement === el));
  await page.keyboard.press("Space");
  await frames(page, 12);
  const space = await dialog.isVisible();
  await page.keyboard.press("Escape");
  await frames(page, 12);
  return opened && returned && space && !(await dialog.isVisible());
}
async function pill(bar: Locator) {
  return bar.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el, "::after");
    const matrix =
      s.transform === "none" ? new DOMMatrix() : new DOMMatrix(s.transform);
    const left = parseFloat(s.left) || 0,
      width = parseFloat(s.width) || 0;
    const translation =
      s.translate === "none" ? 0 : parseFloat(s.translate) || 0;
    return {
      center:
        r.x +
        ((left + width / 2 + matrix.m41 + translation) * r.width) /
          (el as HTMLElement).offsetWidth,
      width,
      scale: s.scale,
      transform: s.transform,
      background: s.backgroundColor,
    };
  });
}
async function scrollSample(page: Page, duration: number) {
  return page.evaluate(async (duration) => {
    const root = document.scrollingElement!;
    scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 350));
    const span = Math.max(1, root.scrollHeight - innerHeight),
      intervals: number[] = [];
    let first = 0,
      last = 0;
    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        if (!first) {
          first = last = now;
        } else {
          intervals.push(now - last);
          last = now;
        }
        const t = now - first;
        scrollTo(
          0,
          Math.round((span * (1 - Math.cos((t / duration) * Math.PI * 4))) / 2),
        );
        if (t < duration) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    scrollTo(0, 0);
    return intervals;
  }, duration);
}
const quantile = (values: number[], q: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.ceil(values.length * q) - 1)
  ];
const median = (v: number[]) => quantile(v, 0.5);
for (const width of [1280, 390])
  test(`liquid glass measurements at ${width}`, async ({
    page,
    context,
    browserName,
    browser,
  }, info) => {
    let cdp: CDPSession | undefined;
    let appOverride = false;
    const assertions = contract.ids.map((id) => ({
      id,
      pass: false,
      evidence: unknownEvidence("Measurement did not run"),
    }));
    function unknownEvidence(value: unknown): unknown {
      return value;
    }
    const record = (id: string, pass: boolean, evidence: unknown) => {
      const row = assertions.find((row) => row.id === id);
      if (!row) throw Error(`Unknown assertion ${id}`);
      row.pass = pass;
      row.evidence = evidence;
    };
    const attempt = async (work: () => Promise<void>) => {
      try {
        await work();
      } catch (e) {
        console.log("Measurement error:", String(e));
      }
    };
    await mkdir(OUTPUT, { recursive: true });
    await originalTheme(context);
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/movies?*", (route) =>
      route.fulfill({ status: 503, json: { error: "catalog_not_configured" } }),
    );
    const prefix = `${width === 1280 ? "desktop-1280" : "mobile-390x844"}-${browserName}`;
    try {
      for (const surface of surfaces)
        await attempt(async () => {
          await page.goto(surface.route);
          const bar = page.locator(surface.bar),
            menu = page.locator(surface.menu);
          await expect(bar).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await frames(page, 5);
          for (const background of contract.backgrounds)
            await attempt(async () => {
              await stage(page, background);
              const b = (await bar.boundingBox())!;
              const visible = await bar.isVisible();
              // Full review frames preserve the control's actual placement over the scene.
              const shot = await page.screenshot({
                path: `${OUTPUT}/${prefix}-${surface.name}-${background}.png`,
                animations: "disabled",
              });
              const bare = await bar.evaluate((el) => {
                const old = (el as HTMLElement).style.visibility;
                (el as HTMLElement).style.visibility = "hidden";
                return old;
              });
              const noControl = await page.screenshot({
                path: `${OUTPUT}/${prefix}-${surface.name}-${background}-untouched.png`,
                animations: "disabled",
              });
              await bar.evaluate(
                (el, old) => ((el as HTMLElement).style.visibility = old),
                bare,
              );
              const p = await pixels(shot),
                under = await pixels(noControl);
              const clip = async (buf: Buffer) => {
                const sharp = (await import("sharp")).default;
                return pixels(
                  await sharp(buf)
                    .extract({
                      left: Math.floor(b.x),
                      top: Math.floor(b.y),
                      width: Math.floor(b.width),
                      height: Math.floor(b.height),
                    })
                    .png()
                    .toBuffer(),
                );
              };
              const visibleDelta = difference(
                await clip(shot),
                await clip(noControl),
              );
              record(
                `${surface.name}/${background}/visible`,
                visible && b.width > 44 && b.height >= 44 && visibleDelta > 0.5,
                {
                  visible,
                  box: b,
                  visibleDelta,
                  untouchedPixels: under.width * under.height,
                },
              );
              try {
                const text = await contrast(page, bar);
                record(
                  `${surface.name}/${background}/text`,
                  text.labels > 0 && text.count > 0 && text.worst >= 4.5,
                  text,
                );
              } catch (error) {
                record(`${surface.name}/${background}/text`, false, {
                  error: String(error),
                });
              }
              const edge = boundary(p, b);
              record(`${surface.name}/${background}/boundary`, edge >= 3, {
                worst: edge,
                minimum: 3,
              });
            });
          await stage(page, "busy-photo");
          await page.waitForTimeout(600);
          await attempt(async () => {
            const target = bar
                .locator(
                  ".ui-tab[aria-current=page],.ui-tab[aria-pressed=true]",
                )
                .first()
                .or(bar.locator(".ui-tab").first())
                .first(),
              b = (await target.boundingBox())!;
            await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
            await frames(page, 8);
            const restState = await pill(bar);
            const rest = await pixels(await bar.screenshot());
            await page.mouse.down();
            await frames(page, 1);
            const pressed = await pixels(
              await bar.screenshot({
                path: `${OUTPUT}/${prefix}-${surface.name}-pressed.png`,
              }),
            );
            record(`${surface.name}/press`, difference(rest, pressed) > 0.15, {
              pixelChange: difference(rest, pressed),
            });
            await page.mouse.move(0, 0);
            await page.mouse.up();
            await page.waitForTimeout(550);
            await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
            await frames(page, 8);
            const released = await pixels(
              await bar.screenshot({
                path: `${OUTPUT}/${prefix}-${surface.name}-released.png`,
              }),
            );
            const releaseState = await pill(bar);
            record(
              `${surface.name}/release`,
              difference(rest, released) <=
                Math.min(0.5, difference(rest, pressed) * 0.25) &&
                Math.abs(releaseState.center - restState.center) <= 0.5 &&
                releaseState.scale === restState.scale,
              {
                pixelChange: difference(rest, released),
                pressedChange: difference(rest, pressed),
                releaseState,
                restState,
              },
            );
            await page.mouse.down();
            await frames(page, 5);
            // Releasing the physical mouse clears the UA :active state. Block
            // release events before app listeners so only pointercancel can
            // perform the application's cancellation response.
            await page.evaluate(() => {
              for (const type of ["pointerup", "mouseup", "click"])
                window.addEventListener(
                  type,
                  (event) => {
                    event.stopImmediatePropagation();
                    event.preventDefault();
                  },
                  { capture: true, once: true },
                );
            });
            await target.evaluate((el) =>
              el.dispatchEvent(
                new PointerEvent("pointercancel", {
                  pointerId: 1,
                  bubbles: true,
                }),
              ),
            );
            await page.mouse.up();
            await page.waitForTimeout(550);
            const cancelled = await pixels(await bar.screenshot());
            record(
              `${surface.name}/cancel`,
              difference(rest, cancelled) <=
                Math.min(0.5, difference(rest, pressed) * 0.25) &&
                (await pill(bar)).scale === restState.scale,
              {
                pixelChange: difference(rest, cancelled),
                pressedChange: difference(rest, pressed),
              },
            );
            await page.mouse.move(0, 0);
            await page.mouse.up();
            await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(400);
            await frames(page, 5);
            const start = await pill(bar),
              hits = [],
              tracking: {
                pointer: number;
                visual: number;
                expected: number;
                error: number;
              }[] = [],
              bounds = [];
            await bar.evaluate(
              (el, initialPointer) => {
                const state = {
                  running: true,
                  pointer: initialPointer,
                  trace: [] as {
                    pointer: number;
                    visual: number;
                    time: number;
                  }[],
                };
                (
                  globalThis as unknown as { __glassDragTrace: typeof state }
                ).__glassDragTrace = state;
                const move = (event: PointerEvent) =>
                  (state.pointer = event.clientX);
                window.addEventListener("pointermove", move, true);
                const frame = (time: number) => {
                  if (!state.running) {
                    window.removeEventListener("pointermove", move, true);
                    return;
                  }
                  const r = el.getBoundingClientRect(),
                    style = getComputedStyle(el, "::after");
                  const matrix =
                    style.transform === "none"
                      ? new DOMMatrix()
                      : new DOMMatrix(style.transform);
                  const translation =
                    style.translate === "none"
                      ? 0
                      : parseFloat(style.translate) || 0;
                  const visual =
                    r.x +
                    (((parseFloat(style.left) || 0) +
                      (parseFloat(style.width) || 0) / 2 +
                      matrix.m41 +
                      translation) *
                      r.width) /
                      (el as HTMLElement).offsetWidth;
                  state.trace.push({ pointer: state.pointer, visual, time });
                  requestAnimationFrame(frame);
                };
                requestAnimationFrame(frame);
              },
              b.x + b.width / 2,
            );
            for (const offset of [
              0, 4, 8, 12, 16, 20, 24, 20, 16, 12, 8, 4, 0,
            ]) {
              const x = b.x + b.width / 2 + offset,
                y = b.y + b.height / 2;
              await page.mouse.move(x, y);
              await frames(page, 1);
              bounds.push((await target.boundingBox())!);
              const visual = await pill(bar);
              tracking.push({
                pointer: x,
                visual: visual.center,
                expected: start.center + offset,
                error: Math.abs(visual.center - start.center - offset),
              });
              hits.push(
                await target.evaluate(
                  (el, { x, y }) => {
                    const hit = document.elementFromPoint(x, y);
                    return hit === el || (!!hit && el.contains(hit));
                  },
                  { x, y },
                ),
              );
            }
            const rawTrace = await page.evaluate(() => {
              const state = (
                globalThis as unknown as {
                  __glassDragTrace: {
                    running: boolean;
                    trace: { pointer: number; visual: number; time: number }[];
                  };
                }
              ).__glassDragTrace;
              state.running = false;
              return state.trace;
            });
            const frameTrace = rawTrace.map((frame) => ({
              ...frame,
              error: Math.abs(
                frame.visual -
                  start.center -
                  (frame.pointer - (b.x + b.width / 2)),
              ),
            }));
            await bar.screenshot({
              path: `${OUTPUT}/${prefix}-${surface.name}-dragged.png`,
            });
            await page.mouse.move(0, 0);
            await page.mouse.up();
            record(
              `${surface.name}/drag-tracking`,
              frameTrace.length >= 13 &&
                Math.max(...frameTrace.map((f) => f.pointer)) -
                  Math.min(...frameTrace.map((f) => f.pointer)) >=
                  20 &&
                Math.max(...frameTrace.map((f) => f.visual)) -
                  Math.min(...frameTrace.map((f) => f.visual)) >=
                  20 &&
                tracking.every((sample) => sample.error <= 8) &&
                frameTrace.every(
                  (frame, i) =>
                    frame.error <= 8 &&
                    (frame.error <= 4 ||
                      i === 0 ||
                      frameTrace[i - 1].error <= 4),
                ),
              { frameTrace, tracking },
            );
            record(
              `${surface.name}/drag-hit-target`,
              hits.every(Boolean) &&
                bounds.every(
                  (box) =>
                    Math.abs(box.x - b.x) <= 1 &&
                    Math.abs(box.y - b.y) <= 1 &&
                    Math.abs(box.width - b.width) <= 1 &&
                    Math.abs(box.height - b.height) <= 1,
                ),
              { hits, bounds, original: b },
            );
          });
          await attempt(async () => {
            await page.emulateMedia({ reducedMotion: "reduce" });
            await frames(page, 8);
            const tab = bar.locator(".ui-tab").first();
            const b = (await tab.boundingBox())!;
            await page.mouse.move(0, 0);
            await frames(page, 8);
            const normal = await pill(bar);
            await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
            await page.mouse.down();
            const held = [];
            for (let i = 0; i < 12; i++) {
              await frames(page, 1);
              held.push(await pill(bar));
            }
            await page.mouse.move(0, 0);
            await page.mouse.up();
            const samples = [];
            for (let i = 0; i < 24; i++) {
              await frames(page, 1);
              samples.push(await pill(bar));
            }
            await bar.screenshot({
              path: `${OUTPUT}/${prefix}-${surface.name}-reduced-motion.png`,
            });
            const all = [...held, ...samples];
            const elastic = all.some(
              (s) =>
                (s.scale !== "none" &&
                  s.scale
                    .split(" ")
                    .some((v) => Math.abs(parseFloat(v) - 1) > 0.001)) ||
                (s.transform !== "none" &&
                  s.transform !== "matrix(1, 0, 0, 1, 0, 0)"),
            );
            record(
              `${surface.name}/reduced-motion`,
              !elastic &&
                samples.every((s) => Math.abs(s.center - normal.center) < 1),
              { normal, held, samples },
            );
            await page.emulateMedia({ reducedMotion: "no-preference" });
          });
          // WebKit's plain frost has no displacement requirement. It still must paint
          // a surface, pass the contrast matrix above, and activate the actual menu.
          await attempt(async () => {
            const mode = await bar.getAttribute("data-glass-mode");
            record(
              `${surface.name}/fallback-visible`,
              (await bar.isVisible()) &&
                (browserName !== "webkit" || mode === "blur" || mode === "off"),
              { mode, webkitDisplacementExempt: browserName === "webkit" },
            );
            record(
              `${surface.name}/fallback-usable`,
              await usable(page, menu),
              {
                action:
                  "Keyboard Enter and Space open the dialog; Escape closes and returns focus",
              },
            );
            await stage(page, "grid");
            const box = (await bar.boundingBox())!;
            const hide = await page.addStyleTag({
              content: `${surface.bar} .ui-tab{visibility:hidden!important}${surface.bar}::after{visibility:hidden!important}`,
            });
            const glass = await pixels(await bar.screenshot());
            await bar.evaluate(
              (el) => ((el as HTMLElement).style.visibility = "hidden"),
            );
            const raw = await pixels(await page.screenshot());
            await bar.evaluate(
              (el) => ((el as HTMLElement).style.visibility = ""),
            );
            const transmissionShots = [];
            for (const bg of ["black", "white"]) {
              await stage(page, bg);
              transmissionShots.push(await pixels(await bar.screenshot()));
            }
            await hide.evaluate((el) => el.parentNode?.removeChild(el));
            let transmitted = 0,
              transmissionCount = 0;
            for (let y = 16; y < glass.height - 16; y++)
              for (let x = 32; x < glass.width - 32; x++) {
                transmitted +=
                  Math.abs(
                    rgb(transmissionShots[0], x, y)[0] -
                      rgb(transmissionShots[1], x, y)[0],
                  ) / 255;
                transmissionCount++;
              }
            const transmission = transmitted / transmissionCount;
            const values = [],
              source = [];
            for (let y = 16; y < glass.height - 16; y++)
              for (let x = 32; x < glass.width - 32; x++) {
                values.push(rgb(glass, x, y)[0]);
                source.push(rgb(raw, box.x + x, box.y + y)[0]);
              }
            const sd = (v: number[]) => {
              const mean = v.reduce((a, b) => a + b, 0) / v.length;
              return Math.sqrt(
                v.reduce((sum, n) => sum + (n - mean) ** 2, 0) / v.length,
              );
            };
            const attenuation = sd(values) / sd(source);
            record(
              `${surface.name}/fallback-frost`,
              values.length > 0 &&
                (transmission <= 0.1 || attenuation / transmission <= 0.5),
              {
                attenuation,
                transmission,
                normalized: attenuation / transmission,
                samples: values.length,
                accepts: "Frost or opaque fallback",
              },
            );
          });
          await attempt(async () => {
            let preference = "";
            if (browserName === "chromium") {
              cdp = await context.newCDPSession(page);
              await cdp.send("Emulation.setEmulatedMedia", {
                features: [
                  { name: "prefers-reduced-transparency", value: "reduce" },
                ],
              });
              preference = "CDP prefers-reduced-transparency";
            } else {
              // Use a real app setting if one exists. Do not fake matchMedia or inject
              // an opaque style: a missing manual equivalent must remain a failure.
              await menu.click();
              const override = page.getByRole("checkbox", {
                name: /reduce transparency|opaque surfaces/i,
              });
              if (await override.count()) {
                await override.check();
                appOverride = true;
                preference = "App opaque surface override";
              }
              await page.keyboard.press("Escape");
            }
            record(
              `${surface.name}/reduced-transparency-available`,
              !!preference,
              {
                preference:
                  preference ||
                  "No app equivalent override available in WebKit",
              },
            );
            const shots: Awaited<ReturnType<typeof pixels>>[] = [];
            for (const bg of ["black", "white"]) {
              await stage(page, bg);
              await frames(page, 8);
              shots.push(
                await pixels(
                  await bar.screenshot({
                    path: `${OUTPUT}/${prefix}-${surface.name}-opaque-${bg}.png`,
                  }),
                ),
              );
            }
            let maximum = 0,
              samples = 0;
            for (let y = 10; y < shots[0].height - 10; y += 4)
              for (let x = 32; x < shots[0].width - 32; x += 4) {
                maximum = Math.max(
                  maximum,
                  ...rgb(shots[0], x, y).map((v, i) =>
                    Math.abs(v - rgb(shots[1], x, y)[i]),
                  ),
                );
                samples++;
              }
            record(
              `${surface.name}/reduced-transparency-opaque`,
              !!preference && samples > 0 && maximum <= 26,
              { maximumTransmission: maximum / 255, limit: 0.1, samples },
            );
            const legibility = await contrast(page, bar);
            record(
              `${surface.name}/reduced-transparency-text`,
              !!preference && legibility.worst >= 4.5 && legibility.count > 0,
              legibility,
            );
            const edge = boundary(
              await pixels(await page.screenshot()),
              (await bar.boundingBox())!,
            );
            record(
              `${surface.name}/reduced-transparency-boundary`,
              !!preference && edge >= 3,
              { worst: edge },
            );
            const mode = await bar.getAttribute("data-glass-mode");
            const active = await bar.evaluate((el) =>
              [el, ...el.querySelectorAll("*")].some((e) => {
                const s = getComputedStyle(e);
                return (
                  s.display !== "none" &&
                  (s.backdropFilter.includes("url(") ||
                    (e.matches(".ui-glass-gl") && s.visibility !== "hidden"))
                );
              }),
            );
            record(
              `${surface.name}/reduced-transparency-no-refraction`,
              !!preference && mode === "off" && !active,
              { mode, active },
            );
            record(
              `${surface.name}/reduced-transparency-action`,
              !!preference && (await usable(page, menu)),
              { preference },
            );
            await page.mouse.move(0, 0);
            await page.locator("body").evaluate((el) => {
              el.tabIndex = -1;
              el.focus();
            });
            const mb = (await menu.boundingBox())!,
              clip = {
                x: Math.max(0, mb.x - 8),
                y: Math.max(0, mb.y - 8),
                width: mb.width + 16,
                height: Math.min(844 - mb.y + 8, mb.height + 16),
              };
            const unfocused = await pixels(await page.screenshot({ clip }));
            for (
              let i = 0;
              i < 50 &&
              !(await menu.evaluate((el) => document.activeElement === el));
              i++
            )
              await page.keyboard.press("Tab");
            const focused = await pixels(await page.screenshot({ clip }));
            const focusStyle = await menu.evaluate((el) => {
              const s = getComputedStyle(el);
              return {
                focused: document.activeElement === el,
                outline: s.outlineStyle,
                width: parseFloat(s.outlineWidth),
                shadow: s.boxShadow,
              };
            });
            record(
              `${surface.name}/reduced-transparency-focus`,
              !!preference &&
                focusStyle.focused &&
                difference(focused, unfocused) > 0.15,
              {
                visibleFocusChange: difference(focused, unfocused),
                focusStyle,
              },
            );
          });
          // Reload clears CDP preferences explicitly before measuring another surface.
          if (appOverride) {
            await menu.click();
            await page
              .getByRole("checkbox", {
                name: /reduce transparency|opaque surfaces/i,
              })
              .uncheck();
            await page.keyboard.press("Escape");
            appOverride = false;
          }
          if (cdp) {
            await cdp.send("Emulation.setEmulatedMedia", { features: [] });
            await cdp.detach();
            cdp = undefined;
          }
          await expect
            .poll(() =>
              page.evaluate(
                () =>
                  matchMedia("(prefers-reduced-transparency: reduce)").matches,
              ),
            )
            .toBe(false);
        });
      await attempt(async () => {
        if (browserName === "webkit") {
          for (const id of contract.ids.filter((id) =>
            id.startsWith("refraction/"),
          ))
            record(id, true, {
              applicable: false,
              reason: "WebKit frost fallback has no displacement requirement",
            });
          return;
        }
        await page.goto("/");
        const bar = page.locator(".app-tabbar");
        await expect(bar).toBeVisible();
        await stage(page, "grid");
        const geometry = await page.addStyleTag({
          content:
            ".app-tabbar{width:240px!important;height:64px!important;min-height:64px!important}.app-tabbar .ui-tab{visibility:hidden!important}.app-tabbar::after{visibility:hidden!important}",
        });
        await page.waitForTimeout(600);
        const mode = await bar.getAttribute("data-glass-mode");
        record("refraction/enabled", mode === "svg" || mode === "webgl", {
          mode,
        });
        const filter = await bar.evaluate(
          (el) =>
            (el as HTMLElement).style
              .getPropertyValue("--ui-glass-filter")
              .match(/#([^)]*)/)?.[1],
        );
        if (!filter)
          throw Error(
            "No measurable SVG lens; WebGL requires a registered canvas fixture",
          );
        const map = page.locator(`filter[id="${filter}"] feDisplacementMap`),
          scale = await map.getAttribute("scale");
        const flat: Awaited<ReturnType<typeof pixels>>[] = [],
          bent: Awaited<ReturnType<typeof pixels>>[] = [];
        const grid = page.locator("#score-background");
        await grid.evaluate(
          (el) =>
            ((el as HTMLElement).style.background =
              "repeating-linear-gradient(0deg,transparent 0 31px,#111 31px 32px),repeating-linear-gradient(90deg,#fff 0 31px,#111 31px 32px)"),
        );
        for (let phase = 0; phase < 32; phase += 4) {
          await grid.evaluate(
            (el, p) =>
              ((el as HTMLElement).style.backgroundPosition = `${p}px ${p}px`),
            phase,
          );
          await map.evaluate((el, s) => el.setAttribute("scale", s!), scale);
          await frames(page, 3);
          bent.push(
            await pixels(
              await bar.screenshot({
                path:
                  phase === 0
                    ? `${OUTPUT}/${prefix}-refraction-on.png`
                    : undefined,
              }),
            ),
          );
          await map.evaluate((el) => el.setAttribute("scale", "0"));
          await frames(page, 3);
          flat.push(
            await pixels(
              await bar.screenshot({
                path:
                  phase === 0
                    ? `${OUTPUT}/${prefix}-refraction-flat.png`
                    : undefined,
              }),
            ),
          );
        }
        await map.evaluate((el, s) => el.setAttribute("scale", s!), scale);
        await frames(page, 3);
        const repeatA = await pixels(await bar.screenshot());
        await frames(page, 3);
        const repeatB = await pixels(await bar.screenshot());
        const measure = displacement(flat, bent),
          still = difference(repeatA, repeatB);
        record(
          "refraction/offset-2-to-4",
          measure.reliable && measure.max >= 2 && measure.max <= 4,
          { ...measure, still },
        );
        record(
          "refraction/band-8-to-14",
          measure.reliable && measure.band >= 8 && measure.band <= 14,
          measure,
        );
        record(
          "refraction/stable-center",
          measure.reliable && measure.center <= 0.5 && still <= 0.1,
          measure,
        );
        const faded =
          measure.reliable &&
          Object.values(measure.sides).every((side) => {
            const peak = side.findIndex(
              (s) => s.offset === Math.max(...side.map((p) => p.offset)),
            );
            if (peak < 0) return false;
            const tail = side.slice(peak);
            return (
              tail.every(
                (s, i) => i === 0 || s.offset <= tail[i - 1].offset + 0.5,
              ) &&
              side
                .filter((s) => s.offset > 0.5)
                .every(
                  (s) => Math.sign(s.signed) === Math.sign(side[peak].signed),
                )
            );
          });
        record(
          "refraction/fade",
          measure.reliable && faded && measure.center <= 0.5 && measure.max > 0,
          measure,
        );
        await geometry.evaluate((el) => el.parentNode?.removeChild(el));
      });
      await attempt(async () => {
        await page.goto("/");
        await expect(page.locator(".app-tabbar")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.locator(".app-tabbar .ui-tab").first().focus();
        await keyboardMode(page);
        await scrollSample(page, 600);
        await expect(page.locator(".app-tabbar")).not.toHaveAttribute(
          "data-glass-mode",
          "off",
        );
        const pairs = [];
        for (let repeat = 0; repeat < 3; repeat++) {
          const measure = async (off: boolean) => {
            const style = off
              ? await page.addStyleTag({
                  content:
                    ".arcade-glass,.arcade-glass *,.arcade-glass::before,.arcade-glass::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.ui-glass-lens,.ui-glass-gl,.ui-glass-glow{visibility:hidden!important}",
                })
              : null;
            if (!off) {
              await expect(page.locator(".app-tabbar")).not.toHaveAttribute(
                "data-glass-mode",
                "off",
              );
              await expect(page.locator(".app-tabbar")).not.toHaveAttribute(
                "data-minimized",
                "true",
              );
            }
            const intervals = await scrollSample(
              page,
              process.env.LIQUID_GLASS_LONG === "1" ? 30000 : 2200,
            );
            await style?.evaluate((e) => e.parentNode?.removeChild(e));
            if (!off) {
              await expect(page.locator(".app-tabbar")).not.toHaveAttribute(
                "data-glass-mode",
                "off",
              );
              await expect(page.locator(".app-tabbar")).not.toHaveAttribute(
                "data-minimized",
                "true",
              );
            }
            if (intervals.length < 10)
              throw Error("Insufficient frame samples");
            return {
              intervals,
              p95: quantile(intervals, 0.95),
              p99: quantile(intervals, 0.99),
            };
          };
          let off, on;
          if (repeat % 2 === 0) {
            off = await measure(true);
            on = await measure(false);
          } else {
            on = await measure(false);
            off = await measure(true);
          }
          pairs.push({ off, on });
        }
        const off95 = median(pairs.map((p) => p.off.p95)),
          off99 = median(pairs.map((p) => p.off.p99)),
          on95 = median(pairs.map((p) => p.on.p95)),
          on99 = median(pairs.map((p) => p.on.p99)),
          added = median(pairs.map((p) => p.on.p95 - p.off.p95));
        const evidence = {
          off95,
          off99,
          on95,
          on99,
          added,
          pairs,
          method:
            "Median of three paired 2.2s runs. Strict 20/33/3ms budgets; 1ms reserve for timing jitter.",
        };
        // A reserve makes the acceptance gate stricter, never relaxes project budgets.
        record("timing/off-p95", off95 <= 19, evidence);
        record("timing/off-p99", off99 <= 32, evidence);
        record("timing/on-p95", on95 <= 19, evidence);
        record("timing/on-p99", on99 <= 32, evidence);
        record("timing/added-p95", added <= 2, evidence);
      });
    } finally {
      if (appOverride) {
        await page.locator(".section-menu:visible").click();
        await page
          .getByRole("checkbox", {
            name: /reduce transparency|opaque surfaces/i,
          })
          .uncheck();
        await page.keyboard.press("Escape");
      }
      if (cdp) {
        await cdp
          .send("Emulation.setEmulatedMedia", { features: [] })
          .catch(() => {});
        await cdp.detach();
      }
      await info.attach("liquid-glass-measurements", {
        body: Buffer.from(
          JSON.stringify({
            engine: browserName,
            width,
            metadata: {
              browser: browser.version(),
              os: os.release(),
              platform: os.platform(),
              dpr: 1,
              height: 844,
              device: "Desktop browser with emulated viewport",
              zoom: 1,
            },
            assertions,
          }),
        ),
        contentType: "application/json",
      });
    }
  });

test("pixel sampler rejects 4.49 and missing glyphs", async ({ page }) => {
  await page.setContent(
    '<div style="width:100px;height:40px;background:white">Sampler</div>',
  );
  const luminance = 1.05 / 4.49 - 0.05,
    channel = 255 * (1.055 * luminance ** (1 / 2.4) - 0.055);
  expect(ratio([channel, channel, channel], [255, 255, 255])).toBeLessThan(4.5);
  expect(ratio([channel, channel, channel], [255, 255, 255])).toBeGreaterThan(
    4.48,
  );
  const blank = await pixels(await page.locator("div").screenshot());
  const noMask = { ...blank, data: Buffer.alloc(blank.data.length) };
  expect(
    textContrast(
      blank,
      noMask,
      [{ x: 0, y: 0, w: 100, h: 40, color: "rgb(0,0,0)" }],
      { width: 100, height: 40 },
    ).count,
  ).toBe(0);
});
