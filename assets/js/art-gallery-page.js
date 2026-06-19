(function () {
  var params = new URLSearchParams(window.location.search);
  var id = params.get('id') || 'sketches';
  var gallery = window.StudioJus10ArtGalleries[id];

  if (!gallery) {
    window.location.replace('art.html');
    gallery = window.StudioJus10ArtGalleries.sketches;
  }

  document.title = 'STUDIO JUS10 - ' + gallery.title;
  document.getElementById('art-title').textContent = gallery.title;
  document.getElementById('art-cjk').textContent = gallery.cjk;
  document.getElementById('art-description').textContent = gallery.description;
  document.getElementById('art-hero-bg').src = gallery.hero;
  window.StudioJus10CurrentArtGallery = gallery;
})();
