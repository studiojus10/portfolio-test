/* ── Image lightbox ── */
(function () {
  var lb = document.getElementById('lightbox');
  var lbImg = document.getElementById('lightbox-img');
  var lbClose = document.getElementById('lightbox-close');

  document.querySelectorAll('.asset-img').forEach(function (img) {
    img.addEventListener('click', function () {
      lbImg.src = img.src;
      lbImg.alt = img.alt;
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  });

  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    lbImg.src = '';
  }

  lbClose.addEventListener('click', close);
  lb.addEventListener('click', function (e) {
    if (e.target === lb) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();

/* ── Hero scroll: expand clip-path from hero bounds to full viewport, then fade ── */
(function () {
  var heroBg = document.getElementById('hero-visual');
  var target = document.getElementById('platform-demos');
  if (!heroBg || !target) return;

  var ticking = false;

  function update() {
    var scrollY = window.scrollY || window.pageYOffset;
    var targetTop = target.getBoundingClientRect().top + scrollY;
    var progress = Math.min(1, Math.max(0, scrollY / targetTop));

    heroBg.style.clipPath = 'none';
    heroBg.style.opacity = (1 - progress).toFixed(4);
    ticking = false;
  }

  window.addEventListener(
    'scroll',
    function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    },
    { passive: true },
  );

  update();
})();
