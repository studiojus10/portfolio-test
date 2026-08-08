export function initScrollCue() {
  var cue = document.getElementById('scroll-cue');
  if (!cue) return;

  // Past this many px the reader has demonstrably scrolled. A bare
  // `scrollY > 0` would let trackpad jitter, or the browser restoring a
  // scroll position on reload, dismiss the cue before it has been seen.
  var DISMISS_AT = 24;

  var dismissed = false;
  var observer = null;

  function show() {
    cue.classList.remove('opacity-0', 'invisible', 'pointer-events-none');
  }

  function hide() {
    cue.classList.add('opacity-0', 'invisible', 'pointer-events-none');
  }

  function scrollY() {
    return window.scrollY || window.pageYOffset;
  }

  function sync() {
    if (dismissed) return;
    if (document.documentElement.scrollHeight - window.innerHeight > DISMISS_AT)
      show();
    else hide();
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    hide();
    // Nothing can bring the cue back for this page view, so stop listening
    // rather than keeping a live handler that only ever returns early.
    window.removeEventListener('scroll', onScroll);
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function onScroll() {
    if (scrollY() > DISMISS_AT) dismiss();
  }

  cue.addEventListener('click', function () {
    var reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    window.scrollBy({
      top: window.innerHeight,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    // <html> carries `scroll-smooth`, so the scroll above animates and
    // onScroll would dismiss on the way. Dismiss here too: a reader whose
    // scroll-behavior resolves to instant would otherwise see one frame of
    // the cue still up over the new screen.
    dismiss();
  });

  window.addEventListener('scroll', onScroll, { passive: true });

  // A page can become scrollable after load — gallery images decoding, fonts
  // swapping in. <html> has no intrinsic height in standards mode, so its
  // content box tracks the document's height.
  observer = new ResizeObserver(sync);
  observer.observe(document.documentElement);

  // A reload that restores a mid-page scroll position must never show the
  // cue: that reader has already scrolled.
  if (scrollY() > DISMISS_AT) dismiss();
  else sync();
}
