(function () {
  'use strict';

  function sequence(directory, prefix, count) {
    var images = [];
    for (var i = 1; i <= count; i++) {
      images.push(directory + '/' + prefix + String(i).padStart(2, '0') + '.jpg');
    }
    return images;
  }

  var galleries = {
    'arizona-travels': {
      title: 'Travels',
      cjk: '旅途',
      pill: 'Travels',
      note: 'Desert roads and canyon light across the Southwest.',
      parentLabel: 'Arizona',
      parentUrl: 'photography-series.html?id=arizona',
      images: sequence('assets/images/arizona/travels', 'ARIZONA-', 21)
    },
    'colorado-cornfield': {
      title: 'Cornfield',
      cjk: '玉米田',
      pill: 'Land',
      note: 'Late season gold at the edge of the city.',
      parentLabel: 'Colorado',
      parentUrl: 'photography-series.html?id=colorado',
      images: sequence('assets/images/colorado/cornfield', 'CORNFIELD-', 8)
    },
    'colorado-golf': {
      title: 'Golf',
      cjk: '高尔夫',
      pill: 'Sport',
      note: 'Clean lines cut into the high plains.',
      parentLabel: 'Colorado',
      parentUrl: 'photography-series.html?id=colorado',
      images: sequence('assets/images/colorado/golf', 'GOLF-', 11)
    },
    'colorado-rock-ledge': {
      title: 'Rock Ledge Ranch',
      cjk: '岩台牧场',
      pill: 'History',
      note: 'A 19th-century homestead held in place by the Garden of the Gods.',
      parentLabel: 'Colorado',
      parentUrl: 'photography-series.html?id=colorado',
      images: sequence('assets/images/colorado/rock-ledge-ranch', 'ROCK_LEDGE-', 11)
    },
    'colorado-twelve-views': {
      title: 'Twelve Views of Pikes Peak',
      cjk: '派克峰十二景',
      pill: 'Typology',
      note: 'The mountain from twelve different roads.',
      parentLabel: 'Colorado',
      parentUrl: 'photography-series.html?id=colorado',
      images: sequence('assets/images/colorado/twelve-views-of-pikes-peak', 'TYPOLOGY-', 12)
    },
    'film-europe': {
      title: 'Europe',
      cjk: '欧洲',
      pill: 'Abroad',
      note: 'Frames from abroad, shot on film.',
      parentLabel: 'Film',
      parentUrl: 'photography-series.html?id=film',
      images: [
        'assets/images/film/europe/FILM_MISC-03.jpg',
        'assets/images/film/europe/FILM_MISC-05.jpg',
        'assets/images/film/europe/FILM_MISC-06.jpg',
        'assets/images/film/europe/FILM_MISC-07.jpg',
        'assets/images/film/europe/FILM_MISC-08.jpg',
        'assets/images/film/europe/FILM_MISC-09.jpg',
        'assets/images/film/europe/FILM_MISC-10.jpg',
        'assets/images/film/europe/FILM_MISC-11.jpg',
        'assets/images/film/europe/FILM_MISC-12.jpg',
        'assets/images/film/europe/FILM_MISC-13.jpg',
        'assets/images/film/europe/FILM_MISC-14.jpg',
        'assets/images/film/europe/FILM_MISC-15.jpg'
      ]
    },
    'film-home': {
      title: 'Home',
      cjk: '家',
      pill: 'Domestic',
      note: 'Everyday life, remembered on film.',
      parentLabel: 'Film',
      parentUrl: 'photography-series.html?id=film',
      images: [
        'assets/images/film/home/FILM_MISC-01.jpg',
        'assets/images/film/home/FILM_MISC-02.jpg',
        'assets/images/film/home/FILM_MISC-04.jpg',
        'assets/images/film/home/FILM_MISC-16.jpg',
        'assets/images/film/home/FILM_MISC-17.jpg',
        'assets/images/film/home/FILM_MISC-18.jpg',
        'assets/images/film/home/FILM_MISC-19.jpg',
        'assets/images/film/home/FILM_MISC-20.jpg',
        'assets/images/film/home/FILM_MISC-21.jpg',
        'assets/images/film/home/FILM_MISC-22.jpg',
        'assets/images/film/home/FILM_MISC-23.jpg',
        'assets/images/film/home/FILM_MISC-24.jpg',
        'assets/images/film/home/FILM_MISC-25.jpg',
        'assets/images/film/home/FILM_MISC-26.jpg',
        'assets/images/film/home/FILM_MISC-27.jpg',
        'assets/images/film/home/FILM_MISC-28.jpg',
        'assets/images/film/home/FILM_MISC-29.jpg',
        'assets/images/film/home/FILM_MISC-30.jpg'
      ]
    },
    'film-memory': {
      title: 'Memory',
      cjk: '记忆',
      pill: 'Series',
      note: 'Long exposures and quiet hours.',
      parentLabel: 'Film',
      parentUrl: 'photography-series.html?id=film',
      images: sequence('assets/images/film/memory', 'MEMORY-', 12)
    },
    'nature-flowers': {
      title: 'Flowers',
      cjk: '花卉',
      pill: 'Botanical',
      note: 'Close studies in botanical color.',
      parentLabel: 'Nature',
      parentUrl: 'photography-series.html?id=nature',
      images: sequence('assets/images/nature/flowers', 'FLOWERS-', 12)
    },
    'nature-landscapes': {
      title: 'Landscapes',
      cjk: '风景',
      pill: 'Land',
      note: 'Terrain at the boundary of wild and tended.',
      parentLabel: 'Nature',
      parentUrl: 'photography-series.html?id=nature',
      images: [
        'assets/images/nature/landscapes/NATURE-1.jpg',
        'assets/images/nature/landscapes/NATURE-3.jpg',
        'assets/images/nature/landscapes/NATURE-5.jpg',
        'assets/images/nature/landscapes/NATURE-6.jpg',
        'assets/images/nature/landscapes/NATURE-7.jpg',
        'assets/images/nature/landscapes/NATURE-8.jpg',
        'assets/images/nature/landscapes/NATURE-9.jpg'
      ]
    },
    'nature-museum': {
      title: 'Butterfly Museum',
      cjk: '蝴蝶博物馆',
      pill: 'Collection',
      note: 'Specimens and science under glass.',
      parentLabel: 'Nature',
      parentUrl: 'photography-series.html?id=nature',
      images: sequence('assets/images/nature/butterflies/museum', 'BUTTERFLIES-', 18).slice(10)
    },
    'nature-sanctuary': {
      title: 'Butterfly Sanctuary',
      cjk: '蝴蝶圣地',
      pill: 'Lepidoptera',
      note: 'Living color in an enclosed tropical garden.',
      parentLabel: 'Nature',
      parentUrl: 'photography-series.html?id=nature',
      images: sequence('assets/images/nature/butterflies/sanctuary', 'BUTTERFLIES-', 10)
    },
    'washington-seattle': {
      title: 'Seattle',
      cjk: '西雅图',
      pill: 'City',
      note: 'The city framed in winter light.',
      parentLabel: 'Washington',
      parentUrl: 'photography-series.html?id=washington',
      images: sequence('assets/images/washington/seattle', 'SEATTLE-', 10)
    }
  };

  Object.keys(galleries).forEach(function (id) {
    galleries[id].id = id;
  });

  function galleryUrl(id, openIndex) {
    var url = 'gallery.html?id=' + encodeURIComponent(id);
    if (typeof openIndex === 'number' && openIndex >= 0) {
      url += '&open=' + openIndex;
    }
    return url;
  }

  window.StudioJus10Galleries = galleries;
  window.StudioJus10GalleryUrl = galleryUrl;
})();
