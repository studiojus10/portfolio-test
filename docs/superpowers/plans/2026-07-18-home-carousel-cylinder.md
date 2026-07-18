# Home Hero Interior-Cylinder Carousel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home hero's three-segment "room" carousel with a single seamless CSS-3D interior cylinder (light theme, edge-to-edge cards clipping at the viewport, red glass-floor reflection), and drive all carousel motion by a time-based loop so speed is identical across refresh rates and browsers.

**Architecture:** The hero (`#home-hero-section`) becomes the perspective + clipping stage. A `preserve-3d` ring holds the 10 work cards (duplicated to 20 positions); each card is placed with `rotateY(θ) translateZ(-R)` where `R` is derived from the measured card width so cards tile the wall exactly. A single `requestAnimationFrame` loop advances rotation by `degPerSec * dt`. Drag (lazy pointer capture), tight per-card hover, prev/next, a mirrored floor reflection, and the scroll-to-content exit are layered on. The cylinder controller lives in a new focused module `src/scripts/home-cylinder.js`; the rest of `home-hero.js` (person, typewriter, loader, nav-reveal, vertical carousel) stays, with the vertical carousel also converted to delta-time.

**Tech Stack:** Astro 7 (static, `format: 'directory'`, `trailingSlash: 'never'`), vanilla ES modules with the `@scripts` / `@layouts` path aliases, Tailwind utility classes + per-page `<style is:global>`, Playwright for tests, Biome + Prettier for formatting.

## Global Constraints

