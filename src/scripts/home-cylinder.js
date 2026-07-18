import { seekStills } from '@scripts/carousel-stills.js';

const SPEED_DEG_PER_SEC = 8; // slow, readable
const HOVER_FACTOR = 0.28;
const DUP = 2; // duplicate the 10 works to fill the ring

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

  const mainCards = Array.from(ring.children).map((el, i) => ({
    el,
    base: i * STEP,
  }));

  let R = 735;
  let rotation = 0;
  let hovering = false;

  function measure() {
    // Scale the cylinder to the viewport so the wall always fills the width:
    // edge-on cards sit at screen-x ≈ ±R, so R ≈ half the viewport width.
    const vw = window.innerWidth;
    R = vw * 0.54;
    const cardW = 2 * R * Math.sin(Math.PI / N); // chord => exact tiling
    stage.style.perspective = `${Math.round(vw * 0.62)}px`;
    for (const { el } of mainCards) el.style.width = `${cardW}px`;
  }

  function place(list) {
    for (let i = 0; i < list.length; i++) {
      const { el, base } = list[i];
      const th = norm(rotation + base);
      const c = Math.cos((th * Math.PI) / 180);
      // No fade / no cutoff: cards run off the edges (stage clips), backface
      // hides the back half.
      el.style.pointerEvents = Math.abs(th) < 68 ? 'auto' : 'none';
      el.style.filter = `grayscale(1) brightness(${(0.82 + 0.18 * Math.max(0, c)).toFixed(3)})`;
      el.style.transform = `translate(-50%,-50%) rotateY(${th.toFixed(2)}deg) translateZ(${-R}px)`;
    }
  }
  function layout() {
    place(mainCards);
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

  let last = 0;
  function frame(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    if (!reduce && !down)
      rotation = advance(rotation, dt, hovering ? HOVER_FACTOR : 1) % 360;
    layout();
    requestAnimationFrame(frame);
  }

  // Test seam (observability only; no behavior change).
  window.__cyl = { advance, state: () => ({ rotation, hovering }) };

  window.addEventListener('resize', measure);
  window.addEventListener('load', () => {
    measure();
    seekStills(ring);
  });
  measure();
  requestAnimationFrame(frame);
}
