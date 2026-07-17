/* Hero scroll animation */
(function () {
  var bgImg = document.getElementById('hero-bg-sketch');
  var overlay = document.getElementById('sketch-overlay');
  var heroContent = document.getElementById('sketch-hero-content');

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  var scaleCover = 1;
  function computeScaleCover() {
    if (!bgImg || !bgImg.naturalWidth) return;
    var ratio =
      (window.innerHeight * bgImg.naturalWidth) /
      (window.innerWidth * bgImg.naturalHeight);
    scaleCover = Math.max(1, ratio);
  }

  function fadeIn() {
    if (!bgImg) return;
    bgImg.style.transition = 'opacity 1.6s ease';
    bgImg.style.opacity = '1';
  }
  if (bgImg) {
    if (bgImg.complete && bgImg.naturalWidth) {
      computeScaleCover();
      setTimeout(fadeIn, 80);
    } else {
      bgImg.addEventListener('load', function () {
        computeScaleCover();
        setTimeout(fadeIn, 80);
      });
    }
    window.addEventListener('resize', computeScaleCover);
  }

  function updateHero() {
    var s = window.scrollY || window.pageYOffset;
    var vh = window.innerHeight;

    // Hero title slides in between 55% and 95% of first vh
    var p1 = clamp((s - vh * 0.55) / (vh * 0.4), 0, 1);
    if (heroContent) {
      heroContent.style.opacity = p1;
      heroContent.style.transform = 'translateY(' + lerp(40, 0, p1) + 'px)';
    }

    // Image expands contain → cover, blurs, and darkens over 0–140% of vh
    var p2 = clamp(s / (vh * 1.4), 0, 1);
    if (bgImg) {
      bgImg.style.transform = 'scale(' + lerp(1, scaleCover, p2) + ')';
      bgImg.style.filter = 'blur(' + lerp(0, 7, p2).toFixed(1) + 'px)';
    }
    if (overlay) {
      overlay.style.background =
        'rgba(10,10,10,' + lerp(0.1, 0.82, p2).toFixed(3) + ')';
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
  window.addEventListener(
    'resize',
    function () {
      computeScaleCover();
      updateHero();
    },
    { passive: true },
  );
  updateHero();
})();

(function () {
  var images = [
    '/assets/art/sketches/SKETCH-1.jpg',
    '/assets/art/sketches/SKETCH-2.jpg',
    '/assets/art/sketches/SKETCH-3.jpg',
    '/assets/art/sketches/SKETCH-4.jpg',
    '/assets/art/sketches/SKETCH-5.jpg',
    '/assets/art/sketches/SKETCH-6.jpg',
    '/assets/art/sketches/SKETCH-7.jpg',
    '/assets/art/sketches/SKETCH-8.jpg',
    '/assets/art/sketches/SKETCH-9.jpg',
    '/assets/art/sketches/SKETCH-10.jpg',
    '/assets/art/sketches/SKETCH-11.jpg',
    '/assets/art/sketches/SKETCH-12.jpg',
    '/assets/art/sketches/SKETCH-13.jpg',
    '/assets/art/sketches/SKETCH-14.jpg',
    '/assets/art/sketches/SKETCH-15.jpg',
    '/assets/art/sketches/SKETCH-16.jpg',
  ];
  var label = 'Sketch';

  // ── Build gallery DOM (orientation-aware pairs) ──────────────
  var gallery = document.getElementById('sketch-gallery');
  var dims = new Array(images.length);
  var probeCount = 0;

  function buildGallery() {
    // Group into rows: portrait images pair side-by-side, landscape go solo
    var rows = [];
    var i = 0;
    while (i < images.length) {
      var portrait = dims[i].h > dims[i].w;
      var nextPortrait = i + 1 < images.length && dims[i + 1].h > dims[i + 1].w;
      if (portrait && nextPortrait) {
        rows.push({ type: 'portrait-pair', indices: [i, i + 1] });
        i += 2;
      } else {
        rows.push({
          type: portrait ? 'portrait-single' : 'landscape',
          indices: [i],
        });
        i += 1;
      }
    }

    rows.forEach(function (row) {
      var figure = document.createElement('figure');
      figure.className = 'tilt-tile';
      figure.style.position = 'relative';
      figure.style.zIndex = '10';

      if (row.type === 'portrait-pair') {
        figure.style.margin = '0 0 11.8vh 0';
        figure.style.display = 'flex';
        figure.style.gap = '16px';
        row.indices.forEach(function (idx) {
          var wrapper = document.createElement('div');
          wrapper.className = 'tile-wrapper';
          wrapper.style.flex = '1';
          wrapper.style.minWidth = '0';
          var img = document.createElement('img');
          img.src = images[idx];
          img.alt = label + ' ' + (idx + 1);
          img.loading = 'lazy';
          wrapper.appendChild(img);
          figure.appendChild(wrapper);
          wrapper.addEventListener(
            'click',
            (function (n) {
              return function () {
                openLightbox(n);
              };
            })(idx),
          );
        });
      } else {
        var idx = row.indices[0];
        if (row.type === 'portrait-single') {
          figure.style.margin = '0 auto 11.8vh auto';
          figure.style.maxWidth = '400px';
        } else {
          figure.style.margin = '0 0 11.8vh 0';
        }
        var wrapper = document.createElement('div');
        wrapper.className = 'tile-wrapper';
        var img = document.createElement('img');
        img.src = images[idx];
        img.alt = label + ' ' + (idx + 1);
        img.loading = 'lazy';
        wrapper.appendChild(img);
        figure.appendChild(wrapper);
        figure.addEventListener(
          'click',
          (function (n) {
            return function () {
              openLightbox(n);
            };
          })(idx),
        );
      }

      gallery.appendChild(figure);
    });

    requestAnimationFrame(updateGallery);
  }

  images.forEach(function (src, i) {
    var probe = new Image();
    probe.onload = function () {
      dims[i] = { w: probe.naturalWidth, h: probe.naturalHeight };
      if (++probeCount === images.length) buildGallery();
    };
    probe.onerror = function () {
      dims[i] = { w: 1, h: 2 };
      if (++probeCount === images.length) buildGallery();
    };
    probe.src = src;
  });

  // ── Lightbox ─────────────────────────────────────────────────
  var lightbox = document.getElementById('lightbox');
  var lightboxInner = document.getElementById('lightbox-inner');
  var lightboxImg = document.getElementById('lightbox-img');
  var lbCaption = document.getElementById('lightbox-caption');
  var lbStrip = document.getElementById('lb-strip');
  var lbIndex = 0;
  var isAnimating = false;
  var SLIDE_MS = 280;

  images.forEach(function (src, i) {
    var thumb = document.createElement('img');
    thumb.src = src;
    thumb.className = 'lb-thumb' + (i === 0 ? ' active' : '');
    thumb.addEventListener('click', function () {
      openLightbox(i);
    });
    lbStrip.appendChild(thumb);
  });

  function updateStrip() {
    var thumbs = lbStrip.querySelectorAll('.lb-thumb');
    thumbs.forEach(function (t, i) {
      t.classList.toggle('active', i === lbIndex);
    });
    if (thumbs[lbIndex])
      thumbs[lbIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
  }

  function openLightbox(idx) {
    lbIndex = ((idx % images.length) + images.length) % images.length;
    lightboxImg.src = images[lbIndex];
    lightboxImg.alt = label + ' ' + (lbIndex + 1);
    lbCaption.textContent =
      label +
      ' — ' +
      String(lbIndex + 1).padStart(2, '0') +
      ' / ' +
      images.length;
    updateStrip();
    lightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    lightboxInner.style.animation = 'none';
    void lightboxInner.offsetWidth;
    lightboxInner.style.animation =
      'lightboxBloom 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards';
  }

  function closeLightbox() {
    lightbox.classList.add('hidden');
    document.body.style.overflow = '';
    lightboxImg.src = '';
    lightboxImg.style.transition = '';
    lightboxImg.style.transform = '';
    lightboxImg.style.opacity = '';
    isAnimating = false;
  }

  function navigate(dir) {
    if (isAnimating) return;
    isAnimating = true;
    var newIdx = (lbIndex + dir + images.length) % images.length;
    new Image().src = images[newIdx];
    lightboxImg.style.transition =
      'transform ' +
      SLIDE_MS +
      'ms cubic-bezier(0.4,0,0.2,1), opacity ' +
      Math.round(SLIDE_MS * 0.65) +
      'ms ease';
    lightboxImg.style.transform =
      dir > 0 ? 'translateX(-100vw)' : 'translateX(100vw)';
    lightboxImg.style.opacity = '0';
    setTimeout(function () {
      lbIndex = newIdx;
      lightboxImg.src = images[lbIndex];
      lbCaption.textContent =
        label +
        ' — ' +
        String(lbIndex + 1).padStart(2, '0') +
        ' / ' +
        images.length;
      updateStrip();
      lightboxImg.style.transition = 'none';
      lightboxImg.style.transform =
        dir > 0 ? 'translateX(100vw)' : 'translateX(-100vw)';
      lightboxImg.style.opacity = '0';
      void lightboxImg.offsetWidth;
      lightboxImg.style.transition =
        'transform ' +
        SLIDE_MS +
        'ms cubic-bezier(0.4,0,0.2,1), opacity ' +
        Math.round(SLIDE_MS * 0.65) +
        'ms ease';
      lightboxImg.style.transform = '';
      lightboxImg.style.opacity = '';
      setTimeout(function () {
        lightboxImg.style.transition = '';
        lightboxImg.style.transform = '';
        lightboxImg.style.opacity = '';
        isAnimating = false;
      }, SLIDE_MS + 30);
    }, SLIDE_MS);
  }

  document
    .getElementById('lightbox-close')
    .addEventListener('click', closeLightbox);
  document
    .getElementById('lightbox-prev')
    .addEventListener('click', function (e) {
      e.stopPropagation();
      navigate(-1);
    });
  document
    .getElementById('lightbox-next')
    .addEventListener('click', function (e) {
      e.stopPropagation();
      navigate(1);
    });
  lightboxInner.addEventListener('click', function (e) {
    e.stopPropagation();
  });
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', function (e) {
    if (lightbox.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
  });

  // ── Scroll tilt animation ─────────────────────────────────────
  function updateGallery() {
    var vh = window.innerHeight;
    document.querySelectorAll('.tilt-tile').forEach(function (tile) {
      var rect = tile.getBoundingClientRect();
      var tileH = Math.max(rect.height, 1);
      var totalTravel = tileH + vh;
      var traveled = vh - rect.top;
      var p = Math.max(0, Math.min(1, traveled / totalTravel));
      var focus = Math.sin(p * Math.PI);
      var blur = (1 - focus) * 8;
      var bright = Math.max(0.05, focus);
      var contrast = 1 + (1 - focus) * 3;
      var rotateX = (0.5 - p) * 140;
      var tz = (1 - focus) * 300;
      var ty = (0.5 - p) * tileH * 2;
      var wrappers = tile.querySelectorAll('.tile-wrapper');
      if (!wrappers.length) return;
      var filterVal =
        'blur(' +
        blur.toFixed(2) +
        'px) brightness(' +
        bright.toFixed(3) +
        ') contrast(' +
        contrast.toFixed(2) +
        ')';
      var transformVal =
        'translateY(' +
        ty.toFixed(1) +
        'px) translateZ(' +
        tz.toFixed(1) +
        'px) rotateX(' +
        rotateX.toFixed(2) +
        'deg)';
      wrappers.forEach(function (wrapper) {
        wrapper.style.filter = filterVal;
        wrapper.style.transform = transformVal;
      });
    });
  }

  var ticking = false;
  window.addEventListener(
    'scroll',
    function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          updateGallery();
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true },
  );
  window.addEventListener('resize', updateGallery, { passive: true });
  requestAnimationFrame(updateGallery);
  window.addEventListener('load', updateGallery);
})();
