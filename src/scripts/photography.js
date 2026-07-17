(function () {
  'use strict';

  var series = [
    {
      id: 'thumb-colorado',
      src: '/assets/images/Colorado/Twelve Views of Pikes Peak/TYPOLOGY-01.jpg',
    },
    {
      id: 'thumb-arizona',
      src: '/assets/images/Arizona/Travels/ARIZONA-01.jpg',
    },
    {
      id: 'thumb-washington',
      src: '/assets/images/Washington/Seattle/SEATTLE-01.jpg',
    },
    {
      id: 'thumb-nature',
      src: '/assets/images/Nature/Landscapes/NATURE-1.jpg',
    },
    { id: 'thumb-film', src: '/assets/images/Film/Europe/FILM_MISC-03.jpg' },
    {
      id: 'thumb-europe',
      src: '/assets/images/Europe/France 2019 Protests/PROTEST_1.jpg',
    },
  ];

  series.forEach(function (s) {
    var img = document.getElementById(s.id);
    if (img) img.src = s.src;
  });
})();

(function () {
  var SECTION_HEIGHT = 1500;

  var heroCandidates = [
    '/assets/images/Colorado/Twelve Views of Pikes Peak/TYPOLOGY-01.jpg',
    '/assets/images/Arizona/Travels/ARIZONA-01.jpg',
    '/assets/images/Nature/Landscapes/NATURE-1.jpg',
    '/assets/images/Washington/Seattle/SEATTLE-01.jpg',
    '/assets/images/Colorado/Golf/GOLF-01.jpg',
    '/assets/images/Nature/Landscapes/NATURE-3.jpg',
    '/assets/images/Film/Europe/FILM_MISC-03.jpg',
    '/assets/images/Colorado/Cornfield/CORNFIELD-01.jpg',
    '/assets/images/Europe/France 2019 Protests/PROTEST_1.jpg',
  ];

  var centerImg = document.getElementById('center-img');
  var heroTitle = document.getElementById('photo-hero-title');
  var pi = [
    document.getElementById('pi-1'),
    document.getElementById('pi-2'),
    document.getElementById('pi-3'),
    document.getElementById('pi-4'),
  ];

  var piParams = [
    { start: 100, end: 200 },
    { start: 200, end: -250 },
    { start: 100, end: 200 },
    { start: 50, end: -500 },
  ];

  var piDocTops = [0, 0, 0, 0];

  var filtered = [];
  var pending = heroCandidates.length;

  function buildHero() {
    if (!filtered.length) return;
    if (centerImg)
      centerImg.style.backgroundImage = "url('" + filtered[0] + "')";
    pi.forEach(function (img, i) {
      var src = filtered[i + 1];
      if (img && src) {
        img.style.opacity = '0';
        img.src = src;
        img.style.display = 'block';
      }
    });
    // Capture natural document positions before any transforms are applied
    var s0 = window.scrollY || window.pageYOffset;
    pi.forEach(function (img, i) {
      if (img) piDocTops[i] = img.getBoundingClientRect().top + s0;
    });
    updateHero();
  }

  heroCandidates.forEach(function (src) {
    var probe = new Image();
    probe.onload = function () {
      if (probe.naturalWidth >= probe.naturalHeight) filtered.push(src);
      if (--pending === 0) buildHero();
    };
    probe.onerror = function () {
      if (--pending === 0) buildHero();
    };
    probe.src = src;
  });

  function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  function updateParallaxImg(img, docTop, start, end) {
    if (!img || img.style.display === 'none' || !docTop) return;
    var s = window.scrollY || window.pageYOffset;
    var vh = window.innerHeight;

    // Hidden at s=0; fade in on first scroll
    var fadeIn = Math.min(1, Math.max(0, (s - 20) / (vh * 0.18)));

    // Fade out before white header reaches mid-screen (SECTION_HEIGHT - vh/2)
    var exitAt = SECTION_HEIGHT - vh * 0.5;
    var exitFrom = exitAt - vh * 0.35;
    var fadeOut =
      s < exitFrom ? 1 : Math.max(0, 1 - (s - exitFrom) / (exitAt - exitFrom));

    var alpha = Math.min(fadeIn, fadeOut);
    if (alpha <= 0) {
      img.style.opacity = '0';
      return;
    }

    // Parallax motion using precomputed natural document position
    var rectTop = docTop - s;
    var h = img.offsetHeight || 300;
    var p = Math.max(0, Math.min(1, (vh - rectTop) / (h + vh)));
    var y = lerp(start, end, p);
    var fp = Math.max(0, Math.min(1, (p - 0.75) / 0.25));

    img.style.transform =
      'translateY(' + y + 'px) scale(' + (1 - fp * 0.15) + ')';
    img.style.opacity = String(alpha * (1 - fp));
  }

  var heroTick = false;

  function updateHero() {
    var s = window.scrollY || window.pageYOffset;

    if (centerImg) {
      var p = Math.min(1, s / SECTION_HEIGHT);
      centerImg.style.transform = 'scale(' + lerp(0.5, 1.15, p) + ')';
      centerImg.style.backgroundSize = lerp(170, 100, p) + '%';
      centerImg.style.filter =
        'brightness(' +
        lerp(1, 0.5, p) +
        ') saturate(' +
        lerp(0.85, 1, p) +
        ')';
    }

    if (heroTitle) {
      var p2 = Math.min(1, s / SECTION_HEIGHT);
      heroTitle.style.transform = 'translateY(' + p2 * 40 + 'vh)';
      heroTitle.style.opacity = Math.max(
        0,
        1 - Math.max(0, (p2 - 0.65) / 0.25),
      );
    }

    pi.forEach(function (img, i) {
      updateParallaxImg(img, piDocTops[i], piParams[i].start, piParams[i].end);
    });
  }

  window.addEventListener(
    'scroll',
    function () {
      if (!heroTick) {
        requestAnimationFrame(function () {
          updateHero();
          heroTick = false;
        });
        heroTick = true;
      }
    },
    { passive: true },
  );

  window.addEventListener('load', function () {
    updateHero();
    var ci = document.getElementById('center-img');
    var ht = document.getElementById('photo-hero-title');
    if (ci) ci.style.opacity = '1';
    if (ht) ht.style.opacity = '1';
  });
})();

(function () {
  if (!window.IntersectionObserver) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cards = document.querySelectorAll('.series-card');
  if (!cards.length) return;

  cards.forEach(function (card) {
    if (reduced) return;
    card.style.opacity = '0';
    card.style.transform = 'translateY(60px)';
    card.style.transition =
      'opacity 1s ease, transform 1s cubic-bezier(0.2, 0, 0.2, 1), background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease';
  });

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

  cards.forEach(function (card) {
    obs.observe(card);
  });
})();
