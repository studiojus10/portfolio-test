/* ── Floating wireframe animation ── */
(function () {
  var bg = document.getElementById('projects-bg');
  if (!bg) return;

  var floatEls = Array.from(bg.querySelectorAll('.float-el'));
  var states = floatEls.map(function (el) {
    return {
      el: el,
      vx: parseFloat(el.getAttribute('data-vx')) || 0.3,
      vy: parseFloat(el.getAttribute('data-vy')) || 0.5,
      x: 0,
      y: 0,
    };
  });

  var inited = false;

  function init() {
    if (inited) return;
    inited = true;
    var W = window.innerWidth;
    var H = window.innerHeight;
    states.forEach(function (s) {
      s.x = Math.random() * W;
      s.y = Math.random() * H;
      s.el.style.transform =
        'translate3d(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px,0)';
    });
    setTimeout(function () {
      var ct = document.getElementById('hero-center-text');
      if (ct) {
        ct.style.opacity = '1';
        ct.style.transform = 'translateY(0)';
      }
    }, 250);
  }

  setTimeout(function () {
    if (!inited) init();
  }, 600);
  init();

  function tick() {
    if (!inited) {
      requestAnimationFrame(tick);
      return;
    }
    var W = window.innerWidth;
    var H = window.innerHeight;
    states.forEach(function (s) {
      s.x += s.vx;
      s.y += s.vy;
      var elW = s.el.offsetWidth || 100;
      var elH = s.el.offsetHeight || 100;
      if (s.x > W + elW || s.y > H + elH) {
        s.x = Math.random() * W * 0.5 - elW;
        s.y = Math.random() * H * 0.5 - elH;
      }
      s.el.style.transform =
        'translate3d(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px,0)';
    });
    requestAnimationFrame(tick);
  }
  tick();
})();

/* ── Scroll-reveal ── */
(function () {
  if (!window.IntersectionObserver) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.reveal-item').forEach(function (el) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }
  var obs = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 },
  );
  document.querySelectorAll('.reveal-item').forEach(function (el) {
    obs.observe(el);
  });
})();

/* ── Background darkening on scroll ── */
(function () {
  var overlay = document.getElementById('projects-dark-overlay');
  if (!overlay) return;
  var ticking = false;
  function update() {
    var s = window.scrollY || window.pageYOffset;
    var vh = window.innerHeight;
    var p = Math.max(0, Math.min(1, (s - vh * 0.6) / (vh * 0.8)));
    overlay.style.opacity = (0.22 + p * 0.4).toFixed(3);
  }
  window.addEventListener(
    'scroll',
    function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          update();
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true },
  );
  update();
})();

/* ── Scroll-driven card spotlight — each card scales to 70% at center ── */
(function () {
  var cards = document.querySelectorAll('.project-card');
  if (!cards.length) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    cards.forEach(function (c) {
      c.style.opacity = '1';
      c.style.transform = 'scale(1)';
    });
    return;
  }

  function update() {
    var vh = window.innerHeight;
    var vc = vh / 2;
    cards.forEach(function (card) {
      var rect = card.getBoundingClientRect();
      /* If completely off-screen keep it invisible */
      if (rect.bottom < -80 || rect.top > vh + 80) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.88)';
        return;
      }
      var cardCenter = rect.top + rect.height / 2;
      var distance = Math.abs(cardCenter - vc);
      var maxDist = vh * 0.72;
      var t = Math.max(0, Math.min(1, 1 - distance / maxDist));
      card.style.transform = 'scale(' + (0.88 + 0.12 * t).toFixed(4) + ')';
      card.style.opacity = (0.45 + 0.55 * t).toFixed(4);
    });
  }

  var ticking = false;
  window.addEventListener(
    'scroll',
    function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          update();
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true },
  );

  /* Run on load and after a short delay to catch layout settling */
  update();
  setTimeout(update, 300);
})();
