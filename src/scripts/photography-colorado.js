(function () {
  /* ── Gallery page map ── */
  var galleryPages = {
    'twelve-views': {
      page: '/photography/colorado/twelve-views',
      images: (function () {
        var a = [];
        for (var i = 1; i <= 12; i++)
          a.push(
            '/assets/images/Colorado/Twelve Views of Pikes Peak/TYPOLOGY-' +
              String(i).padStart(2, '0') +
              '.jpg',
          );
        return a;
      })(),
    },
    'rock-ledge': {
      page: '/photography/colorado/rock-ledge',
      images: (function () {
        var a = [];
        for (var i = 1; i <= 11; i++)
          a.push(
            '/assets/images/Colorado/Rock Ledge Ranch/ROCK_LEDGE-' +
              String(i).padStart(2, '0') +
              '.jpg',
          );
        return a;
      })(),
    },
    golf: {
      page: '/photography/colorado/golf',
      images: (function () {
        var a = [];
        for (var i = 1; i <= 11; i++)
          a.push(
            '/assets/images/Colorado/Golf/GOLF-' +
              String(i).padStart(2, '0') +
              '.jpg',
          );
        return a;
      })(),
    },
    cornfield: {
      page: '/photography/colorado/cornfield',
      images: (function () {
        var a = [];
        for (var i = 1; i <= 8; i++)
          a.push(
            '/assets/images/Colorado/Cornfield/CORNFIELD-' +
              String(i).padStart(2, '0') +
              '.jpg',
          );
        return a;
      })(),
    },
  };

  /* ── Accordion ── */
  document.querySelectorAll('.acc-row').forEach(function (row) {
    var panels = row.querySelectorAll('.acc-panel');
    var heightTimer = null;

    function updateHeight() {
      var active = row.querySelector(
        '.acc-panel.acc-active:not(.acc-see-more)',
      );
      if (!active) return;
      var img = active.querySelector('img');
      if (!img || !img.naturalWidth) return;
      var activeW = row.offsetWidth - (panels.length - 1) * 60;
      if (activeW <= 0) return;
      row.style.height =
        Math.round((activeW * img.naturalHeight) / img.naturalWidth) + 'px';
    }

    panels.forEach(function (panel) {
      var img = panel.querySelector('img');
      if (img && panel.classList.contains('acc-active')) {
        if (img.complete && img.naturalWidth) updateHeight();
        else img.addEventListener('load', updateHeight);
      }
      panel.addEventListener('mouseenter', function () {
        panels.forEach(function (p) {
          p.classList.remove('acc-active');
        });
        panel.classList.add('acc-active');
        clearTimeout(heightTimer);
        heightTimer = setTimeout(updateHeight, 650);
      });
      if (!panel.classList.contains('acc-see-more')) {
        panel.addEventListener('click', function () {
          var key = panel.closest('.accordion-section').dataset.section;
          var g = galleryPages[key];
          var src = panel.querySelector('img').getAttribute('src');
          var idx = g.images.indexOf(src);
          window.location.href = g.page + '?open=' + (idx < 0 ? 0 : idx);
        });
      }
    });

    var seeMore = row.querySelector('.acc-see-more');
    if (seeMore) {
      seeMore.addEventListener('click', function () {
        var key = seeMore.closest('.accordion-section').dataset.section;
        window.location.href = galleryPages[key].page;
      });
    }
  });

  /* ── Scroll-scrubbed video ── */
  var video = document.getElementById('scrubVideo');
  var progressEl = document.getElementById('progress');
  var hero = document.getElementById('hero');
  var heroImg = document.getElementById('heroImg');
  var heroInner = document.getElementById('heroInner');
  var heroLoaded = false;
  window.addEventListener('load', function () {
    heroLoaded = true;
    setTimeout(function () {
      if (heroInner) heroInner.style.opacity = '1';
    }, 250);
  });
  var scrollCue = document.getElementById('scrollCue');
  var duration = 0,
    targetTime = 0,
    currentTime = 0,
    seeking = false;
  var reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;

  video.addEventListener('loadedmetadata', function () {
    duration = video.duration || 0;
    update();
    requestAnimationFrame(tick);
  });
  video.addEventListener('loadeddata', function () {
    video.pause();
  });
  video.addEventListener('seeked', function () {
    seeking = false;
  });

  function scrollFraction() {
    var s = document.documentElement.scrollHeight - window.innerHeight;
    return s <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / s));
  }

  function heroTransition() {
    var h = hero.offsetHeight || window.innerHeight;
    var t = Math.min(1, Math.max(0, window.scrollY / h));
    heroImg.style.opacity = (1 - t * 1.15).toFixed(3);
    heroImg.style.transform = 'scale(' + (1.14 + t * 0.22).toFixed(3) + ')';
    heroImg.style.filter = 'blur(' + (t * 14).toFixed(1) + 'px)';
    if (heroLoaded) heroInner.style.opacity = (1 - t * 1.6).toFixed(3);
    heroInner.style.transform = 'translateY(' + (-t * 80).toFixed(1) + 'px)';
    if (scrollCue) scrollCue.style.opacity = (1 - t * 3).toFixed(3);
    hero.style.pointerEvents = t > 0.98 ? 'none' : 'auto';
  }

  /* ── Accordion raindrop animation ── */
  var accSections = Array.from(document.querySelectorAll('.accordion-section'));

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function updateAccordions() {
    var vh = window.innerHeight;
    for (var i = 0; i < accSections.length; i++) {
      var sec = accSections[i];
      var r = sec.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      if (reduceMotion) {
        sec.style.opacity = '1';
        sec.style.transform = '';
        continue;
      }
      var center = r.top + r.height / 2;
      var d = center / vh - 0.5 + 0.06;
      var a = Math.abs(d);
      var op = a <= 0.25 ? 1 : clamp(1 - (a - 0.25) / 0.5, 0, 1);
      var drift = -d * 55;
      sec.style.opacity = op.toFixed(3);
      sec.style.transform = 'translateY(' + drift.toFixed(1) + 'px)';
    }
  }

  function update() {
    var p = scrollFraction();
    if (duration > 0) targetTime = p * duration;
    progressEl.style.width = (p * 100).toFixed(2) + '%';
    heroTransition();
    updateAccordions();
  }

  function tick() {
    if (duration > 0) {
      currentTime += (targetTime - currentTime) * 0.12;
      if (!seeking && Math.abs(currentTime - video.currentTime) > 0.01) {
        seeking = true;
        if (typeof video.fastSeek === 'function') video.fastSeek(currentTime);
        else video.currentTime = currentTime;
      }
    }
    updateAccordions();
    requestAnimationFrame(tick);
  }

  /* ── Collection head fade-in ── */
  var headObs = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) e.target.classList.add('in-view');
      });
    },
    { threshold: 0.12 },
  );
  document.querySelectorAll('.collection-head').forEach(function (h) {
    headObs.observe(h);
  });

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', function () {
    accSections = Array.from(document.querySelectorAll('.accordion-section'));
    update();
  });

  if (video.readyState >= 1) {
    duration = video.duration || 0;
    requestAnimationFrame(tick);
  }
  update();

  /* ── Pull hero flush behind nav ── */
  function setHeroFlush() {
    var navH = document.querySelector('nav').offsetHeight;
    hero.style.marginTop = '-' + navH + 'px';
  }
  setHeroFlush();
  window.addEventListener('resize', setHeroFlush);

  window.onNavThemeChange = function () {
    setHeroFlush();
    update();
  };

  /* ── Mobile swipe gallery ── */
  if (window.innerWidth <= 640) {
    document.querySelectorAll('.accordion-section').forEach(function (section) {
      var key = section.dataset.section;
      var g = galleryPages[key];
      if (!g) return;
      var row = section.querySelector('.acc-row');
      var panels = Array.from(
        row.querySelectorAll('.acc-panel:not(.acc-see-more)'),
      );
      var count = panels.length;
      var controls = document.createElement('div');
      controls.className = 'acc-mobile-controls';
      var dotsWrap = document.createElement('div');
      dotsWrap.className = 'acc-dots';
      var dots = [];
      for (var di = 0; di < count; di++) {
        (function (idx) {
          var dot = document.createElement('button');
          dot.className = 'acc-dot' + (idx === 0 ? ' acc-dot-active' : '');
          dot.setAttribute('aria-label', 'Photo ' + (idx + 1) + ' of ' + count);
          dot.addEventListener('click', function () {
            row.scrollTo({ left: row.offsetWidth * idx, behavior: 'smooth' });
          });
          dotsWrap.appendChild(dot);
          dots.push(dot);
        })(di);
      }
      var showMoreBtn = document.createElement('button');
      showMoreBtn.className = 'acc-show-more-btn';
      showMoreBtn.textContent = 'Show More';
      showMoreBtn.addEventListener('click', function () {
        window.location.href = g.page;
      });
      controls.appendChild(dotsWrap);
      controls.appendChild(showMoreBtn);
      section.appendChild(controls);
      row.addEventListener(
        'scroll',
        function () {
          var idx = Math.round(row.scrollLeft / Math.max(1, row.offsetWidth));
          dots.forEach(function (d, i) {
            d.classList.toggle('acc-dot-active', i === idx);
          });
        },
        { passive: true },
      );
    });
  }
})();
