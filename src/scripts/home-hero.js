import { seekStills } from '@scripts/carousel-stills.js';

export function initHome() {
  // ── Infinite Room Carousel — single continuous loop ───────────────
  (function () {
    const trackBack = document.getElementById('carousel-track');
    const trackLeft = document.getElementById('carousel-track-left');
    const trackRight = document.getElementById('carousel-track-right');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    if (!trackBack) return;

    const floorTrack = document.getElementById('floor-carousel-track');
    const rightFloorTrack = document.getElementById('right-floor-track');
    const leftFloorTrack = document.getElementById('left-floor-track');

    const GAP = 32; // gap-8 = 32 px
    const NORMAL_SPEED = 2.5; // px / rAF tick at cruise
    const HOVER_SPEED = 0.5; // px / rAF tick while any panel is hovered
    const SPIN_LOOPS = 1;
    const RAMP_FRAMES = 6;
    const FAST_FRAMES = 9;
    const SLOW_FRAMES = 42;
    const SPEED_FACTOR = window.innerWidth < 768 ? 0.49 : 1;

    // masterOffset = track position visible at the RIGHT panel's inner edge.
    // Back wall and left panel offsets are derived from it each frame so that:
    //   right-panel inner edge  ≡  back-wall right edge   (same track pos)
    //   back-wall left edge     ≡  left-panel inner edge   (same track pos)
    let masterOffset = 0;
    let halfWidth = 0; // loop length (same for all three tracks)
    let W_back = 0; // back-wall container screen width
    let W_side = 0; // side-panel container CSS width (local space)
    let peakSpeed = 0;
    let hovering = false;
    let isDragging = false;
    let hasDragged = false;
    let dragLastX = 0;
    let dragStartX = 0;

    // Intro state machine
    let introPhase = 'ramp';
    let introFrame = 0;
    let spinPixels = 0;
    let spinTarget = 0;

    // ── Measurement ───────────────────────────────────────────────────
    function measureDimensions() {
      // Loop length from back track (all tracks share same card sizes)
      const items = trackBack.children;
      const half = Math.floor(items.length / 2);
      let w = 0;
      for (let i = 0; i < half; i++)
        w += items[i].getBoundingClientRect().width + GAP;
      halfWidth = w;
      spinTarget = halfWidth * SPIN_LOOPS;
      peakSpeed = halfWidth > 0 ? spinTarget / FAST_FRAMES : 18;

      // Panel container widths for offset derivation
      const backEl = document.getElementById('room-wall-back');
      const sideEl = document.getElementById('room-wall-left');
      W_back = backEl ? backEl.offsetWidth : 0;
      W_side = sideEl ? sideEl.offsetWidth : 0;
    }

    // ── Offset derivation ─────────────────────────────────────────────
    // Given masterOffset (= right panel inner edge track pos):
    //   back wall right edge  = masterOffset          → offsetBack  = masterOffset - W_back
    //   left panel inner edge = back wall left edge   → offsetLeft  = masterOffset - W_back - W_side
    function applyOffsets() {
      if (!halfWidth) return;
      const oR = masterOffset;
      const oB = (((masterOffset - W_back) % halfWidth) + halfWidth) % halfWidth;
      const oL =
        (((masterOffset - W_back - W_side) % halfWidth) + halfWidth) % halfWidth;
      if (trackRight) trackRight.style.transform = `translateX(-${oR}px)`;
      if (trackBack) trackBack.style.transform = `translateX(-${oB}px)`;
      if (trackLeft) trackLeft.style.transform = `translateX(-${oL}px)`;
      if (floorTrack) floorTrack.style.transform = `translateX(-${oB}px)`;
      if (rightFloorTrack)
        rightFloorTrack.style.transform = `translateX(-${oR}px)`;
      if (leftFloorTrack) leftFloorTrack.style.transform = `translateX(-${oL}px)`;
    }

    // ── Intro speed curve ─────────────────────────────────────────────
    function introSpeed() {
      if (introPhase === 'ramp') {
        const t = Math.min(1, introFrame / RAMP_FRAMES);
        return peakSpeed * (0.95 + 0.05 * Math.pow(2, 10 * (t - 1)));
      }
      if (introPhase === 'fast') return peakSpeed;
      if (introPhase === 'slow') {
        const t = Math.min(1, introFrame / SLOW_FRAMES);
        return peakSpeed - (peakSpeed - NORMAL_SPEED) * (1 - Math.pow(1 - t, 2));
      }
      return NORMAL_SPEED;
    }

    // ── Animation loop ────────────────────────────────────────────────
    function tick() {
      if (halfWidth > 0) {
        let spd;
        if (introPhase !== 'done') {
          introFrame++;
          spd = introSpeed();
          if (introPhase === 'ramp' && introFrame >= RAMP_FRAMES) {
            introPhase = 'fast';
            introFrame = 0;
            spinPixels = 0;
          } else if (introPhase === 'fast') {
            spinPixels += spd;
            if (spinPixels >= spinTarget) {
              introPhase = 'slow';
              introFrame = 0;
            }
          } else if (introPhase === 'slow' && introFrame >= SLOW_FRAMES) {
            introPhase = 'done';
          }
        } else {
          spd = isDragging
            ? 0
            : (hovering ? HOVER_SPEED : NORMAL_SPEED) * SPEED_FACTOR;
        }
        masterOffset += spd;
        if (masterOffset >= halfWidth) masterOffset -= halfWidth;
        applyOffsets();
      }
      requestAnimationFrame(tick);
    }

    // ── Jump (prev / next buttons) ────────────────────────────────────
    function jump(delta) {
      masterOffset =
        (((masterOffset + delta) % halfWidth) + halfWidth) % halfWidth;
      applyOffsets();
    }

    // ── Initialisation ────────────────────────────────────────────────
    window.addEventListener('load', () => {
      // Clone back-wall cards into side tracks before measuring
      if (trackLeft) trackLeft.innerHTML = trackBack.innerHTML;
      if (trackRight) trackRight.innerHTML = trackBack.innerHTML;

      // Populate floor reflections with same cards as their source tracks
      if (floorTrack) {
        floorTrack.innerHTML = trackBack.innerHTML;
        seekStills(floorTrack);
      }
      if (rightFloorTrack) {
        rightFloorTrack.innerHTML = trackBack.innerHTML;
        seekStills(rightFloorTrack);
      }
      if (leftFloorTrack) {
        leftFloorTrack.innerHTML = trackBack.innerHTML;
        seekStills(leftFloorTrack);
      }

      seekStills();

      measureDimensions();

      // Start masterOffset so card 0 is just entering from the right outer edge
      masterOffset = (((halfWidth - W_side) % halfWidth) + halfWidth) % halfWidth;
      applyOffsets();

      // Fade all containers in together (including floor reflection)
      [
        'carousel-container',
        'room-left-container',
        'room-right-container',
        'floor-reflection',
        'right-floor-reflection',
        'left-floor-reflection',
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.transition = 'opacity 1s ease';
        el.style.opacity = '1';
        setTimeout(() => {
          el.style.transition = '';
        }, 1100);
      });

      requestAnimationFrame(tick);
    });

    window.addEventListener('resize', () => {
      measureDimensions();
      applyOffsets();
    });

    // Block native drag/select inside the hero section
    const carouselStyle = document.createElement('style');
    carouselStyle.textContent =
      '#home-hero-section{cursor:grab;user-select:none;-webkit-user-select:none;touch-action:pan-y}' +
      '#home-hero-section *{user-select:none;-webkit-user-select:none;cursor:inherit!important}';
    document.head.appendChild(carouselStyle);

    // Per-wall hover tracking (slow-speed while hovering)
    const wallEls = [];
    ['room-wall-back', 'room-wall-left', 'room-wall-right'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      wallEls.push(el);
      el.addEventListener('mouseenter', () => {
        hovering = true;
      });
      el.addEventListener('mouseleave', () => {
        hovering = false;
      });
      el.addEventListener('dragstart', (e) => e.preventDefault());
    });

    // Drag on the full hero section so there are no seams between walls
    const heroSection = document.getElementById('home-hero-section');
    if (heroSection) {
      heroSection.addEventListener('dragstart', (e) => e.preventDefault());

      heroSection.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        isDragging = true;
        hasDragged = false;
        dragStartX = e.clientX;
        dragLastX = e.clientX;
        heroSection.setPointerCapture(e.pointerId);
        heroSection.style.cursor = 'grabbing';
        if (e.pointerType !== 'touch') e.preventDefault();
      });

      heroSection.addEventListener('pointermove', (e) => {
        if (!isDragging || !halfWidth) return;
        const dx = e.clientX - dragLastX;
        dragLastX = e.clientX;
        if (!hasDragged && Math.abs(e.clientX - dragStartX) > 5) {
          hasDragged = true;
          if (e.pointerType === 'touch') {
            const person = document.getElementById('hero-person');
            if (person) person.style.opacity = '0';
          }
        }
        masterOffset =
          (((masterOffset - dx) % halfWidth) + halfWidth) % halfWidth;
        applyOffsets();
      });

      heroSection.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        heroSection.style.cursor = 'grab';
        if (hasDragged && e.pointerType === 'touch') {
          const person = document.getElementById('hero-person');
          if (person) {
            const h = window.innerHeight;
            const y = window.scrollY || 0;
            person.style.opacity = String(Math.max(0, 1 - y / (h * 0.55)));
          }
        }
        if (hasDragged) {
          hasDragged = false;
          heroSection.addEventListener(
            'click',
            (ev) => {
              ev.stopPropagation();
              ev.preventDefault();
            },
            { capture: true, once: true },
          );
        }
      });

      heroSection.addEventListener('pointercancel', () => {
        isDragging = false;
        hasDragged = false;
        heroSection.style.cursor = 'grab';
      });
    }

    if (prevBtn)
      prevBtn.addEventListener('click', () => {
        jump(-(trackBack.children[0].getBoundingClientRect().width + GAP));
      });
    if (nextBtn)
      nextBtn.addEventListener('click', () => {
        jump(trackBack.children[0].getBoundingClientRect().width + GAP);
      });
  })();

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
    var backWall = document.getElementById('room-wall-back');
    var leftWall = document.getElementById('room-wall-left');
    var rightWall = document.getElementById('room-wall-right');
    var nameOverlay = document.getElementById('hero-name-overlay');
    var bgPhoto = document.getElementById('page-bg-photo');
    var floorR = document.getElementById('floor-reflection');
    var rightFloorR = document.getElementById('right-floor-reflection');
    var leftFloorR = document.getElementById('left-floor-reflection');
    var heroH = window.innerHeight;
    var backHover = false;
    var splitEnd = heroH; // panels fully gone when header reaches top of screen

    function updatePerson() {
      if (!person) return;
      var y = window.scrollY;
      person.style.transform = 'translateX(-50%) translateY(' + -y * 0.65 + 'px)';
      person.style.opacity = backHover ? 0 : Math.max(0, 1 - y / (heroH * 0.55));
    }

    function setVignette(on) {
      if (!nameOverlay) return;
      if (on) {
        nameOverlay.style.opacity = '0';
      } else {
        var p = Math.min(1, Math.max(0, (window.scrollY || 0) / splitEnd));
        nameOverlay.style.opacity = String(Math.max(0, 1 - p));
      }
    }

    if (backWall) {
      backWall.addEventListener('mouseenter', function () {
        backHover = true;
        updatePerson();
        setVignette(true);
      });
      backWall.addEventListener('mouseleave', function () {
        backHover = false;
        updatePerson();
        setVignette(false);
      });
    }

    window.addEventListener(
      'scroll',
      function () {
        updatePerson();
        var y = window.scrollY;
        var p = Math.min(1, Math.max(0, y / splitEnd));

        // Panel split: back slides up, left slides left, right slides right
        if (backWall) {
          backWall.style.transform = 'translateY(' + -p * 110 + 'vh)';
          backWall.style.opacity = String(1 - p);
        }
        if (leftWall) {
          leftWall.style.transform =
            'translateX(' + -p * 120 + 'vw) rotateY(72deg)';
          leftWall.style.opacity = String(1 - p);
        }
        if (rightWall) {
          rightWall.style.transform =
            'translateX(' + p * 120 + 'vw) rotateY(-72deg)';
          rightWall.style.opacity = String(1 - p);
        }
        // Floor reflections: slide with their panels and fade
        if (floorR) {
          floorR.style.transform = 'translateY(' + p * 110 + 'vh)';
          floorR.style.opacity = String(Math.max(0, 1 - p * 2));
        }
        if (rightFloorR) {
          rightFloorR.style.transform =
            'translateX(' + p * 120 + 'vw) rotateY(-72deg)';
          rightFloorR.style.opacity = String(Math.max(0, 1 - p * 2));
        }
        if (leftFloorR) {
          leftFloorR.style.transform =
            'translateX(' + -p * 120 + 'vw) rotateY(72deg)';
          leftFloorR.style.opacity = String(Math.max(0, 1 - p * 2));
        }
        // Name overlay fades with the panels
        if (nameOverlay && !backHover)
          nameOverlay.style.opacity = String(Math.max(0, 1 - p));

        // Header: slide up from 50px and fade in
        if (header) {
          var t = Math.min(1, Math.max(0, y / (heroH * 0.4)));
          header.style.opacity = t;
          header.style.transform = 'translateY(' + 50 * (1 - t) + 'px)';
        }

        // Header background: stays opaque until hero is off screen, then fades to ~10% opacity
        if (headerBg) {
          var bgAlpha = Math.max(
            0.1,
            1 - Math.max(0, (y - heroH * 0.5) / (heroH * 0.6)),
          );
          headerBg.style.opacity = bgAlpha;
        }

        // Background photo: only starts fading in once the carousel is fully off screen
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
    // Project the top and bottom of the side panels' inner (far) edge through
    // the CSS perspective transform to find where they actually appear on screen.
    //
    // Key: perspective-origin is 50% 40%, not 50% 50%, so the convergence
    // point is above center — must account for this or the back wall sits too low.
    //
    // Projection: y_screen = perspOriginY + (y_3d - perspOriginY) × scale
    //             scale    = perspective / (perspective + z_depth)
    //             z_depth  = panel_width_px × sin(rotateY_angle)
    var PERSP = 1000; // CSS perspective: 1000px
    var PERSP_ORIG_X = 0.5; // CSS perspective-origin: 50% 40%
    var PERSP_ORIG_Y = 0.4;
    var ANGLE = (72 * Math.PI) / 180; // rotateY(72deg)
    var WALL_W = 0.48; // side panel width: 48%
    var SIDE_TOP = 0.125; // side panel top: 12.5%
    var SIDE_BOT = 0.625; // side panel bottom: 12.5% + 50%
    var backWall = document.getElementById('room-wall-back');
    var floorReflect = document.getElementById('floor-reflection');
    var floorInner = document.getElementById('floor-inner');
    var rightFloor = document.getElementById('right-floor-reflection');
    var rightFloorInner = document.getElementById('right-floor-inner');
    var leftFloor = document.getElementById('left-floor-reflection');
    var leftFloorInner = document.getElementById('left-floor-inner');

    function sizeBackWall() {
      if (!backWall) return;
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var zDepth = vw * WALL_W * Math.sin(ANGLE);
      var scale = PERSP / (PERSP + zDepth);

      // Vertical: match the apparent height of the right panel at its inner (left) edge
      var oPY = vh * PERSP_ORIG_Y;
      var topScr = oPY + (vh * SIDE_TOP - oPY) * scale;
      var botScr = oPY + (vh * SIDE_BOT - oPY) * scale;

      // Horizontal: project the inner (far) edge x of each side panel.
      // Read actual panel offsets so shifts to left:/right: are reflected exactly.
      var oPX = vw * PERSP_ORIG_X;
      var leftEl = document.getElementById('room-wall-left');
      var leftFrac = -0.02; // fixed — back wall position independent of side panel offset
      var rightFrac = -0.02; // fixed — back wall position independent of side panel offset
      // Left panel: outer edge at (leftFrac * vw), inner edge = outer + WALL_W*cos(ANGLE)*vw
      // Right panel: outer edge at (1 - rightFrac) * vw, inner edge = outer - WALL_W*cos(ANGLE)*vw
      var x3dLeft = vw * (leftFrac + WALL_W * Math.cos(ANGLE));
      var x3dRight = vw * (1 - rightFrac - WALL_W * Math.cos(ANGLE));
      var xScrLeft = oPX + (x3dLeft - oPX) * scale;
      var xScrRight = oPX + (x3dRight - oPX) * scale;

      var leftPx = Math.round(xScrLeft) - 2;
      var rightPx = Math.round(xScrRight) + 2;
      backWall.style.left = leftPx + 'px';
      backWall.style.width = rightPx - leftPx + 'px';
      backWall.style.top = Math.round(topScr) + 'px';
      backWall.style.height = Math.round(botScr - topScr) + 'px';
      var reflGap = Math.round(vh * 0.025);
      // Use actual element position so CSS 100vh vs window.innerHeight (iOS address bar) can't misalign reflections
      var sideWallBot = leftEl
        ? leftEl.offsetTop + leftEl.offsetHeight
        : Math.round(vh * 0.625);
      var sideReflTop = sideWallBot + reflGap;
      var cornerY = Math.round(oPY + (sideReflTop - oPY) * scale);
      if (floorReflect) {
        var wallH = Math.round(botScr - topScr);
        var heroEl = document.getElementById('home-hero-section');
        var heroTop = heroEl ? heroEl.offsetTop : 0;
        floorReflect.style.left = leftPx + 'px';
        floorReflect.style.width = rightPx - leftPx + 'px';
        floorReflect.style.top = cornerY + heroTop + 'px';
        floorReflect.style.height = Math.round(wallH * 0.55) + 'px';
        if (floorInner) floorInner.style.height = wallH + 'px';
      }
      if (rightFloor || leftFloor) {
        var panelH = leftEl ? leftEl.offsetHeight : Math.round(vh * 0.5);
        var reflH = Math.round(panelH * 0.55);
        if (rightFloor) {
          rightFloor.style.top = sideReflTop + 'px';
          rightFloor.style.height = reflH + 'px';
          if (rightFloorInner) rightFloorInner.style.height = panelH + 'px';
        }
        if (leftFloor) {
          leftFloor.style.top = sideReflTop + 'px';
          leftFloor.style.height = reflH + 'px';
          if (leftFloorInner) leftFloorInner.style.height = panelH + 'px';
        }
      }
    }

    sizeBackWall();
    window.addEventListener('resize', sizeBackWall);
    window.addEventListener('load', function () {
      sizeBackWall();
      requestAnimationFrame(sizeBackWall);
    });
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
    var NORMAL_SPEED = 2.5 * SPEED_FACTOR;
    var HOVER_SPEED = 0.5 * SPEED_FACTOR;
    var RAMP_FRAMES = 6;
    var FAST_FRAMES = 9;
    var SLOW_FRAMES = 42;
    var SPIN_LOOPS = 1;

    var vertOffset = 0;
    var halfH = 0;
    var peakSpeed = 0;
    var hovering = false;
    var revealed = false;
    var isDraggingVert = false;
    var hasDraggedVert = false;
    var dragLastYVert = 0;
    var dragStartYVert = 0;
    var introPhase = 'idle';
    var introFrame = 0;
    var spinPixels = 0;

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
        wrap.style.display = 'block';
        wrap.style.right = '0px';
        var origW = window.innerWidth - 84 - 28; // original about width
        var newAboutW = Math.round(origW * 0.85); // 15% narrower
        var mobileCarW = window.innerWidth - newAboutW - 28;
        wrap.style.width = mobileCarW + 'px';
        aboutEl.style.maxWidth = newAboutW + 'px';
        aboutEl.style.width = newAboutW + 'px';
        return;
      }
      aboutEl.style.width = ''; // clear mobile width override
      var margin = 32; // px-8 — left margin of page content
      var vw = window.innerWidth;
      var contentW = vw - margin - margin; // space between both page edges
      /* Carousel: 80% of the right 40% of content minus the gap */
      var gap = Math.max(20, margin); // never less than 20 px between about and carousel
      var carW = Math.max(150, Math.floor((contentW * 0.4 - gap) * 0.8));
      if (carW < 150) {
        wrap.style.display = 'none';
        return;
      }
      wrap.style.display = 'block';
      wrap.style.width = carW + 'px';
      wrap.style.right = margin + 'px';
      /* About box: fills everything between left margin and carousel */
      aboutEl.style.maxWidth = contentW - carW - gap + 'px';
    }

    function measure() {
      halfH = track.offsetHeight / 2;
      peakSpeed = halfH > 0 ? (halfH * SPIN_LOOPS) / FAST_FRAMES : 18;
    }

    function introSpeed() {
      if (introPhase === 'ramp') {
        var t = Math.min(1, introFrame / RAMP_FRAMES);
        return peakSpeed * (0.95 + 0.05 * Math.pow(2, 10 * (t - 1)));
      }
      if (introPhase === 'fast') return peakSpeed;
      if (introPhase === 'slow') {
        var t = Math.min(1, introFrame / SLOW_FRAMES);
        return peakSpeed - (peakSpeed - NORMAL_SPEED) * (1 - Math.pow(1 - t, 2));
      }
      return NORMAL_SPEED;
    }

    function tick() {
      if (halfH > 0) {
        var spd = 0;
        if (introPhase === 'idle') {
          spd = 0;
        } else if (introPhase === 'done') {
          spd = isDraggingVert ? 0 : hovering ? HOVER_SPEED : NORMAL_SPEED;
        } else {
          introFrame++;
          spd = introSpeed();
          if (introPhase === 'ramp' && introFrame >= RAMP_FRAMES) {
            introPhase = 'fast';
            introFrame = 0;
            spinPixels = 0;
          } else if (introPhase === 'fast') {
            spinPixels += spd;
            if (spinPixels >= halfH * SPIN_LOOPS) {
              introPhase = 'slow';
              introFrame = 0;
            }
          } else if (introPhase === 'slow' && introFrame >= SLOW_FRAMES) {
            introPhase = 'done';
          }
        }
        if (spd > 0) {
          vertOffset = (vertOffset + spd) % halfH;
          track.style.transform = 'translateY(-' + vertOffset.toFixed(2) + 'px)';
        }
      }
      requestAnimationFrame(tick);
    }

    var heroH = window.innerHeight;

    function checkReveal() {
      var y = window.scrollY || window.pageYOffset;
      if (!revealed && y >= heroH) {
        revealed = true;
        wrap.style.transform = 'translateX(0)';
        wrap.style.opacity = '1';
        wrap.style.pointerEvents = 'auto';
        wrap.removeAttribute('aria-hidden');
        if (introPhase === 'idle') {
          introPhase = 'ramp';
          introFrame = 0;
        }
      } else if (revealed && y < heroH * 0.85) {
        revealed = false;
        wrap.style.transform = 'translateX(110%)';
        wrap.style.opacity = '0';
        wrap.style.pointerEvents = 'none';
        wrap.setAttribute('aria-hidden', 'true');
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
