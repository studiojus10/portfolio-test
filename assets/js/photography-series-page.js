(function () {
  var params = new URLSearchParams(window.location.search);
  var id = params.get('id') || 'colorado';
  var series = window.StudioJus10PhotographySeries[id];
  var galleries = window.StudioJus10Galleries;

  if (!series || !galleries) {
    window.location.replace('photography.html');
    return;
  }

  document.title = 'STUDIO JUS10 - Photography · ' + series.title;
  document.getElementById('series-kicker').textContent = series.title + ' · Selected Works';
  document.getElementById('series-title').textContent = series.title;
  document.getElementById('series-cjk').textContent = series.cjk;
  document.getElementById('series-subtitle').textContent = series.subtitle;
  document.getElementById('series-intro').textContent = series.intro;

  var galleryMap = {};
  var collections = document.getElementById('series-collections');

  series.sections.forEach(function (section) {
    var gallery = galleries[section.galleryId];
    if (!gallery) return;
    galleryMap[section.id] = gallery;

    var collection = document.createElement('section');
    collection.className = 'collection';
    collection.id = section.id;

    var head = document.createElement('div');
    head.className = 'collection-head';
    head.innerHTML =
      '<span class="collection-pill">' + section.pill + '</span>' +
      '<h2 class="collection-title">' + section.title +
      '<span class="collection-cjk">' + section.cjk + '</span></h2>' +
      '<p class="collection-note">' + section.note + '</p>';
    collection.appendChild(head);

    var accordion = document.createElement('div');
    accordion.className = 'accordion-section';
    accordion.dataset.section = section.id;
    var row = document.createElement('div');
    row.className = 'acc-row';

    gallery.images.slice(0, 5).forEach(function (src, index, previews) {
      var panel = document.createElement('div');
      var isMore = index === previews.length - 1;
      panel.className = 'acc-panel' + (index === 0 ? ' acc-active' : '') + (isMore ? ' acc-see-more' : '');
      var image = document.createElement('img');
      image.src = src;
      image.alt = isMore ? '' : section.title;
      image.loading = 'lazy';
      panel.appendChild(image);
      if (isMore) {
        panel.insertAdjacentHTML('beforeend', '<div class="acc-see-more-overlay"></div><span class="acc-see-more-text">See More</span>');
      }
      row.appendChild(panel);
    });

    accordion.appendChild(row);
    collection.appendChild(accordion);
    collections.appendChild(collection);
  });

  var firstGallery = galleries[series.sections[0].galleryId];
  document.getElementById('heroImg').style.backgroundImage = 'url("' + firstGallery.images[0] + '")';
  window.StudioJus10CurrentSeriesGalleries = galleryMap;
})();
