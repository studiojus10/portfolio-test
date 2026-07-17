import '../lib/bootstrap.js';

(function () {
  var hero = document.getElementById('about-parallax-hero');
  var bg = document.getElementById('hero-bg');
  var person = document.getElementById('hero-person');
  var title = document.getElementById('hero-title');

  // Extend hero behind nav so background fills to top when nav is hidden
  var navEl = document.querySelector('nav');
  var navH = navEl ? navEl.offsetHeight : 0;
  if (hero && navH > 0) {
    hero.style.marginTop = '-' + navH + 'px';
    hero.style.height = 'calc(142vh + ' + navH + 'px)';
  }

  var wasExpanded = false;
  var transitionLive = false;
  var initialFadeComplete = false;

  function update() {
    if (!hero || !bg) return;
    var scrollY = window.scrollY || window.pageYOffset;
    var heroH = window.innerHeight;

    if (scrollY <= heroH) {
      var p = scrollY / heroH;

      if (wasExpanded) {
        // First tick back inside hero: animate smoothly out of the scaled state
        wasExpanded = false;
        transitionLive = true;
        bg.style.transition = 'transform 0.55s ease, opacity 0.55s ease';
        function onEnd() {
          bg.removeEventListener('transitionend', onEnd);
          transitionLive = false;
          bg.style.transition = 'none';
        }
        bg.addEventListener('transitionend', onEnd);
      } else if (!transitionLive && initialFadeComplete) {
        // Normal parallax tracking — no transition lag
        bg.style.transition = 'none';
      }

      bg.style.transform = 'translateY(' + p * 20 + 'vh)';
      bg.style.opacity = '1';
      if (person) {
        person.style.transform = 'translateY(' + p * 5 + 'vh)';
        person.style.opacity = Math.max(0, 1 - scrollY / hero.offsetHeight);
      }
      if (title) title.style.transform = 'translateY(' + p * -22 + 'vh)';
    } else {
      // Past hero: scale up 15% and reduce opacity to 70%
      wasExpanded = true;
      bg.style.transition = 'transform 0.6s ease, opacity 0.6s ease';
      bg.style.transform = 'scale(1.15)';
      bg.style.opacity = '0.7';
    }
  }

  var ticking = false;
  window.addEventListener(
    'scroll',
    function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          update();
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true },
  );

  window.addEventListener('load', function () {
    bg.style.transition = 'opacity 0.9s ease';
    if (person) person.style.transition = 'opacity 0.85s ease 0.3s';
    if (title) title.style.transition = 'opacity 0.8s ease 0.5s';
    update();
    if (title) title.style.opacity = '1';
    setTimeout(function () {
      initialFadeComplete = true;
      if (person) person.style.transition = '';
      if (title) title.style.transition = '';
    }, 1400);
  });
})();

(function () {
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 },
  );

  document.querySelectorAll('.scroll-reveal').forEach(function (el) {
    observer.observe(el);
  });
})();
