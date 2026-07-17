(function () {
  var images = [];
  for (var i = 1; i <= 10; i++) {
    images.push(
      '/assets/images/Washington/Seattle/SEATTLE-' +
        String(i).padStart(2, '0') +
        '.jpg',
    );
  }
  var label = 'Seattle';

  var lightbox = document.getElementById('lightbox');
  var lightboxInner = document.getElementById('lightbox-inner');
  var lightboxImg = document.getElementById('lightbox-img');
  var lbCaption = document.getElementById('lightbox-caption');
  var lbStrip = document.getElementById('lb-strip');
  var lbIndex = 0;
  var isAnimating = false;
  var SLIDE_MS = 280;

  /* Build thumbnail strip */
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
    /* Scroll active thumb into view */
    if (thumbs[lbIndex]) {
      thumbs[lbIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }

  function openLightbox(idx) {
    lbIndex = ((idx % images.length) + images.length) % images.length;
    lightboxImg.src = images[lbIndex];
    lightboxImg.alt = label;
    lbCaption.textContent =
      label +
      ' — ' +
      String(lbIndex + 1).padStart(2, '0') +
      ' / ' +
      images.length;
    updateStrip();
    lightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    (function () {
      var nav = document.getElementById('nav-root');
      if (!nav) return;
      clearTimeout(window._lbNavTimer);
      nav.style.visibility = '';
      nav.style.transition = 'opacity 0.4s ease';
      nav.style.opacity = '1';
      nav.style.pointerEvents = '';
      // Auto-hide after 2 s of no hover
      window._lbNavTimer = setTimeout(function () {
        nav.style.opacity = '0';
        nav.style.pointerEvents = 'none';
      }, 2000);
      if (!nav._lbEnter) {
        nav._lbEnter = function () {
          clearTimeout(window._lbNavTimer);
          nav.style.opacity = '1';
          nav.style.pointerEvents = '';
        };
        nav._lbLeave = function () {
          clearTimeout(window._lbNavTimer);
          window._lbNavTimer = setTimeout(function () {
            nav.style.opacity = '0';
            nav.style.pointerEvents = 'none';
          }, 1000);
        };
        nav.addEventListener('mouseenter', nav._lbEnter);
        nav.addEventListener('mouseleave', nav._lbLeave);
      }
    })();
    lightboxInner.style.animation = 'none';
    void lightboxInner.offsetWidth;
    lightboxInner.style.animation =
      'lightboxBloom 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards';
  }
  function closeLightbox() {
    lightbox.classList.add('hidden');
    document.body.style.overflow = '';
    (function () {
      var nav = document.getElementById('nav-root');
      if (!nav) return;
      clearTimeout(window._lbNavTimer);
      nav.style.opacity = '';
      nav.style.transition = '';
      nav.style.pointerEvents = '';
      nav.style.visibility = '';
      if (nav._lbEnter) {
        nav.removeEventListener('mouseenter', nav._lbEnter);
        nav._lbEnter = null;
      }
      if (nav._lbLeave) {
        nav.removeEventListener('mouseleave', nav._lbLeave);
        nav._lbLeave = null;
      }
    })();
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
  document.getElementById('lb-back').addEventListener('click', closeLightbox);
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

  /* Build gallery grid */
  var grid = document.getElementById('galleryGrid');
  images.forEach(function (src, i) {
    var item = document.createElement('div');
    item.className = 'gallery-item';
    var img = document.createElement('img');
    img.src = src;
    img.alt = label + ' ' + String(i + 1).padStart(2, '0');
    img.loading = i < 6 ? 'eager' : 'lazy';
    var overlay = document.createElement('div');
    overlay.className = 'gallery-item-overlay';
    item.appendChild(img);
    item.appendChild(overlay);
    item.addEventListener('click', function () {
      openLightbox(i);
    });
    grid.appendChild(item);
  });

  /* Open lightbox if ?open=N is in the URL */
  var params = new URLSearchParams(window.location.search);
  var openIdx = params.get('open');
  if (openIdx !== null) {
    var idx = parseInt(openIdx, 10);
    if (!isNaN(idx) && idx >= 0 && idx < images.length) {
      openLightbox(idx);
    }
  }
})();
