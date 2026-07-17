/* ─────────────────────────────────────────────────────────────
   Drifting image stream — top-left → bottom-right
   Each .float-el has data-vx (rightward) and data-vy (downward).
   Both are positive so all images travel the same diagonal.
   Speed differences create a parallax depth illusion.
   On exit (right edge OR bottom edge), re-enter from the
   top-left quadrant at a fresh random position.
───────────────────────────────────────────────────────────── */
(function () {
  var bg = document.getElementById('art-bg');
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

    /* Spread images across the full viewport so the screen
       looks populated from the very first frame. */
    states.forEach(function (s) {
      s.x = Math.random() * W;
      s.y = Math.random() * H;
      s.el.style.transform =
        'translate3d(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px,0)';
    });

    /* Stagger image fade-in */
    bg.querySelectorAll('.float-img').forEach(function (img, i) {
      setTimeout(
        function () {
          img.style.opacity = '1';
        },
        80 + 160 * i,
      );
    });

    /* "Art" heading delayed entry */
    setTimeout(function () {
      var ct = document.getElementById('hero-center-text');
      if (ct) {
        ct.style.opacity = '1';
        ct.style.transform = 'translateY(0)';
      }
    }, 250);
  }

  /* Wait for images to load so offsetHeight reflects natural size */
  var total = 0;
  var loaded = 0;
  bg.querySelectorAll('.float-img').forEach(function (img) {
    total++;
    function onDone() {
      if (++loaded >= total) init();
    }
    if (img.complete && img.naturalHeight) {
      onDone();
    } else {
      img.addEventListener('load', onDone);
      img.addEventListener('error', onDone);
    }
  });
  setTimeout(function () {
    if (!inited) init();
  }, 600);

  /* ── Animation loop ── */
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

      var elW = s.el.offsetWidth || 120;
      var elH = s.el.offsetHeight || 120;

      /* When the image's left edge passes the right side of the
         screen, OR its top edge passes the bottom, re-enter from
         a random position in the top-left quadrant. */
      if (s.x > W + elW || s.y > H + elH) {
        /* Re-enter: left half of width, top half of height */
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

/* ─────────────────────────────────────────────────────────────
   Scroll-reveal for below-hero components
───────────────────────────────────────────────────────────── */
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
  var overlay = document.getElementById('art-dark-overlay');
  if (!overlay) return;
  var ticking = false;
  function update() {
    var s = window.scrollY || window.pageYOffset;
    var vh = window.innerHeight;
    // Base opacity 0.22 at hero; deepens to 0.62 from 60vh–140vh scroll
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
