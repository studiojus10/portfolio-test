export function initNav() {
  // ── Mobile menu ──────────────────────────────────────────────────
  var toggleBtn     = document.getElementById('mobile-menu-toggle');
  var mobileMenu    = document.getElementById('mobile-menu');
  var mobileOverlay = document.getElementById('mobile-menu-overlay');

  var _preventBodyTouch = function (e) {
    if (!mobileMenu.contains(e.target)) e.preventDefault();
  };

  function openMenu() {
    revealNav();
    document.body.style.overflow = 'hidden';
    document.addEventListener('touchmove', _preventBodyTouch, { passive: false });
    mobileMenu.classList.remove('translate-x-full');
    mobileMenu.classList.add('translate-x-0');
    if (mobileOverlay) { mobileOverlay.classList.remove('opacity-0', 'pointer-events-none'); mobileOverlay.classList.add('opacity-100'); }
    toggleBtn.querySelector('.material-symbols-outlined').textContent = 'close';
  }
  function closeMenu() {
    document.body.style.overflow = '';
    document.removeEventListener('touchmove', _preventBodyTouch);
    mobileMenu.classList.remove('translate-x-0');
    mobileMenu.classList.add('translate-x-full');
    if (mobileOverlay) { mobileOverlay.classList.remove('opacity-100'); mobileOverlay.classList.add('opacity-0', 'pointer-events-none'); }
    toggleBtn.querySelector('.material-symbols-outlined').textContent = 'menu';
  }

  if (toggleBtn && mobileMenu) {
    toggleBtn.addEventListener('click', function () {
      mobileMenu.classList.contains('translate-x-0') ? closeMenu() : openMenu();
    });
    if (mobileOverlay) mobileOverlay.addEventListener('click', closeMenu);
    mobileMenu.querySelectorAll('a').forEach(function (l) { l.addEventListener('click', closeMenu); });
  }

  // ── Desktop: prevent page scroll while hovering over open dropdowns ──
  document.querySelectorAll('nav .group > div.absolute').forEach(function (d) {
    d.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
  });

  // ── Hide on scroll / reveal on scroll-up, hover (desktop), or top tap (mobile) ──
  var navEl = document.querySelector('nav');
  if (navEl) {
    var isMobileInit = window.innerWidth < 768;
    navEl.style.transition = 'transform 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.35s ease';
    navEl.style.transform  = isMobileInit ? 'translateY(0)' : 'translateY(-100%)';
    var lastScrollY  = window.scrollY || window.pageYOffset;
    var navHidden    = !isMobileInit;
    var scrollTick   = false;
    var hoverArmed   = false;

    var revealNav = function () {
      navEl.style.transform = 'translateY(0)';
      navHidden  = false;
      hoverArmed = true;
    };
    var hideNav = function () {
      navEl.style.transform = 'translateY(-100%)';
      navHidden  = true;
      hoverArmed = false;
    };

    window.addEventListener('scroll', function () {
      if (!scrollTick) {
        requestAnimationFrame(function () {
          var menuOpen = mobileMenu && mobileMenu.classList.contains('translate-x-0');
          if (!menuOpen) {
            var scrollY  = window.scrollY || window.pageYOffset;
            var delta    = scrollY - lastScrollY;

            if (delta > 8 && !navHidden && scrollY > 80) {
              // Hide on scroll-down
              hideNav();
            } else if (delta < -8 && navHidden) {
              // Reveal on scroll-up
              revealNav();
            }
            lastScrollY = scrollY;
          }
          scrollTick = false;
        });
        scrollTick = true;
      }
    }, { passive: true });

    // Desktop: reveal on hover in top 5% of screen
    document.addEventListener('mousemove', function (e) {
      var inTopZone = e.clientY < window.innerHeight * 0.05;
      if (!inTopZone) hoverArmed = true;
      if (navHidden && hoverArmed && inTopZone) revealNav();
    });

    // Mobile: tap in top 60 px reveals nav
    document.addEventListener('touchstart', function (e) {
      if (navHidden && e.touches[0] && e.touches[0].clientY < 60) revealNav();
    }, { passive: true });

    window._navReveal = revealNav;
  }
}
