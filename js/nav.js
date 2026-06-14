(function () {
  'use strict';

  // ── Active-state detection ──────────────────────────────────────
  var p = window.location.pathname.split('/').pop() || 'index.html';

  var photo = p.startsWith('photography');
  var video = p === 'video.html';
  var art   = p === 'art.html';
  var about = p === 'about.html';

  var co   = p.startsWith('photography-colorado');
  var az   = p.startsWith('photography-arizona');
  var wa   = p.startsWith('photography-washington');
  var nat  = p.startsWith('photography-nature');
  var film = p.startsWith('photography-film');

  // ── Helpers ─────────────────────────────────────────────────────
  function lnk(href, cls, inner, style) {
    return '<a href="' + href + '" class="' + cls + '"' + (style ? ' style="' + style + '"' : '') + '>' + inner + '</a>';
  }

  function desktopLink(href, label, cjk, active) {
    return lnk(href,
      (active ? 'text-primary' : 'text-on-surface hover:text-primary') +
        ' transition-colors duration-300 cursor-pointer flex flex-col items-center',
      '<span>' + label + '</span>' +
        '<span class="font-cjk text-[10px] ' + (active ? 'text-primary' : 'text-on-surface-variant') + '">' + cjk + '</span>'
    );
  }

  function dropItem(href, label, cjk, active, last) {
    return lnk(href,
      'flex justify-between items-center px-4 py-3 font-label-caps text-[10px] tracking-widest' +
        (active ? ' bg-surface-container-low text-primary' : ' hover:bg-surface-container-low hover:text-primary transition-colors') +
        (last ? '' : ' border-b border-on-background'),
      '<span>' + label + '</span><span class="font-cjk text-xs text-primary">' + cjk + '</span>'
    );
  }

  function mobileTopLink(href, label, cjk, active) {
    return lnk(href,
      'flex justify-between items-center border-b border-on-background pb-4 hover:text-primary transition-colors' +
        (active ? ' text-primary' : ''),
      '<span>' + label + '</span><span class="font-cjk text-primary text-sm">' + cjk + '</span>',
      active ? null : 'color:var(--muted)'
    );
  }

  function mobileSubItem(href, label, cjk, active) {
    return lnk(href,
      'flex justify-between items-center py-1.5 ' +
        (active ? 'text-primary' : 'hover:text-primary transition-colors text-on-surface-variant'),
      '<span class="text-[9px] tracking-widest">' + label + '</span>' +
        '<span class="font-cjk text-primary text-[9px]">' + cjk + '</span>'
    );
  }

  // ── Build HTML ───────────────────────────────────────────────────
  var html =
    '<nav class="bg-surface-container-lowest font-label-caps text-label-caps w-full top-0 sticky border-b border-on-background flex justify-between items-center px-4 md:px-8 py-4 z-50">' +

    lnk('index.html',
      'logo-text font-headline-md text-headline-md tracking-tighter text-on-background hover:text-primary transition-colors duration-300 flex items-center gap-2',
      'STUDIO JUS10<span class="font-cjk text-lg font-light hidden sm:inline-block ml-2">工作室</span>'
    ) +

    '<div class="hidden md:flex gap-8 items-center tracking-widest">' +

    // Photography with dropdown
    '<div class="relative group">' +
    lnk('photography.html',
      (photo ? 'text-primary' : 'text-on-surface hover:text-primary') +
        ' transition-colors duration-300 cursor-pointer flex flex-col items-center',
      '<span>Photography</span>' +
        '<span class="font-cjk text-[10px] ' + (photo ? 'text-primary' : 'text-on-surface-variant') + '">摄影</span>'
    ) +
    '<div class="absolute top-full left-1/2 -translate-x-1/2 w-52 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 z-50">' +
    '<div class="h-3"></div>' +
    '<div class="bg-surface-container-lowest border border-on-background shadow-lg">' +
    dropItem('photography-colorado.html',   'Colorado',   '科罗拉多', co,   false) +
    dropItem('photography-arizona.html',    'Arizona',    '亚利桑那', az,   false) +
    dropItem('photography-washington.html', 'Washington', '华盛顿',   wa,   false) +
    dropItem('photography-nature.html',     'Nature',     '自然',     nat,  false) +
    dropItem('photography-film.html',       'Film',       '胶片',     film, true) +
    '</div></div></div>' +

    desktopLink('video.html', 'Video', '视频', video) +
    desktopLink('art.html',   'Art',   '艺术', art) +
    desktopLink('about.html', 'About', '关于', about) +
    '</div>' +

    '<button id="theme-toggle" aria-label="Toggle dark mode" class="hidden md:flex items-center justify-center w-9 h-9 rounded-full border border-on-surface text-on-surface hover:border-primary hover:text-primary transition-colors duration-300">' +
    '<span class="material-symbols-outlined theme-icon" style="font-size:18px;line-height:1;">dark_mode</span>' +
    '</button>' +

    lnk('contact.html',
      'hidden md:inline-flex items-center gap-2 border border-on-surface px-4 py-2 hover:bg-primary hover:text-white hover:border-primary transition-colors duration-300',
      '<span>Contact</span><span class="font-cjk text-xs">联系</span>'
    ) +

    '<button id="mobile-menu-toggle" class="md:hidden" aria-label="Toggle menu" style="color:var(--fg)">' +
    '<span class="material-symbols-outlined">menu</span>' +
    '</button>' +

    '</nav>' +

    // Mobile menu
    '<div id="mobile-menu" class="fixed inset-y-0 right-0 z-40 w-72 bg-surface-container-lowest border-l border-on-background transform translate-x-full transition-transform duration-300 md:hidden flex flex-col pt-20 px-6 gap-6 font-label-caps text-label-caps tracking-widest">' +
    '<div>' +
    lnk('photography.html',
      'flex justify-between items-center pb-3 ' + (photo ? 'text-primary' : 'hover:text-primary transition-colors'),
      '<span>Photography</span><span class="font-cjk text-primary text-sm">摄影</span>'
    ) +
    '<div class="pl-3 flex flex-col gap-1 border-b border-on-background pb-4">' +
    mobileSubItem('photography-colorado.html',   'Colorado',   '科罗拉多', co) +
    mobileSubItem('photography-arizona.html',    'Arizona',    '亚利桑那', az) +
    mobileSubItem('photography-washington.html', 'Washington', '华盛顿',   wa) +
    mobileSubItem('photography-nature.html',     'Nature',     '自然',     nat) +
    mobileSubItem('photography-film.html',       'Film',       '胶片',     film) +
    '</div></div>' +
    mobileTopLink('video.html', 'Video', '视频', video) +
    mobileTopLink('art.html',   'Art',   '艺术', art) +
    mobileTopLink('about.html', 'About', '关于', about) +
    '<button id="theme-toggle-mobile" class="flex items-center justify-between border-b border-on-background pb-4 hover:text-primary transition-colors w-full text-left" style="color:var(--muted)">' +
    '<span class="theme-label">Dark Mode</span>' +
    '<span class="material-symbols-outlined theme-icon" style="font-size:18px;">dark_mode</span>' +
    '</button>' +
    lnk('contact.html',
      'flex items-center justify-between border border-on-surface px-4 py-3 mt-2 hover:bg-primary hover:text-white hover:border-primary transition-colors',
      '<span>Contact</span><span class="font-cjk text-xs">联系</span>',
      'color:var(--muted)'
    ) +
    '</div>' +

    '<div id="mobile-menu-overlay" class="fixed inset-0 bg-black/50 z-30 opacity-0 pointer-events-none transition-opacity duration-300 md:hidden"></div>';

  // ── Inject ───────────────────────────────────────────────────────
  var root = document.getElementById('nav-root');
  if (root) root.outerHTML = html;

  // ── Mobile menu ──────────────────────────────────────────────────
  var toggleBtn     = document.getElementById('mobile-menu-toggle');
  var mobileMenu    = document.getElementById('mobile-menu');
  var mobileOverlay = document.getElementById('mobile-menu-overlay');

  function openMenu() {
    mobileMenu.classList.remove('translate-x-full');
    mobileMenu.classList.add('translate-x-0');
    if (mobileOverlay) { mobileOverlay.classList.remove('opacity-0', 'pointer-events-none'); mobileOverlay.classList.add('opacity-100'); }
    toggleBtn.querySelector('.material-symbols-outlined').textContent = 'close';
  }
  function closeMenu() {
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

  // ── Theme toggle ─────────────────────────────────────────────────
  function updateThemeUI() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('.theme-icon').forEach(function (el) { el.textContent = dark ? 'light_mode' : 'dark_mode'; });
    document.querySelectorAll('.theme-label').forEach(function (el) { el.textContent = dark ? 'Light Mode' : 'Dark Mode'; });
  }
  updateThemeUI();

  function toggleTheme() {
    var html = document.documentElement;
    var isDark = html.getAttribute('data-theme') === 'dark';
    if (isDark) { html.removeAttribute('data-theme'); localStorage.setItem('co-theme', 'light'); }
    else { html.setAttribute('data-theme', 'dark'); localStorage.setItem('co-theme', 'dark'); }
    updateThemeUI();
    if (typeof window.onNavThemeChange === 'function') window.onNavThemeChange();
  }

  var themeBtn       = document.getElementById('theme-toggle');
  var themeBtnMobile = document.getElementById('theme-toggle-mobile');
  if (themeBtn)       themeBtn.addEventListener('click', toggleTheme);
  if (themeBtnMobile) themeBtnMobile.addEventListener('click', toggleTheme);

})();
