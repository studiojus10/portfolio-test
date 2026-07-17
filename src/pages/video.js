import '../lib/bootstrap.js';

(function () {
  function equalizeCardHeights() {
    var cards = Array.from(document.querySelectorAll('.video-card'));
    cards.forEach(function (c) {
      c.style.height = '';
    });

    if (window.innerWidth < 768) return;

    var portrait = cards.find(function (c) {
      var h2 = c.querySelector('h2');
      return h2 && h2.textContent.indexOf('Portrait') !== -1;
    });
    if (!portrait) return;

    var h = portrait.offsetHeight;
    cards.forEach(function (c) {
      c.style.height = h + 'px';
    });
  }

  function run() {
    setTimeout(equalizeCardHeights, 100);
  }
  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run);
  }
  window.addEventListener('resize', equalizeCardHeights);
})();

(function () {
  if (!window.IntersectionObserver) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cards = document.querySelectorAll('.video-card');
  if (!cards.length || reduced) return;
  cards.forEach(function (card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(60px)';
    card.style.transition =
      'opacity 1s ease, transform 1s cubic-bezier(0.2, 0, 0.2, 1)';
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

(function () {
  var bgVideo = document.getElementById('hero-video');

  document.querySelectorAll('.card-thumb-video').forEach(function (vid) {
    vid.addEventListener('loadedmetadata', function () {
      vid.currentTime = 5;
    });
    if (vid.readyState >= 1) vid.currentTime = 5;

    var card = vid.closest('.video-card');
    card.addEventListener('mouseenter', function () {
      if (bgVideo) bgVideo.pause();
      vid.currentTime = 5;
      vid.play();
    });
    card.addEventListener('mouseleave', function () {
      vid.pause();
      vid.currentTime = 5;
      if (bgVideo) bgVideo.play();
    });
  });
})();

(function () {
  var video = document.getElementById('hero-video');
  var overlay = document.getElementById('hero-overlay');
  var heroContent = document.getElementById('hero-content');

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  // Scale needed to go from contain → cover for this video in the viewport
  var scaleCover = 1;
  function computeScaleCover() {
    if (!video || !video.videoWidth) return;
    // At width:100% the video renders at (vw × vw/AR) px
    // To cover the full vh we need to scale by vh / (vw/AR) = vh·AR/vw
    var ratio =
      (window.innerHeight * video.videoWidth) /
      (window.innerWidth * video.videoHeight);
    scaleCover = Math.max(1, ratio);
  }
  if (video) {
    video.addEventListener('loadedmetadata', computeScaleCover);
    window.addEventListener('resize', computeScaleCover);
  }

  // Fade video in shortly after load
  function fadeInVideo() {
    if (!video) return;
    video.style.transition = 'opacity 1.6s ease';
    video.style.opacity = '1';
  }

  // Position "Video" title just below the actual video frame, then fade it in
  function positionTitle() {
    var title = document.getElementById('video-load-title');
    if (!title || !video || !video.videoWidth || !video.videoHeight) return;

    // The video renders at width:100vw, height proportional to its AR
    var ar = video.videoWidth / video.videoHeight;
    var renderedH = window.innerWidth / ar;
    // Video is vertically centred in the 100vh container
    var videoBottom = (window.innerHeight + renderedH) / 2;
    // Leave a small gap below the frame; clamp so it stays in view
    var topPos =
      Math.min(videoBottom + 16, window.innerHeight - 120) -
      window.innerHeight * 0.1;

    title.style.top = topPos + 'px';
  }

  function fadeInTitle() {
    positionTitle();
    var title = document.getElementById('video-load-title');
    if (!title) return;
    // Set the 3-second transition only when we're ready to fade in,
    // so the scroll handler can override it with 'none' later.
    title.style.transition = 'opacity 3s ease';
    title.style.opacity = '1';
  }

  if (video) {
    video.addEventListener('loadedmetadata', positionTitle);
    window.addEventListener('resize', positionTitle);
  }

  if (document.readyState === 'complete') {
    setTimeout(fadeInVideo, 120);
    // Delay title until after video fade-in finishes (120ms start + 1600ms fade + buffer)
    setTimeout(fadeInTitle, 520);
  } else {
    window.addEventListener('load', function () {
      setTimeout(fadeInVideo, 120);
      setTimeout(fadeInTitle, 520);
    });
  }

  function updateHero() {
    var s = window.scrollY || window.pageYOffset;
    if (window.innerWidth < 768) {
      // Video darkens and desaturates as content scrolls over it
      var p = Math.min(1, s / (window.innerHeight * 1.4));
      if (video) {
        video.style.filter = 'saturate(' + (1 - p * 0.65) + ')';
      }
      if (overlay) {
        overlay.style.background = 'rgba(10,10,10,' + p * 0.5 + ')';
      }
      // Mobile hero fades out and slides up on scroll
      var mHero = document.getElementById('mobile-hero');
      if (mHero) {
        var t = Math.min(1, Math.max(0, s / (window.innerHeight * 0.65)));
        mHero.style.opacity = String(1 - t);
        mHero.style.transform = 'translateY(-' + t * 24 + 'px)';
      }
      return;
    }
    var vh = window.innerHeight;

    // "Video" load title fades out early in the scroll, before the sticky header appears
    var titleEl = document.getElementById('video-load-title');
    if (titleEl && s > 0) {
      titleEl.style.transition = 'none';
      titleEl.style.opacity = String(clamp(1 - s / (vh * 0.35), 0, 1));
    }

    // Hero content: slides in between 55% and 95% of 1vh scroll
    var p1 = clamp((s - vh * 0.55) / (vh * 0.4), 0, 1);
    if (heroContent) {
      heroContent.style.opacity = p1;
      heroContent.style.transform = 'translateY(' + lerp(40, 0, p1) + 'px)';
    }

    // Video desaturates as user scrolls — complete by 120% of vh
    var p2 = clamp(s / (vh * 1.2), 0, 1);

    // Video expands from contain → cover after header is revealed (95%–178% of vh)
    var p3 = clamp((s - vh * 0.95) / (vh * 0.825), 0, 1);
    var scale = lerp(1, scaleCover, p3);

    if (video) {
      video.style.filter = 'saturate(' + lerp(1, 0.2, p2) + ')';
      video.style.transform = 'scale(' + scale + ')';
    }

    // Overlay darkens alongside desaturation
    if (overlay) {
      overlay.style.background = 'rgba(10,10,10,' + lerp(0, 0.5, p2) + ')';
    }
  }

  var ticking = false;
  window.addEventListener(
    'scroll',
    function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          updateHero();
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true },
  );

  updateHero();
})();
