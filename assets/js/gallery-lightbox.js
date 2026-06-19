(function () {
  'use strict';

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function init(options) {
    var images = options.images || [];
    var label = options.label || 'Image';
    var lightbox = document.getElementById('lightbox');
    var lightboxInner = document.getElementById('lightbox-inner');
    var lightboxImg = document.getElementById('lightbox-img');
    var lbCaption = document.getElementById('lightbox-caption');
    var lbStrip = document.getElementById('lb-strip');
    var grid = document.getElementById('galleryGrid');
    var closeBtn = document.getElementById('lightbox-close');
    var prevBtn = document.getElementById('lightbox-prev');
    var nextBtn = document.getElementById('lightbox-next');

    if (!images.length || !lightbox || !lightboxInner || !lightboxImg || !lbCaption || !lbStrip || !grid) {
      return;
    }

    var lbIndex = 0;
    var isAnimating = false;
    var slideMs = 280;

    function updateStrip() {
      var thumbs = lbStrip.querySelectorAll('.lb-thumb');
      thumbs.forEach(function (thumb, i) {
        thumb.classList.toggle('active', i === lbIndex);
      });
      if (thumbs[lbIndex]) {
        thumbs[lbIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }

    function openLightbox(idx) {
      lbIndex = ((idx % images.length) + images.length) % images.length;
      lightboxImg.src = images[lbIndex];
      lightboxImg.alt = label;
      lbCaption.textContent = label + ' - ' + pad2(lbIndex + 1) + ' / ' + images.length;
      updateStrip();
      lightbox.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      lightboxInner.style.animation = 'none';
      void lightboxInner.offsetWidth;
      lightboxInner.style.animation = 'lightboxBloom 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards';
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
      (new Image()).src = images[newIdx];
      lightboxImg.style.transition = 'transform ' + slideMs + 'ms cubic-bezier(0.4,0,0.2,1), opacity ' + Math.round(slideMs * 0.65) + 'ms ease';
      lightboxImg.style.transform = dir > 0 ? 'translateX(-100vw)' : 'translateX(100vw)';
      lightboxImg.style.opacity = '0';

      setTimeout(function () {
        lbIndex = newIdx;
        lightboxImg.src = images[lbIndex];
        lbCaption.textContent = label + ' - ' + pad2(lbIndex + 1) + ' / ' + images.length;
        updateStrip();
        lightboxImg.style.transition = 'none';
        lightboxImg.style.transform = dir > 0 ? 'translateX(100vw)' : 'translateX(-100vw)';
        lightboxImg.style.opacity = '0';
        void lightboxImg.offsetWidth;
        lightboxImg.style.transition = 'transform ' + slideMs + 'ms cubic-bezier(0.4,0,0.2,1), opacity ' + Math.round(slideMs * 0.65) + 'ms ease';
        lightboxImg.style.transform = '';
        lightboxImg.style.opacity = '';
        setTimeout(function () {
          lightboxImg.style.transition = '';
          lightboxImg.style.transform = '';
          lightboxImg.style.opacity = '';
          isAnimating = false;
        }, slideMs + 30);
      }, slideMs);
    }

    images.forEach(function (src, i) {
      var thumb = document.createElement('img');
      thumb.src = src;
      thumb.className = 'lb-thumb' + (i === 0 ? ' active' : '');
      thumb.addEventListener('click', function () { openLightbox(i); });
      lbStrip.appendChild(thumb);
    });

    images.forEach(function (src, i) {
      var item = document.createElement('div');
      var img = document.createElement('img');
      var overlay = document.createElement('div');

      item.className = 'gallery-item';
      img.src = src;
      img.alt = label + ' ' + pad2(i + 1);
      img.loading = i < 6 ? 'eager' : 'lazy';
      overlay.className = 'gallery-item-overlay';
      item.appendChild(img);
      item.appendChild(overlay);
      item.addEventListener('click', function () { openLightbox(i); });
      grid.appendChild(item);
    });

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (prevBtn) prevBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      navigate(-1);
    });
    if (nextBtn) nextBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      navigate(1);
    });
    lightboxInner.addEventListener('click', function (event) { event.stopPropagation(); });
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', function (event) {
      if (lightbox.classList.contains('hidden')) return;
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowLeft') navigate(-1);
      if (event.key === 'ArrowRight') navigate(1);
    });

    var params = new URLSearchParams(window.location.search);
    var openIdx = params.get('open');
    if (openIdx !== null) {
      var idx = parseInt(openIdx, 10);
      if (!isNaN(idx) && idx >= 0 && idx < images.length) {
        openLightbox(idx);
      }
    }
  }

  window.StudioJus10Gallery = { init: init };
})();
