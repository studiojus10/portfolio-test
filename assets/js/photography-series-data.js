(function () {
  window.StudioJus10PhotographySeries = {
    arizona: {
      title: 'Arizona',
      cjk: '亚利桑那',
      subtitle: 'Desert roads and canyon light across the Southwest.',
      intro: 'Across the desert Southwest — red rock and open sky, mapped frame by frame along the road.',
      sections: [
        { id: 'travels', pill: 'Travels', title: 'Travels', cjk: '旅途', note: 'Desert roads and canyon light across the Southwest.', galleryId: 'arizona-travels' }
      ]
    },
    colorado: {
      title: 'Colorado',
      cjk: '科罗拉多',
      subtitle: 'The peak, the ranch, the fairway, the field.',
      intro: 'Twelve months in Colorado — terrain mapped frame by frame, the light saved, and the ordinary kept on film.',
      sections: [
        { id: 'twelve-views', pill: 'Typology', title: 'Twelve Views of Pikes Peak', cjk: '派克峰十二景', note: 'The mountain from twelve different roads.', galleryId: 'colorado-twelve-views' },
        { id: 'rock-ledge', pill: 'History', title: 'Rock Ledge Ranch', cjk: '岩台牧场', note: 'A 19th-century homestead held in place by the Garden of the Gods.', galleryId: 'colorado-rock-ledge' },
        { id: 'golf', pill: 'Sport', title: 'Golf', cjk: '高尔夫', note: 'Clean lines cut into the high plains.', galleryId: 'colorado-golf' },
        { id: 'cornfield', pill: 'Land', title: 'Cornfield', cjk: '玉米田', note: 'Late season gold at the edge of the city.', galleryId: 'colorado-cornfield' }
      ]
    },
    film: {
      title: 'Film',
      cjk: '胶片',
      subtitle: 'Shot on analog — Europe, home, and memory.',
      intro: 'Shot on film. Europe, home, and the quiet hours between — kept on analog.',
      sections: [
        { id: 'europe', pill: 'Abroad', title: 'Europe', cjk: '欧洲', note: 'Frames from abroad, shot on film.', galleryId: 'film-europe' },
        { id: 'home', pill: 'Domestic', title: 'Home', cjk: '家', note: 'Everyday life, remembered on film.', galleryId: 'film-home' },
        { id: 'memory', pill: 'Series', title: 'Memory', cjk: '记忆', note: 'Long exposures and quiet hours.', galleryId: 'film-memory' }
      ]
    },
    nature: {
      title: 'Nature',
      cjk: '自然',
      subtitle: 'Butterflies, flowers, and open terrain.',
      intro: 'The garden, the specimen, the wild — still life and landscape studied close.',
      sections: [
        { id: 'sanctuary', pill: 'Lepidoptera', title: 'Butterfly Sanctuary', cjk: '蝴蝶圣地', note: 'Living color in an enclosed tropical garden.', galleryId: 'nature-sanctuary' },
        { id: 'museum', pill: 'Collection', title: 'Butterfly Museum', cjk: '蝴蝶博物馆', note: 'Specimens and science under glass.', galleryId: 'nature-museum' },
        { id: 'flowers', pill: 'Botanical', title: 'Flowers', cjk: '花卉', note: 'Close studies in botanical color.', galleryId: 'nature-flowers' },
        { id: 'landscapes', pill: 'Land', title: 'Landscapes', cjk: '风景', note: 'Terrain at the boundary of wild and tended.', galleryId: 'nature-landscapes' }
      ]
    },
    washington: {
      title: 'Washington',
      cjk: '华盛顿',
      subtitle: 'Seattle in winter light.',
      intro: 'Seattle in winter — grey light on the water, streets in the rain, and the city framed from the ferry.',
      sections: [
        { id: 'seattle', pill: 'City', title: 'Seattle', cjk: '西雅图', note: 'The city framed in winter light.', galleryId: 'washington-seattle' }
      ]
    }
  };

  window.StudioJus10PhotographyUrl = function (id) {
    return 'photography-series.html?id=' + encodeURIComponent(id);
  };
})();
