// ── Infinite Carousel ─────────────────────────────────────────────
(function () {
  const track = document.getElementById('carousel-track');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  if (!track) return;

  const GAP = 32;   // matches gap-8 (32px)
  const SPEED = 0.5; // px per rAF tick (~30px/s at 60fps)

  let offset = 0;
  let halfWidth = 0;
  let paused = false;

  function measureHalf() {
    const items = track.children;
    const half = Math.floor(items.length / 2);
    let w = 0;
    for (let i = 0; i < half; i++) {
      w += items[i].getBoundingClientRect().width + GAP;
    }
    halfWidth = w;
  }

  function tick() {
    if (!paused && halfWidth > 0) {
      offset += SPEED;
      if (offset >= halfWidth) offset -= halfWidth;
      track.style.transform = `translateX(-${offset}px)`;
    }
    requestAnimationFrame(tick);
  }

  function jump(delta) {
    if (!halfWidth) return;
    offset = ((offset + delta) % halfWidth + halfWidth) % halfWidth;
    track.style.transform = `translateX(-${offset}px)`;
  }

  window.addEventListener('load', () => {
    measureHalf();
    requestAnimationFrame(tick);
  });

  window.addEventListener('resize', measureHalf);

  if (prevBtn) prevBtn.addEventListener('click', () => {
    jump(-(track.children[0].getBoundingClientRect().width + GAP));
  });

  if (nextBtn) nextBtn.addEventListener('click', () => {
    jump(track.children[0].getBoundingClientRect().width + GAP);
  });

  track.addEventListener('mouseenter', () => { paused = true; });
  track.addEventListener('mouseleave', () => { paused = false; });
})();