- No new dependencies; no framework (no React/WebGL). Pure CSS 3D + a small rAF loop.
- Node `>=22.12.0`.
- Motion is **time-based** (`performance.now()` delta-time), never per-frame. Applies to the cylinder AND the vertical side carousel.
- Cards stay real `<a href>` anchors (keyboard, focus, SEO). Duplicate/clone cards get `aria-hidden="true"` `tabindex="-1"`.
- Preserve the click-navigation fix: **lazy** pointer capture — capture only after movement exceeds 5px, so a plain click still activates the card link.
- `prefers-reduced-motion: reduce` ⟹ no auto-rotation (drag still works).
- Default rotation speed is slow and readable (`~8 deg/sec`).
- Hover-to-slow triggers **only** when the pointer is genuinely over a ring card (`event.target.closest('#cyl-ring a[href]')`), never the whole hero.
- Do NOT run `npm run format` (it reformats every `.astro` file). Format only touched files: `npx biome format --write <files>` and `npx prettier --write src/pages/index.astro`.
- Commit messages: no attribution/co-author trailers (per the user's global CLAUDE.md).
- Reference geometry from the approved prototype (re-tune against the real hero): `DUP=2` ⟹ `N=20` positions, `STEP=18°`, `R = cardWidth / (2·sin(π/N))`, `perspective ≈ 900px`, `perspective-origin: 50% 42%`, brightness `0.82 + 0.18·max(0,cosθ)`, pointer-events on cards with `|θ| < 68°`, drag scrub `rotation -= dx·0.15`.

---

## File Structure

- **Create** `src/scripts/home-cylinder.js` — the cylinder controller: clone→measure→derive R→time-based layout loop, drag (lazy capture), tight hover, prev/next, floor-reflection mirroring. Exports `initCylinder()` and, for tests, attaches `window.__cyl` (pure `advance()` + `state()` read-outs).
- **Modify** `src/pages/index.astro` — replace the three-wall hero markup (`#room-wall-back/left/right`, their tracks, `#floor-reflection`/`#right-floor-reflection`/`#left-floor-reflection`) with a single `#cyl-ring` of restructured cards + `#cyl-floor-ring`. Update the hero `<style is:global>` with the cylinder CSS (light room, frameless caption cards, reflection). Keep person, name overlay, header, background photo, loader, prev/next, About, footer, and the whole vertical carousel.
- **Modify** `src/scripts/home-hero.js` — remove the room-carousel IIFE and the `sizeBackWall()` projection IIFE; `import { initCylinder }` and call it from `initHome()`; rewrite the scroll handler's panel-split block as a unified cylinder fade/translate exit (keep person parallax, header, bg-photo); convert the vertical-carousel loop to delta-time.
- **Modify** `tests/astro-smoke.spec.ts` — add cylinder tests (click navigates, drag scrubs without navigating, hover tight-to-cards, time-based proportionality) following the existing rAF-freeze / `page.mouse` patterns.
- `src/scripts/carousel-stills.js` — unchanged (reused for cylinder + vertical video thumbnails).

Design note: much of this feature is visual and is verified by driving the dev server and screenshotting (Astro dev is a persistent daemon: `npm run dev` → http://localhost:4321, `npx astro dev stop`). Where behavior is assertable (links, drag, hover, time proportionality), tasks use real Playwright tests first.

---

### Task 1: Restructure hero markup + cylinder CSS (static)

Replace the three-wall markup with a single ring of frameless caption cards and a reflection container, and add the light-theme cylinder CSS. No animation yet — cards will stack at the ring center until Task 2 positions them; this task's gate is "the right DOM + styles exist and the page still builds cleanly."

**Files:**
- Modify: `src/pages/index.astro` (hero `<style is:global>` block near the top; the `#home-hero-section` markup at ~`102`–`320`; the side-wall + floor-reflection markup at ~`670`–`760`)
- Test: `tests/astro-smoke.spec.ts`

**Interfaces:**
- Produces (DOM contract consumed by Task 2+): `#home-hero-section` (stage), `#cyl-ring` (preserve-3d ring; direct children are the 10 `<a class="cyl-card" href>` works in source order), `#cyl-floor-ring` (empty; JS mirrors the ring into it), `#carousel-prev` / `#carousel-next` buttons. Each card: `a.cyl-card > (.cyl-thumb > [img|video.carousel-still] + span.cyl-frame) + (.cyl-label > span.cyl-t + span.cyl-c)`.

- [ ] **Step 1: Write the failing test**

Add to `tests/astro-smoke.spec.ts`:

```typescript
test('home hero renders 10 cylinder work cards as links', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  const ring = page.locator('#cyl-ring');
  await expect(ring).toBeVisible();
  // 10 original works (clones are added by JS later and are aria-hidden)
  const originals = ring.locator('> a.cyl-card:not([aria-hidden="true"])');
  await expect(originals).toHaveCount(10);
  await expect(originals.first()).toHaveAttribute('href', '/photography/colorado/twelve-views');
  await expect(page.locator('#cyl-floor-ring')).toHaveCount(1);
  // the old room walls are gone
  await expect(page.locator('#room-wall-left')).toHaveCount(0);
  await expect(page.locator('#floor-reflection')).toHaveCount(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test -g "renders 10 cylinder work cards"`
Expected: FAIL — `#cyl-ring` not found (still the old room markup).

- [ ] **Step 3: Replace the hero `<style is:global>` cylinder rules**

In `src/pages/index.astro`, inside the existing hero `<style is:global>` block, **remove** the room-specific rules (`#room-wall-left span … font-size`, the `#room-wall-*` box-shadow / clip-path, the `#floor-reflection…mask-image`, the `#vert-track img` zoom stays, the `.vert-card` rules stay) that reference `#room-wall-*` / `#*-floor-reflection`, and **add** the cylinder rules:

```css
/* ── Interior cylinder ──────────────────────────────────────────── */
#home-hero-section {
  perspective: 900px;
  perspective-origin: 50% 42%;
  background: linear-gradient(180deg, #f4f1f0 0%, #ece8e6 60%, #e6e0dd 100%);
}
#cyl-ring, #cyl-floor-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
  z-index: 2;
}
#cyl-floor-ring { z-index: 1; }
.cyl-card {
  position: absolute;
  left: 0; top: 0;
  width: 230px;
  height: 340px;
  transform-origin: 50% 50%;
  backface-visibility: hidden;
  will-change: transform, filter;
  text-decoration: none;
}
.cyl-thumb { position: relative; width: 100%; height: 100%; overflow: hidden; }
.cyl-thumb img, .cyl-thumb video {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; display: block;
}
.cyl-frame { position: absolute; inset: 0; border: 1px solid rgba(255,255,255,.5); pointer-events: none; z-index: 2; }
.cyl-label {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 3;
  padding: 22px 12px 10px; display: flex; flex-direction: column; gap: 1px;
  background: linear-gradient(to top, rgba(246,243,242,.97), rgba(246,243,242,.72) 46%, transparent);
}
.cyl-t { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #1c1b1b;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cyl-c { font-size: 12px; color: #b32a1b; font-weight: 600; }
/* red glass-floor reflection tint + downward fade over the mirrored ring */
#cyl-floor-tint {
  position: absolute; left: 0; right: 0; bottom: 0; height: 34%; z-index: 3; pointer-events: none;
  background: linear-gradient(to bottom, transparent, rgba(200,44,32,.16) 45%, rgba(150,22,16,.4) 100%);
}
```

Keep the `.font-cjk` usage in cards via the `.cyl-c` rule above (do not rely on the removed Tailwind card classes).

- [ ] **Step 4: Replace the `#home-hero-section` inner markup**

Replace the three-wall block (`#room-wall-back` … through the end of `#room-wall-right`, i.e. the back/left/right walls and their containers/tracks) **and** the three floor-reflection blocks (`#right-floor-reflection`, `#left-floor-reflection`, and the fixed `#floor-reflection`) with:

```html
<!-- Cylinder ring (cards positioned in JS) -->
<div id="cyl-ring"></div>
<!-- Floor reflection ring (JS mirrors #cyl-ring into it) -->
<div id="cyl-floor-ring" aria-hidden="true"></div>
<div id="cyl-floor-tint" aria-hidden="true"></div>
```

Then move the 10 work `<a>` cards (currently inside `#carousel-track`) into `#cyl-ring`, restructured to the frameless format. For **each** of the 10 existing cards, keep its `href`, its `<img>`/`<video>` (including `class="carousel-still"`, `src`, `poster`, `muted playsinline preload="none"` for videos), its title text, and its CJK text, and wrap them like card 1 below (image card) / card 3 (video card):

```html
<!-- image card (worked example: card 1) -->
<a href="/photography/colorado/twelve-views" class="cyl-card">
  <div class="cyl-thumb">
    <img src="/assets/carousel/TYPOLOGY-01.jpg" alt="Twelve Views of Pikes Peak" />
    <span class="cyl-frame"></span>
  </div>
  <div class="cyl-label">
    <span class="cyl-t">Twelve Views of Pikes Peak</span>
    <span class="cyl-c">派克峰十二景</span>
  </div>
</a>

<!-- video card (worked example: card 3) -->
<a href="/video/portrait" class="cyl-card">
  <div class="cyl-thumb">
    <video class="carousel-still" src="/assets/videos/thumbnail-videos/portrait-thumbnail.mp4"
      poster="/assets/posters/portrait-thumbnail.jpg" muted playsinline preload="none"></video>
    <span class="cyl-frame"></span>
  </div>
  <div class="cyl-label">
    <span class="cyl-t">Portrait of a Musician</span>
    <span class="cyl-c">音乐家肖像</span>
  </div>
</a>
```

The 10 cards, in source order (href · asset · title · CJK · type):
1. `/photography/colorado/twelve-views` · `/assets/carousel/TYPOLOGY-01.jpg` · Twelve Views of Pikes Peak · 派克峰十二景 · img
2. `/photography/film/memory` · `/assets/carousel/MEMORY-01.jpg` · Memory · 记忆 · img
3. `/video/portrait` · video `…/portrait-thumbnail.mp4` poster `/assets/posters/portrait-thumbnail.jpg` · Portrait of a Musician · 音乐家肖像 · video
4. `/art/sketches` · `/assets/carousel/SKETCH-3.jpg` · Sketches · 素描 · img
5. `/photography/film/home` · `/assets/carousel/FILM_MISC-01.jpg` · Home · 家 · img
6. `/video/winter` · video `…/winter-scene-thumbnail.mp4` poster `/assets/posters/winter-scene-thumbnail.jpg` · Winter Scene · 冬景 · video
7. `/photography/nature/sanctuary` · `/assets/carousel/BUTTERFLIES-01.jpg` · Butterfly Sanctuary · 蝴蝶圣地 · img
8. `/video/murder` · video `…/murder-he-wrote-thumbnail.mp4` poster `/assets/posters/murder-he-wrote-thumbnail.jpg` · Murder, He Wrote · 他所写的谋杀 · video
9. `/photography/film` · `/assets/carousel/FILM_MISC-03.jpg` · Film · 胶片 · img
10. `/art/composers` · `/assets/carousel/COMPOSER-3.jpg` · Composers · 作曲家 · img

Delete the 10 duplicate cards that currently follow (the `aria-hidden` clones) — JS regenerates clones in Task 2. Keep the `#carousel-prev` / `#carousel-next` buttons, `#hero-name-overlay`, `#hero-person`, `#home-hero-header`, `#page-bg-photo`, `#page-loader`.

- [ ] **Step 5: Format only the touched file, then run the test**

Run: `npx prettier --write src/pages/index.astro`
Run: `npx playwright test -g "renders 10 cylinder work cards"`
Expected: PASS.

- [ ] **Step 6: Verify build + no console errors**

Run: `npm run check`
Expected: 0 errors.
Run the dev server (`npm run dev`), navigate to `/`, screenshot, and confirm: cards present (stacked at center is fine for now), nav/header/footer intact, no console errors. Then `npx astro dev stop`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/index.astro tests/astro-smoke.spec.ts
git commit -m "Hero: replace 3-wall room markup with cylinder ring + cards"
```

---

### Task 2: Cylinder controller — geometry + time-based rotation

Create `home-cylinder.js`: clone the 10 cards to 20 positions, derive `R` from measured card width, position every card each frame, and advance rotation by delta-time. Wire it into `home-hero.js` and delete the old room-carousel IIFE.

**Files:**
- Create: `src/scripts/home-cylinder.js`
- Modify: `src/scripts/home-hero.js` (remove the "Infinite Room Carousel" IIFE `(function () { … })();` near the top of `initHome`; add `import { initCylinder } from '@scripts/home-cylinder.js';` and call `initCylinder();`)
- Test: `tests/astro-smoke.spec.ts`

**Interfaces:**
- Consumes: the Task 1 DOM contract (`#home-hero-section`, `#cyl-ring`, `#cyl-floor-ring`, `#carousel-prev/next`).
- Produces: `initCylinder()` (default export-less named export). Test seam on `window.__cyl`:
  - `window.__cyl.advance(rotation:number, dt:number, factor:number): number` — pure step, returns `rotation + 8*factor*dt`.
  - `window.__cyl.state(): { rotation:number, hovering:boolean }` — live read-out, updated each frame.

- [ ] **Step 1: Write the failing test (time-based proportionality)**

Add to `tests/astro-smoke.spec.ts`:

```typescript
test('cylinder rotation is time-based (double dt -> double advance)', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  const [a, b] = await page.evaluate(() => [
    window.__cyl.advance(0, 1, 1),
    window.__cyl.advance(0, 2, 1),
  ]);
  expect(a).toBeCloseTo(8, 5);   // 8 deg/sec * 1s
  expect(b).toBeCloseTo(16, 5);  // proportional to dt -> frame-rate independent
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test -g "rotation is time-based"`
Expected: FAIL — `window.__cyl` undefined.

- [ ] **Step 3: Create `src/scripts/home-cylinder.js`**

```javascript
import { seekStills } from '@scripts/carousel-stills.js';

const SPEED_DEG_PER_SEC = 8; // slow, readable
const HOVER_FACTOR = 0.28;
const DUP = 2; // duplicate the 10 works to fill the ring

// Pure rotation step — time-based, so identical at any frame rate.
export function advance(rotation, dt, factor) {
  return rotation + SPEED_DEG_PER_SEC * factor * dt;
}

const norm = (a) => { a %= 360; if (a > 180) a -= 360; if (a < -180) a += 360; return a; };

export function initCylinder() {
  const stage = document.getElementById('home-hero-section');
  const ring = document.getElementById('cyl-ring');
  const floorRing = document.getElementById('cyl-floor-ring');
  if (!stage || !ring) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Clone the 10 originals to N positions.
  const originals = Array.from(ring.children);
  for (let d = 1; d < DUP; d++) {
    originals.forEach((c) => {
      const clone = c.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      ring.appendChild(clone);
    });
  }
  const N = ring.children.length;
  const STEP = 360 / N;

  // Mirror the ring into the floor-reflection ring (all non-interactive).
  if (floorRing) {
    floorRing.innerHTML = ring.innerHTML;
    floorRing.querySelectorAll('a').forEach((a) => {
      a.setAttribute('aria-hidden', 'true');
      a.setAttribute('tabindex', '-1');
    });
  }

  const mainCards = Array.from(ring.children).map((el, i) => ({ el, base: i * STEP }));
  const floorCards = floorRing
    ? Array.from(floorRing.children).map((el, i) => ({ el, base: i * STEP }))
    : [];

  let R = 735;
  let rotation = 0;
  let hovering = false;

  function measure() {
    const w = mainCards[0].el.getBoundingClientRect().width || 230;
    R = w / (2 * Math.sin(Math.PI / N)); // cardWidth == chord => exact tiling
  }

  function place(list) {
    for (let i = 0; i < list.length; i++) {
      const { el, base } = list[i];
      const th = norm(rotation + base);
      const c = Math.cos((th * Math.PI) / 180);
      // No fade / no cutoff: cards run off the edges (stage clips), backface hides the back half.
      el.style.pointerEvents = Math.abs(th) < 68 ? 'auto' : 'none';
      el.style.filter = `grayscale(1) brightness(${(0.82 + 0.18 * Math.max(0, c)).toFixed(3)})`;
      el.style.transform =
        `translate(-50%,-50%) rotateY(${th.toFixed(2)}deg) translateZ(${-R}px)`;
    }
  }
  function layout() { place(mainCards); if (floorCards.length) place(floorCards); }

  let last = 0;
  function frame(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    if (!reduce) rotation = advance(rotation, dt, hovering ? HOVER_FACTOR : 1) % 360;
    layout();
    requestAnimationFrame(frame);
  }

  // Test seam (observability only; no behavior change).
  window.__cyl = { advance, state: () => ({ rotation, hovering }) };
  // expose setter used by interaction tasks
  window.__cyl._setHover = (v) => { hovering = v; };

  window.addEventListener('resize', measure);
  window.addEventListener('load', () => {
    measure();
    seekStills(ring);
    if (floorRing) seekStills(floorRing);
  });
  measure();
  requestAnimationFrame(frame);
}
```

- [ ] **Step 4: Wire into `home-hero.js`, remove the old carousel IIFE**

In `src/scripts/home-hero.js`: at the top, keep `import { seekStills } from '@scripts/carousel-stills.js';` and add:

```javascript
import { initCylinder } from '@scripts/home-cylinder.js';
```

Inside `export function initHome() {`, **delete** the entire "Infinite Room Carousel" IIFE (the first `(function () { … })();` block — `trackBack`, `masterOffset`, `tick`, `jump`, the `window.addEventListener('load', …)` that clones side tracks, the drag handlers, and prev/next wiring), and replace it with:

```javascript
  initCylinder();
```

- [ ] **Step 5: Run the time-based test**

Run: `npx playwright test -g "rotation is time-based"`
Expected: PASS.

- [ ] **Step 6: Visual verify the cylinder**

`npm run dev`, open `/`, screenshot. Confirm: cards arranged as a curved wall, rotating slowly, running off both screen edges (clipped), no pop at the edges. `npx astro dev stop`. (Speed/curvature fine-tuning of `SPEED_DEG_PER_SEC` / `perspective` may happen here — keep the time-based formula.)

- [ ] **Step 7: Commit**

```bash
git add src/scripts/home-cylinder.js src/scripts/home-hero.js tests/astro-smoke.spec.ts
git commit -m "Hero: time-based cylinder controller replaces room carousel"
```

---

### Task 3: Drag-to-scrub (lazy capture) + click navigation

Add pointer drag on the stage that scrubs rotation, with the lazy-capture pattern so plain clicks still navigate.

**Files:**
- Modify: `src/scripts/home-cylinder.js`
- Test: `tests/astro-smoke.spec.ts`

**Interfaces:**
- Consumes: `rotation` (module state), `stage` (`#home-hero-section`).
- Produces: drag handlers on `stage`; click-suppression after a real drag.

- [ ] **Step 1: Write the failing tests**

Add to `tests/astro-smoke.spec.ts`:

```typescript
test('clicking a cylinder card navigates to its page', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; }); // freeze
  await page.waitForTimeout(60);
  // find a frontal, interactive card and its route
  const href = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#cyl-ring > a.cyl-card')];
    const vw = innerWidth;
    for (const a of cards) {
      const r = a.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      if (getComputedStyle(a).pointerEvents === 'auto' && cx > vw * 0.4 && cx < vw * 0.6) {
        a.dataset.testTarget = '1';
        return a.getAttribute('href');
      }
    }
    return null;
  });
  expect(href).toBeTruthy();
  await page.locator('#cyl-ring > a.cyl-card[data-test-target="1"]').click();
  await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, '\\/') + '$'));
});

test('dragging the cylinder scrubs it without navigating', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(60);
  const before = await page.evaluate(() => window.__cyl.state().rotation);
  const url = page.url();
  const box = await page.locator('#home-hero-section').boundingBox();
  const y = Math.round(box!.y + box!.height * 0.42);
  const x1 = Math.round(box!.x + box!.width * 0.7);
  const x2 = Math.round(box!.x + box!.width * 0.2);
  await page.mouse.move(x1, y);
  await page.mouse.down();
  for (let x = x1; x >= x2; x -= 20) await page.mouse.move(x, y);
  await page.mouse.up();
  const after = await page.evaluate(() => window.__cyl.state().rotation);
  expect(page.url()).toBe(url);                    // no navigation
  expect(Math.abs(after - before)).toBeGreaterThan(3); // rotated
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npx playwright test -g "navigates to its page|scrubs it without navigating"`
Expected: FAIL — dragging doesn't change rotation / no drag wiring.

- [ ] **Step 3: Add drag handlers in `home-cylinder.js`**

Immediately before the `window.__cyl = …` line, add:

```javascript
  // Drag-to-scrub with LAZY pointer capture (so a plain click still hits the <a>).
  let down = false, movedDrag = false, x0 = 0, lastX = 0;
  stage.style.cursor = 'grab';
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = true; movedDrag = false; x0 = e.clientX; lastX = e.clientX;
    stage.style.cursor = 'grabbing';
    if (e.pointerType !== 'touch') e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    if (!movedDrag && Math.abs(e.clientX - x0) > 5) {
      movedDrag = true;
      try { stage.setPointerCapture(e.pointerId); } catch {}
    }
    if (movedDrag) rotation = (rotation - dx * 0.15) % 360;
  });
  const endDrag = () => {
    if (!down) return;
    down = false;
    stage.style.cursor = 'grab';
    if (movedDrag) {
      stage.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); },
        { capture: true, once: true });
    }
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
```

Also make the loop stop auto-advancing while dragging: change the loop line to

```javascript
    if (!reduce && !down) rotation = advance(rotation, dt, hovering ? HOVER_FACTOR : 1) % 360;
```

(`down` is declared above this line, so keep the drag block above `frame`.)

- [ ] **Step 4: Run tests**

Run: `npx playwright test -g "navigates to its page|scrubs it without navigating"`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/home-cylinder.js tests/astro-smoke.spec.ts
git commit -m "Hero: cylinder drag-to-scrub with lazy capture; clicks still navigate"
```

---

### Task 4: Hover-to-slow (tight to cards) + prev/next buttons

Slow rotation only while the pointer is genuinely over a ring card; wire the existing prev/next buttons to step the ring.

**Files:**
- Modify: `src/scripts/home-cylinder.js`
- Test: `tests/astro-smoke.spec.ts`

**Interfaces:**
- Consumes: `stage`, `#carousel-prev`, `#carousel-next`, `rotation`, `hovering`, `STEP`.
- Produces: hover set via delegated `pointermove`; prev/next click handlers.

- [ ] **Step 1: Write the failing tests**

```typescript
test('hover slows only over a card, not the empty hero', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  const box = await page.locator('#home-hero-section').boundingBox();
  // empty room near the very top of the hero (above the wall band)
  await page.mouse.move(Math.round(box!.x + box!.width / 2), Math.round(box!.y + 12));
  expect(await page.evaluate(() => window.__cyl.state().hovering)).toBe(false);
  // over a frontal card
  const pt = await page.evaluate(() => {
    const vw = innerWidth;
    for (const a of document.querySelectorAll('#cyl-ring > a.cyl-card')) {
      const r = a.getBoundingClientRect(); const cx = r.left + r.width / 2;
      if (getComputedStyle(a).pointerEvents === 'auto' && cx > vw * 0.42 && cx < vw * 0.58)
        return { x: Math.round(cx), y: Math.round(r.top + r.height * 0.4) };
    }
    return null;
  });
  await page.mouse.move(pt!.x, pt!.y);
  expect(await page.evaluate(() => window.__cyl.state().hovering)).toBe(true);
});

test('next button rotates the cylinder by one step', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(60);
  const before = await page.evaluate(() => window.__cyl.state().rotation);
  await page.locator('#carousel-next').click();
  const after = await page.evaluate(() => window.__cyl.state().rotation);
  expect(after).not.toBe(before);
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npx playwright test -g "hover slows only over a card|next button rotates"`
Expected: FAIL — hovering stays false / no button handler.

- [ ] **Step 3: Add hover + prev/next in `home-cylinder.js`**

After the drag block, add:

```javascript
  // Hover-to-slow — ONLY over a real ring card, never the whole hero.
  stage.addEventListener('pointermove', (e) => {
    if (down) return;
    hovering = !!(e.target.closest && e.target.closest('#cyl-ring a[href]'));
  });
  stage.addEventListener('pointerleave', () => { hovering = false; });

  // Prev / next step one card.
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  if (prevBtn) prevBtn.addEventListener('click', () => { rotation = (rotation - STEP) % 360; });
  if (nextBtn) nextBtn.addEventListener('click', () => { rotation = (rotation + STEP) % 360; });
```

Remove the now-unused `window.__cyl._setHover` line from Task 2 (hover is set directly here).

- [ ] **Step 4: Run tests**

Run: `npx playwright test -g "hover slows only over a card|next button rotates"`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/home-cylinder.js tests/astro-smoke.spec.ts
git commit -m "Hero: tight per-card hover-to-slow + prev/next stepping"
```

---

### Task 5: Floor reflection + scroll-to-content exit (remove projection math)

Confirm the mirrored floor reflection renders (already populated in Task 2), position/flip it, and replace the three-wall scroll "panel split" with a single cylinder fade/translate exit. Remove the dead `sizeBackWall()` projection IIFE.

**Files:**
- Modify: `src/scripts/home-cylinder.js` (mirror-flip the floor ring)
- Modify: `src/scripts/home-hero.js` (delete the `sizeBackWall()` IIFE; rewrite the scroll handler's panel-split block)
- Modify: `src/pages/index.astro` (position `#cyl-floor-ring` under the cylinder if needed)
- Test: `tests/astro-smoke.spec.ts`

**Interfaces:**
- Consumes: `#cyl-floor-ring`, `#cyl-ring`, `#home-hero-header`, `#hero-person`, `#page-bg-photo`, `scrollY`.
- Produces: reflection transform; `p = clamp(scrollY / heroHeight, 0, 1)` driving cylinder opacity/translate.

- [ ] **Step 1: Write the failing test**

```typescript
test('scrolling past the hero fades the cylinder and reveals the About section', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 1.1, behavior: 'instant' as ScrollBehavior }));
  await page.waitForTimeout(100);
  // cylinder faded out
  const opacity = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('cyl-ring')!).opacity));
  expect(opacity).toBeLessThan(0.15);
  // About section visible
  await expect(page.locator('#about')).toBeInViewport();
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npx playwright test -g "reveals the About section"`
Expected: FAIL — `#cyl-ring` opacity stays 1 (no scroll handler for it).

- [ ] **Step 3: Flip the floor reflection in `home-cylinder.js`**

Set the floor ring's mirror transform once, after populating it (inside `initCylinder`, right after building `floorCards`):

```javascript
  if (floorRing) {
    // mirror below the cylinder: flip vertically and drop to the wall base
    floorRing.style.transform = 'translateY(100%) scaleY(-1)';
    floorRing.style.transformOrigin = '50% 0';
    floorRing.style.opacity = '0.5';
  }
```

(If the true mirrored ring looks wrong in the visual check, fall back per the spec: hide `#cyl-floor-ring` and rely on `#cyl-floor-tint` alone as a red glass gradient. Note whichever you chose in the commit message.)

- [ ] **Step 4: Rewrite the scroll exit in `home-hero.js`**

In the scroll handler IIFE, **delete** the panel-split block (the code setting `backWall.style.transform`/`opacity`, `leftWall`/`rightWall` translate+rotate, and the three floor-reflection transforms — all reference removed IDs). Replace with a cylinder exit; keep the person parallax, header slide, header-bg, and background-photo logic already in that handler:

```javascript
        // Cylinder hero exit: fade + lift the ring and its reflection.
        var ring = document.getElementById('cyl-ring');
        var floorRing = document.getElementById('cyl-floor-ring');
        var floorTint = document.getElementById('cyl-floor-tint');
        var op = String(Math.max(0, 1 - p * 1.3));
        var lift = 'translateY(' + (-p * 22) + 'vh)';
        if (ring) { ring.style.opacity = op; ring.style.transform = lift; }
        if (floorRing) { floorRing.style.opacity = String(Math.max(0, 0.5 - p)); }
        if (floorTint) { floorTint.style.opacity = op; }
```

Note: `#cyl-ring` sets its own `transform` for centering via `top/left:50%`; applying `translateY` here composes with the card transforms fine because cards are transformed relative to the ring, and the ring's own `transform` only adds the lift (the ring box is 0×0 at center). If a conflict appears, wrap the ring in a `#cyl-hero-layer` div and translate that instead.

Then **delete** the entire `sizeBackWall()` IIFE (the `(function () { … PERSP … sizeBackWall … })();` block) — it computed the back-wall position from perspective projection and is dead.

- [ ] **Step 5: Run the test + visual check**

Run: `npx playwright test -g "reveals the About section"`
Expected: PASS.
`npm run dev`, verify the red glass-floor reflection under the cylinder and a clean fade to the About section on scroll; screenshot. `npx astro dev stop`.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/home-cylinder.js src/scripts/home-hero.js src/pages/index.astro tests/astro-smoke.spec.ts
git commit -m "Hero: cylinder floor reflection + unified scroll exit; drop projection math"
```

---

### Task 6: Convert the vertical side carousel to delta-time

The vertical side carousel (`#vert-track`) still advances per-frame (`vertOffset += spd`), so it shares the refresh-rate bug. Convert it to `performance.now()` delta-time.

**Files:**
- Modify: `src/scripts/home-hero.js` (the vertical-carousel IIFE — its `tick()` and speed constants)
- Test: `tests/astro-smoke.spec.ts`

**Interfaces:**
- Consumes: `#vert-track`, `#vert-carousel-wrap`.
- Produces: time-based vertical scroll (`px/sec`). Test seam `window.__vert = { state: () => ({ offset }) }`.

- [ ] **Step 1: Write the failing test**

```typescript
test('vertical carousel advances by wall-clock time (roughly constant px/sec)', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 1.4, behavior: 'instant' as ScrollBehavior }));
  await page.waitForTimeout(120);                       // let it reveal + start
  const t0 = await page.evaluate(() => window.__vert.state().offset);
  await page.waitForTimeout(500);
  const t1 = await page.evaluate(() => window.__vert.state().offset);
  expect(Math.abs(t1 - t0)).toBeGreaterThan(10);        // it moved on a time basis
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npx playwright test -g "advances by wall-clock time"`
Expected: FAIL — `window.__vert` undefined.

- [ ] **Step 3: Convert the vertical loop to delta-time**

In the vertical-carousel IIFE in `home-hero.js`:
- Change the speed constants from px/frame to px/sec, e.g. `var NORMAL_SPEED = 150 * SPEED_FACTOR;` and `var HOVER_SPEED = 30 * SPEED_FACTOR;` (150 px/s ≈ the old 2.5 px/frame at 60 Hz).
- In `tick()`, thread delta-time. Replace the `requestAnimationFrame(tick)` loop head/advance so it reads:

```javascript
    var lastV = 0;
    function tick(t) {
      var dt = lastV ? Math.min(0.05, (t - lastV) / 1000) : 0;
      lastV = t;
      if (halfH > 0) {
        var spd = 0;
        if (introPhase === 'idle') { spd = 0; }
        else if (introPhase === 'done') { spd = isDraggingVert ? 0 : (hovering ? HOVER_SPEED : NORMAL_SPEED); }
        else { /* keep the existing intro ramp, but scale its per-frame peakSpeed usage by dt below */ spd = introSpeed(); }
        if (spd > 0) {
          vertOffset = (vertOffset + spd * dt) % halfH;
          track.style.transform = 'translateY(-' + vertOffset.toFixed(2) + 'px)';
        }
      }
      window.__vert = { state: function () { return { offset: vertOffset }; } };
      requestAnimationFrame(tick);
    }
```

If the intro `introSpeed()` ramp is kept, express its output in px/sec too (multiply the old per-frame peak by ~60), so the ramp and cruise share units. Simplest acceptable option: drop the elaborate intro ramp and start straight at `NORMAL_SPEED` when revealed.

- [ ] **Step 4: Run the test + visual check**

Run: `npx playwright test -g "advances by wall-clock time"`
Expected: PASS. Visually confirm the vertical carousel scrolls smoothly at a readable pace.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/home-hero.js tests/astro-smoke.spec.ts
git commit -m "Hero: convert vertical side carousel to time-based motion"
```

---

### Task 7: Cleanup, full suite, and cross-browser verification

Remove dead CSS/markup left from the room, format touched files, run the whole suite, and do the manual cross-browser check that motivated the work.

**Files:**
- Modify: `src/pages/index.astro` (delete any orphaned room CSS/IDs), `src/scripts/home-hero.js` (delete unused vars/helpers left after the removals)
- Test: full `tests/astro-smoke.spec.ts`

- [ ] **Step 1: Grep for orphans**

Run: `grep -nE 'room-wall|carousel-track|floor-reflection|room-left|room-right|masterOffset|sizeBackWall|W_back|W_side' src/pages/index.astro src/scripts/home-hero.js`
Expected: no matches (all removed). Delete any stragglers and any CSS rules that only targeted removed IDs.

- [ ] **Step 2: Lint + format touched files only**

Run: `npx biome check src/scripts/home-cylinder.js src/scripts/home-hero.js tests`
Run: `npx biome format --write src/scripts/home-cylinder.js src/scripts/home-hero.js tests`
Run: `npx prettier --write src/pages/index.astro`
Run: `npm run check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Run the full Playwright suite**

Run: `npx playwright test`
Expected: all pass (the new cylinder tests + all prior nav/contact/404/theme/about tests).

- [ ] **Step 4: Manual cross-browser check (the original symptom)**

`npm run dev`. In **Chrome** and **Firefox** at `/`:
- Confirm the cylinder cruises at the same slow, readable speed in both (no "fast/hard to read"; no slow-then-fast in Firefox after navigating around and returning).
- Confirm cards clip at the edges with no pop.
- Confirm hover slows only over cards; drag scrubs; a click opens the card's page.
Then `npx astro dev stop`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Hero: remove dead room code; finalize cylinder redesign"
```

---

## Self-Review

**Spec coverage:**
- Seamless interior cylinder, chord-exact tiling → Task 1 (markup/CSS) + Task 2 (`R = w/(2 sin(π/N))`).
- Edge-to-edge clip, no fade/pop → Task 2 `place()` (full opacity, backface-hidden, stage `overflow:hidden`).
- Time-based motion (cylinder) → Task 2 `advance()` + loop; (vertical) → Task 6.
- Light theme, red floor reflection, figure → Task 1 CSS + Task 5 reflection; figure `#hero-person` kept throughout.
- Real links / a11y / reduced-motion → Task 1 anchors, Task 2 `aria-hidden` clones + `reduce`.
- Lazy-capture click fix → Task 3.
- Tight hover → Task 4.
- Scroll-to-content, remove projection math → Task 5.
- Prev/next → Task 4.
- Tests (click/drag/hover/time-based) → Tasks 2–6; manual cross-browser → Task 7.
- Floor-reflection fallback documented → Task 5 Step 3 note.

**Placeholder scan:** Card markup uses a worked template + an explicit 10-row data table (values are the existing cards' real attributes, not placeholders). No "TBD"/"handle edge cases"/"add validation" left.

**Type/name consistency:** `initCylinder`, `advance(rotation, dt, factor)`, `window.__cyl.state()`, `window.__vert.state()`, IDs `#home-hero-section`/`#cyl-ring`/`#cyl-floor-ring`/`#cyl-floor-tint`/`#carousel-prev`/`#carousel-next`, classes `.cyl-card/.cyl-thumb/.cyl-frame/.cyl-label/.cyl-t/.cyl-c` — used consistently across tasks. `STEP`/`N`/`R`/`rotation`/`hovering`/`down` are single module-scoped names in `home-cylinder.js`.

**Scope:** Single subsystem (home hero + the shared time-based motion, which necessarily includes the vertical carousel). One coherent plan.
