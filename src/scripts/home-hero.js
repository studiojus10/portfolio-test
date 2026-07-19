import { seekStills } from '@scripts/carousel-stills.js';
import { initCylinder } from '@scripts/home-cylinder.js';

export function initHome() {
  initCylinder();

  /* Home-page only: reveal nav after page load + typing animation both complete */
  (function () {
    var pageLoaded = false,
      typingDone = false;
    function tryReveal() {
      if (!pageLoaded || !typingDone) return;
      if (typeof window._navReveal === 'function') window._navReveal();
      var sub = document.getElementById('hero-subtitle');
      if (sub) sub.style.opacity = '1';
    }
    window.addEventListener('load', function () {
      pageLoaded = true;
      tryReveal();
    });
    window._onHeroTypingDone = function () {
      typingDone = true;
      tryReveal();
    };
  })();

  (function () {
    var person = document.getElementById('hero-person');
    var header = document.getElementById('home-hero-header');
    var headerBg = document.getElementById('hero-header-bg');
    var nameOverlay = document.getElementById('hero-name-overlay');
    var bgPhoto = document.getElementById('page-bg-photo');
    var heroH = window.innerHeight;

    function updatePerson() {
      if (!person) return;
      var y = window.scrollY;
      person.style.transform =
        'translateX(-50%) translateY(' + -y * 0.65 + 'px)';
      person.style.opacity = Math.max(0, 1 - y / (heroH * 0.55));
    }

    window.addEventListener(
      'scroll',
      function () {
        updatePerson();
        var y = window.scrollY;
        var p = Math.min(1, Math.max(0, y / heroH));

        // The cylinder stays a cylinder — it just scrolls off with the hero
        // section (no transform/fade), so its 3D never gets distorted.

        // Name overlay fades with the hero
        if (nameOverlay) nameOverlay.style.opacity = String(Math.max(0, 1 - p));

        // Header: slide up from 50px and fade in
        if (header) {
          var t = Math.min(1, Math.max(0, y / (heroH * 0.4)));
          header.style.opacity = t;
          header.style.transform = 'translateY(' + 50 * (1 - t) + 'px)';
        }

        // Header background: opaque until hero off screen, then fades to ~10%
        if (headerBg) {
          var bgAlpha = Math.max(
            0.1,
            1 - Math.max(0, (y - heroH * 0.5) / (heroH * 0.6)),
          );
          headerBg.style.opacity = bgAlpha;
        }

        // Background photo: fades in once the cylinder is off screen
        if (bgPhoto) {
          var bgT = Math.min(1, Math.max(0, (y - heroH) / (heroH * 0.6)));
          bgPhoto.style.opacity = bgT;
        }
      },
      { passive: true },
    );
  })();

  (function () {
    // Seek carousel video stills to a fixed frame — no play
    seekStills();
  })();

  (function () {
    document.querySelectorAll('.card-thumb-video').forEach(function (vid) {
      vid.addEventListener('loadedmetadata', function () {
        vid.currentTime = 5;
      });
      var card = vid.closest('a') || vid.parentElement;
      card.addEventListener('mouseenter', function () {
        vid.currentTime = 5;
        vid.play();
      });
      card.addEventListener('mouseleave', function () {
        vid.pause();
        vid.currentTime = 5;
      });
    });
  })();

  (function () {
    var el = document.getElementById('hero-typewriter-name');
    if (!el) return;

    el.textContent = 'Justin Hughes';
    el.style.display = 'block';
    el.style.minHeight = el.offsetHeight + 'px';
    el.textContent = '';

    var steps = [
      { action: 'type', text: 'Jus10', speed: 108 },
      { action: 'pause', duration: 700 },
      { action: 'delete', count: 2, speed: 84 },
      { action: 'pause', duration: 120 },
      { action: 'type', text: 'tin Hughes', speed: 102 },
    ];

    var current = '';
    var stepIdx = 0;
    var charIdx = 0;

    function run() {
      if (stepIdx >= steps.length) {
        if (typeof window._onHeroTypingDone === 'function')
          window._onHeroTypingDone();
        return;
      }
      var step = steps[stepIdx];

      if (step.action === 'type') {
        if (charIdx < step.text.length) {
          current += step.text[charIdx++];
          el.textContent = current;
          setTimeout(run, step.speed);
        } else {
          stepIdx++;
          charIdx = 0;
          run();
        }
      } else if (step.action === 'delete') {
        if (charIdx < step.count) {
          current = current.slice(0, -1);
          el.textContent = current;
          charIdx++;
          setTimeout(run, step.speed);
        } else {
          stepIdx++;
          charIdx = 0;
          run();
        }
      } else if (step.action === 'pause') {
        stepIdx++;
        charIdx = 0;
        setTimeout(run, step.duration);
      }
    }

    window.addEventListener('load', function () {
      setTimeout(run, 400);
    });
  })();

  (function () {
    // Dismiss the page loader once everything (images, fonts, scripts) is ready
    window.addEventListener('load', function () {
      var loader = document.getElementById('page-loader');
      if (!loader) return;
      loader.style.opacity = '0';
      setTimeout(function () {
        loader.remove();
      }, 550);
    });
  })();

  /* ── Vertical side carousel ──────────────────────────────────────── */
  (function () {
    var wrap = document.getElementById('vert-carousel-wrap');
    var track = document.getElementById('vert-track');
    if (!wrap || !track) return;

    var SPEED_FACTOR = window.innerWidth < 768 ? 0.49 : 1;
    var NORMAL_SPEED = 80 * SPEED_FACTOR; // px / sec (time-based)
    var HOVER_SPEED = 18 * SPEED_FACTOR; // px / sec

    var vertOffset = 0;
    var halfH = 0;
    var hovering = false;
    var revealed = false;
    var isDraggingVert = false;
    var hasDraggedVert = false;
    var dragLastYVert = 0;
    var dragStartYVert = 0;
    var started = false;

    /* Size carousel and about box so all three margins (left edge, gap, right edge)
       equal the page's px-8 = 32 px left margin */
    function positionWrap() {
      var aboutEl = document.getElementById('about');
      if (!aboutEl) {
        wrap.style.display = 'none';
        return;
      }
      var mobile = window.innerWidth < 768;
      if (mobile) {
        // On a phone the fixed side strip would eat ~40% of the screen and
        // squeeze About into an unreadable column, so hide it entirely and let
        // About use the full content width.
        wrap.style.display = 'none';
        aboutEl.style.maxWidth = '';
        aboutEl.style.width = '';
        return;
      }
      aboutEl.style.width = ''; // clear mobile width override
      // The About section lives inside `main`, which is capped at max-width:1400
      // and centred. The carousel must anchor to that content column's right
      // edge — not the viewport edge — or on wide screens it drifts out past the
      // column and overlaps the floated portrait.
      var MAXW = 1400; // keep in sync with `main { max-width }` in site.css
      var margin = 32; // px-8 — inner padding of the content column
      var vw = window.innerWidth;
      var colW = Math.min(vw, MAXW); // actual content column width
      var sideMargin = (vw - colW) / 2; // viewport edge → content column
      var contentW = colW - margin - margin; // usable width inside the column
      /* Carousel: 80% of the right 40% of content minus the gap */
      var gap = Math.max(20, margin); // never less than 20 px between about and carousel
      var carW = Math.max(150, Math.floor((contentW * 0.4 - gap) * 0.8));
      // Hide the strip if it (or the About column it leaves) would get too tight.
      if (carW < 150 || contentW - carW - gap < 300) {
        wrap.style.display = 'none';
        aboutEl.style.maxWidth = '';
        return;
      }
      wrap.style.display = 'block';
      wrap.style.width = carW + 'px';
      wrap.style.right = sideMargin + margin + 'px'; // align to the column's right edge
      /* About box: fills everything between left margin and carousel */
      aboutEl.style.maxWidth = contentW - carW - gap + 'px';
    }

    function measure() {
      halfH = track.offsetHeight / 2;
    }

    var lastV = 0;
    function tick(t) {
      var dt = lastV ? Math.min(0.05, (t - lastV) / 1000) : 0;
      lastV = t;
      if (halfH > 0 && started) {
        var spd = isDraggingVert ? 0 : hovering ? HOVER_SPEED : NORMAL_SPEED;
        if (spd > 0) {
          vertOffset = (vertOffset + spd * dt) % halfH;
          track.style.transform = 'translateY(-' + vertOffset.toFixed(2) + 'px)';
        }
      }
      window.__vert = {
        state: function () {
          return { offset: vertOffset };
        },
      };
      requestAnimationFrame(tick);
    }

    var heroH = window.innerHeight;

    function checkReveal() {
      // The side strip is hidden on phones (see positionWrap) — never reveal it.
      if (window.innerWidth < 768) return;
      // Reveal once the About section scrolls up into the viewport. The old
      // `scrollY >= heroH` threshold was unreachable whenever the post-hero
      // content was shorter than one screen (typical on tall viewports), so the
      // carousel could never appear. Anchoring to About's position makes it
      // reliably reachable at any viewport height.
      var aboutEl = document.getElementById('about');
      var heroEl = document.getElementById('home-hero-section');
      var vh = window.innerHeight;
      var top = aboutEl
        ? aboutEl.getBoundingClientRect().top
        : (window.scrollY || window.pageYOffset) - heroH * 0.5;
      if (!revealed && top < vh * 0.6) {
        revealed = true;
        wrap.style.transform = 'translateX(0)';
        wrap.style.opacity = '1';
        wrap.style.pointerEvents = 'auto';
        wrap.removeAttribute('aria-hidden');
        started = true;
        // Fade the cylinder hero out so it and the side carousel are never both
        // on screen (their reveal windows would otherwise overlap by a sliver).
        if (heroEl) heroEl.style.opacity = '0';
      } else if (revealed && top > vh * 0.85) {
        revealed = false;
        wrap.style.transform = 'translateX(110%)';
        wrap.style.opacity = '0';
        wrap.style.pointerEvents = 'none';
        wrap.setAttribute('aria-hidden', 'true');
        if (heroEl) heroEl.style.opacity = '1';
      }
    }

    window.addEventListener('scroll', checkReveal, { passive: true });

    wrap.style.cursor = 'grab';
    wrap.addEventListener('mouseenter', function () {
      hovering = true;
    });
    wrap.addEventListener('mouseleave', function () {
      hovering = false;
      isDraggingVert = false;
      document.body.style.cursor = '';
    });
    wrap.addEventListener('mousedown', function (e) {
      isDraggingVert = true;
      hasDraggedVert = false;
      dragStartYVert = e.clientY;
      dragLastYVert = e.clientY;
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    });
    wrap.addEventListener(
      'touchstart',
      function (e) {
        isDraggingVert = true;
        hasDraggedVert = false;
        dragStartYVert = e.touches[0].clientY;
        dragLastYVert = e.touches[0].clientY;
      },
      { passive: true },
    );

    document.addEventListener('mousemove', function (e) {
      if (!isDraggingVert || !halfH) return;
      var dy = e.clientY - dragLastYVert;
      dragLastYVert = e.clientY;
      if (Math.abs(e.clientY - dragStartYVert) > 5) hasDraggedVert = true;
      vertOffset = (((vertOffset - dy) % halfH) + halfH) % halfH;
      track.style.transform = 'translateY(-' + vertOffset.toFixed(2) + 'px)';
    });

    document.addEventListener('mouseup', function () {
      if (!isDraggingVert) return;
      isDraggingVert = false;
      document.body.style.cursor = '';
      if (hasDraggedVert) {
        hasDraggedVert = false;
        document.addEventListener(
          'click',
          function suppress(e) {
            document.removeEventListener('click', suppress, { capture: true });
            if (wrap.contains(e.target)) {
              e.stopPropagation();
              e.preventDefault();
            }
          },
          { capture: true },
        );
      }
    });

    document.addEventListener(
      'touchmove',
      function (e) {
        if (!isDraggingVert || !halfH) return;
        e.preventDefault();
        var dy = e.touches[0].clientY - dragLastYVert;
        dragLastYVert = e.touches[0].clientY;
        vertOffset = (((vertOffset - dy) % halfH) + halfH) % halfH;
        track.style.transform = 'translateY(-' + vertOffset.toFixed(2) + 'px)';
      },
      { passive: false },
    );

    document.addEventListener('touchend', function () {
      isDraggingVert = false;
      hasDraggedVert = false;
    });

    window.addEventListener('DOMContentLoaded', function () {
      /* Clone the 15 cards to create a seamless 30-card loop */
      var origCards = Array.from(track.children);
      origCards.forEach(function (card) {
        var clone = card.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('tabindex', '-1');
        track.appendChild(clone);
      });
      /* Seek all vertical carousel video stills */
      seekStills(track);
    });

    window.addEventListener('load', function () {
      positionWrap();
      requestAnimationFrame(function () {
        measure();
        requestAnimationFrame(tick);
      });
    });

    window.addEventListener('resize', function () {
      heroH = window.innerHeight;
      positionWrap();
      requestAnimationFrame(function () {
        measure();
      });
    });
  })();
}
