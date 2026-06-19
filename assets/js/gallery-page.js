(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var galleryId = params.get('id');
  var galleries = window.StudioJus10Galleries || {};
  var gallery = galleries[galleryId];
  var page = document.getElementById('gallery-page');
  var error = document.getElementById('gallery-error');

  if (!gallery) {
    document.title = 'STUDIO JUS10 - Gallery Not Found';
    if (page) page.hidden = true;
    if (error) error.hidden = false;
    return;
  }

  document.title = 'STUDIO JUS10 - ' + gallery.title;
  document.getElementById('gallery-back').href = gallery.parentUrl;
  document.getElementById('gallery-back-label').textContent = gallery.parentLabel;
  document.getElementById('gallery-pill').textContent = gallery.pill;
  document.getElementById('gallery-title-text').textContent = gallery.title;
  document.getElementById('gallery-cjk').textContent = gallery.cjk;
  document.getElementById('gallery-note').textContent = gallery.note;

  window.StudioJus10Gallery.init({
    images: gallery.images,
    label: gallery.title
  });
})();
