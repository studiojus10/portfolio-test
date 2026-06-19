(function () {
  var sketches = [];
  for (var i = 1; i <= 16; i += 1) {
    sketches.push('assets/art/sketches/SKE-' + i + '.jpg');
  }

  window.StudioJus10ArtGalleries = {
    sketches: {
      title: 'Sketches',
      cjk: '素描',
      description: 'A scroll through hand-drawn work — studies in form, line, and observation.',
      label: 'Sketch',
      hero: 'assets/art/sketches/SKE-4.jpg',
      images: sketches
    },
    composers: {
      title: 'Composers',
      cjk: '作曲家',
      description: 'Portrait sketches of the great composers — studies in character, intensity, and music.',
      label: 'Composer',
      hero: 'assets/art/sketches/SKE-4.jpg',
      images: [
        'assets/art/sketches/SKE-1.jpg',
        'assets/art/sketches/SKE-4.jpg',
        'assets/art/sketches/SKE-8.jpg',
        'assets/art/sketches/SKE-14.jpg'
      ]
    }
  };

  window.StudioJus10ArtGalleryUrl = function (id) {
    return 'art-gallery.html?id=' + encodeURIComponent(id);
  };
})();
