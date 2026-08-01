import { seekStills } from '@scripts/carousel-stills.js';

const SPEED_DEG_PER_SEC = 8; // slow, readable
const HOVER_FACTOR = 0.28;
// Phones get half the cards so each one is roughly twice as wide (fewer, bigger
// works on screen at once); desktop keeps the fuller 20-card wall.
const DUP = () => (window.innerWidth < 768 ? 1 : 2);
// Cards span exactly the chord so neighbours meet edge-to-edge without
// overlapping — both white frames stay visible (a clean seam between works) and
// no card paints over its neighbour's label.
const WIDTH_FACTOR = 1.0;
// Card width : height. Phones are a little less tall; desktop is distinctly
// portrait so the works read as framed gallery panels.
const ASPECT = { mobile: 0.66, desktop: 0.5 };

// Pure rotation step — time-based, so identical at any frame rate.
export function advance(rotation, dt, factor) {
  return rotation + SPEED_DEG_PER_SEC * factor * dt;
}

const norm = (a) => {
  a %= 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
};

export function initCylinder() {
  const stage = document.getElementById('home-hero-section');
  const ring = document.getElementById('cyl-ring');
  if (!stage || !ring) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Clone the 10 originals to N positions around the ring.
  const originals = Array.from(ring.children);
  const dup = DUP();
  for (let d = 1; d < dup; d++) {
    originals.forEach((c) => {
      const clone = c.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      ring.appendChild(clone);
    });
  }
  const N = ring.children.length;
  const STEP = 360 / N;

  const mainCards = Array.from(ring.children).map((el, i) => ({
    el,
    base: i * STEP,
  }));

  // Floor reflection: mirror every ring card into #cyl-floor-ring.
  const floorRing = document.getElementById('cyl-floor-ring');
  const floorCards = [];
  if (floorRing) {
    for (const { el, base } of mainCards) {
      const clone = el.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      clone.style.pointerEvents = 'none';
      floorRing.appendChild(clone);
      floorCards.push({ el: clone, base });
    }
  }

  let R = 735;
  let rotation = 0;
  let hovering = false;
  const floorTint = document.getElementById('cyl-floor-tint');
  let glowDirty = true; // recompute the floor-glow arc after a (re)measure

  function measure() {
    // Scale the cylinder to the viewport so the wall always fills the width:
    // edge-on cards sit at screen-x ≈ ±R, so R ≈ half the viewport width.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mobile = vw < 768;
    // Radius follows viewport WIDTH so the wall always reaches both screen
    // edges (edge-on cards sit at screen-x ≈ ±R ≈ half the viewport width).
    R = vw * (mobile ? 0.66 : 0.54);
    const cardW = 2 * R * Math.sin(Math.PI / N) * WIDTH_FACTOR; // chord
    const persp = vw * (mobile ? 0.95 : 0.62);
    const scale = persp / (persp + R); // perspective shrink of a front card
    // Height normally follows the width by a fixed aspect, BUT is capped on
    // short viewports so the ring's top stays clear of the title text. This
    // keeps the carousel edge-to-edge and just makes the cylinder shallow
    // (short cards) when the window is short and wide, instead of shrinking the
    // whole ring inward.
    const titleClear = mobile ? 150 : 240; // px the card tops must stay below
    const maxProjHalf = Math.max(24, vh * 0.5 - titleClear);
    const maxCardH = (2 * maxProjHalf) / scale;
    const cardH = Math.min(
      Math.round(cardW / (mobile ? ASPECT.mobile : ASPECT.desktop)),
      Math.round(maxCardH),
    );
    // Progressive caption degradation as the card gets short (wide/short views).
    // CSS keys off this: '' normal → 'tight' (thinner mat) → 'cn' (drop the
    // English line) → 'none' (drop all caption text), so it never overflows.
    stage.dataset.squish =
      cardH >= 210 ? '' : cardH >= 165 ? 'tight' : cardH >= 125 ? 'cn' : 'none';
    stage.style.perspective = `${Math.round(persp)}px`;
    for (const { el } of mainCards) {
      el.style.width = `${cardW}px`;
      el.style.height = `${cardH}px`;
    }
    for (const { el } of floorCards) {
      el.style.width = `${cardW}px`;
      el.style.height = `${cardH}px`;
    }
    glowDirty = true;
  }

  // The coral floor glow is a single radial gradient shaped to the floor line
  // (the arc of the cards' bottom edges). We MEASURE that arc from the live card
  // rects — the projection maths is fiddly, but the rendered bottoms are exact —
  // fit an ellipse to it, and paint one smooth gradient. No per-card seams, and
  // re-measuring on resize keeps it reactive. The arc is independent of the
  // ring's rotation, so a single sample after layout is enough.
  function updateFloorGlow() {
    if (!floorTint) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = vw / 2;
    const pts = mainCards
      .map(({ el }) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.bottom, w: r.width };
      })
      .filter(
        (p) =>
          p.w > 50 &&
          p.w < vw * 1.3 &&
          p.x > -vw * 0.15 &&
          p.x < vw * 1.15 &&
          p.y > vh * 0.3 &&
          p.y < vh * 1.2,
      );
    if (pts.length < 3) return; // hero not on screen — try again next measure
    // frontY: the lowest (highest-on-screen) point, near the centre.
    let frontY = Number.POSITIVE_INFINITY;
    for (const p of pts)
      if (Math.abs(p.x - cx) < vw * 0.16 && p.y < frontY) frontY = p.y;
    if (!Number.isFinite(frontY)) frontY = Math.min(...pts.map((p) => p.y));
    // curvature from the point farthest from centre: dy = k·dx².
    let far = null;
    let farDx = 0;
    for (const p of pts) {
      const dx = Math.abs(p.x - cx);
      if (dx > farDx) {
        farDx = dx;
        far = p;
      }
    }
    let k = 0.0003;
    if (far && farDx > 60 && far.y > frontY) k = (far.y - frontY) / (farDx * farDx);
    // Ellipse whose top arc has that curvature: k = RY / (2·RX²).
    const RX = vw;
    const RY = Math.max(180, k * 2 * RX * RX);
    const CY = frontY + RY; // ellipse top sits on the floor line
    // Radius 100% = the floor line. Below it (smaller radius) is the reflection;
    // above it (>100%) are the cards. Coral sits just inside the top, the image
    // ghost shows through the semi-transparent band, and it fades to the floor
    // colour lower down. The fill reads from --room-reflection (see tokens.css)
    // rather than a literal so the glow goes dark with the rest of the room.
    // --room-reflection is pinned to equal --room-floor-far exactly — this is
    // the mirror's own fill, painted here in JS, while --room-floor-far paints
    // the physical floor in index.astro's CSS; any divergence between the two
    // would show as a seam where the mirror meets the floor. color-mix()
    // reproduces the original literals' alpha fades against that token without
    // needing unwrapped RGB channels.
    //
    // The 97% coral stop below is the one part of this fill still a literal.
    // It was left unconverted when the rest of this gradient was themed
    // (see the "Theme the home gallery room" commit) — this is exactly the
    // spot a raw literal in a runtime-painted gradient could hide from every
    // prior automated check. Verified by rendering both themes (guard-
    // hardening task): it reads as a deliberate warm spotlight ring under
    // the figure in both, not a leftover near-white disc, so it's left as a
    // literal and annotated rather than guessed into a token value with no
    // designer sign-off.
    floorTint.style.background =
      `radial-gradient(ellipse ${Math.round(RX)}px ${Math.round(RY)}px at ${Math.round(cx)}px ${Math.round(CY)}px,` +
      'var(--room-reflection) 0%,var(--room-reflection) 86%,' +
      'color-mix(in srgb, var(--room-reflection) 50%, transparent) 92%,' +
      'rgba(206,116,109,0.52) 97%,' + // fixed: deliberate coral highlight, constant across themes (see comment above)
      'color-mix(in srgb, var(--room-floor-near) 65%, transparent) 100%,transparent 103%)';
  }

  function place(list) {
    for (let i = 0; i < list.length; i++) {
      const { el, base } = list[i];
      const th = norm(rotation + base);
      const c = Math.cos((th * Math.PI) / 180);
      // No fade / no cutoff: cards run off the edges (stage clips), backface
      // hides the back half.
      el.style.pointerEvents = Math.abs(th) < 68 ? 'auto' : 'none';
      // grayscale lives on the media (CSS) so hover can colourise it; the card
      // only carries the depth-brightness.
      el.style.filter = `brightness(${(0.82 + 0.18 * Math.max(0, c)).toFixed(3)})`;
      el.style.transform = `translate(-50%,-50%) rotateY(${th.toFixed(2)}deg) translateZ(${-R}px)`;
    }
  }
  // Mirror the ring directly beneath itself for the glass-floor reflection.
  function placeFloor(list) {
    for (let i = 0; i < list.length; i++) {
      const { el, base } = list[i];
      const th = norm(rotation + base);
      // No brightness filter: the reflection paints only via the CSS ::after
      // gradient (coral + white gap + fade), which must stay identical on every
      // clone so the panels tile seamlessly. A per-card filter would tint the
      // fill slightly differently and bring the seams back. The panels sit
      // edge-to-edge (no scaleX overlap) — overlapping stacked two coral
      // gradients and darkened the red at the seams.
      el.style.transform = `translate(-50%,-50%) rotateY(${th.toFixed(2)}deg) translateZ(${-R}px) translateY(100%) scaleY(-1)`;
    }
  }
  function layout() {
    place(mainCards);
    if (floorCards.length) placeFloor(floorCards);
  }

  // Drag-to-scrub with LAZY pointer capture (so a plain click still hits the <a>).
  let down = false;
  let movedDrag = false;
  let x0 = 0;
  let lastX = 0;
  stage.style.cursor = 'grab';
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = true;
    movedDrag = false;
    x0 = e.clientX;
    lastX = e.clientX;
    stage.style.cursor = 'grabbing';
    if (e.pointerType !== 'touch') e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    if (!movedDrag && Math.abs(e.clientX - x0) > 5) {
      movedDrag = true;
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {}
    }
    if (movedDrag) rotation = (rotation - dx * 0.15) % 360;
  });
  const endDrag = () => {
    if (!down) return;
    down = false;
    stage.style.cursor = 'grab';
    if (movedDrag) {
      stage.addEventListener(
        'click',
        (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
        },
        { capture: true, once: true },
      );
    }
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // Hover-to-slow — ONLY over a real ring card, never the whole hero.
  stage.addEventListener('pointermove', (e) => {
    if (down) return;
    hovering = !!(e.target.closest && e.target.closest('#cyl-ring a[href]'));
  });
  stage.addEventListener('pointerleave', () => {
    hovering = false;
  });

  // Prev / next step one card.
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  if (prevBtn)
    prevBtn.addEventListener('click', () => {
      rotation = (rotation - STEP) % 360;
    });
  if (nextBtn)
    nextBtn.addEventListener('click', () => {
      rotation = (rotation + STEP) % 360;
    });

  // While the mobile menu is open, a full-screen translucent overlay + the
  // nav's backdrop-blur sit over the hero; letting the ring keep re-transforming
  // underneath forces a per-frame re-raster that flickers through them. Freeze
  // the ring (skip both the advance and the layout write) until it closes.
  const mobileMenu = document.getElementById('mobile-menu');
  const menuOpen = () =>
    !!mobileMenu && mobileMenu.classList.contains('translate-x-0');

  let last = 0;
  function frame(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    // Also freeze while the hero is faded out (side carousel revealed) — no
    // point animating a ring nobody can see.
    if (menuOpen() || stage.style.opacity === '0') {
      requestAnimationFrame(frame);
      return;
    }
    if (!reduce && !down)
      rotation = advance(rotation, dt, hovering ? HOVER_FACTOR : 1) % 360;
    layout();
    // Recompute the floor glow once after each (re)measure, now that the cards
    // are laid out this frame so their rects are valid.
    if (glowDirty) {
      updateFloorGlow();
      glowDirty = false;
    }
    requestAnimationFrame(frame);
  }

  // Test seam (observability only; no behavior change).
  window.__cyl = { advance, state: () => ({ rotation, hovering }) };

  window.addEventListener('resize', measure);
  window.addEventListener('load', () => {
    measure();
    seekStills(ring);
    if (floorRing) seekStills(floorRing);
  });
  measure();
  requestAnimationFrame(frame);
}
