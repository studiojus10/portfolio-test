export function initScrollProgress() {
  var rail = document.getElementById('scroll-rail');
  if (!rail) return;

  var max = 0;         // scrollable px; 0 means the page doesn't scroll
  var pending = false; // one paint per frame, not one per scroll event

  function measure() {
    max = document.documentElement.scrollHeight - window.innerHeight;
    if (max < 1) max = 0;
    // Hidden rather than removed: there is nothing to indicate on a page
    // that fits, but the element must stay for the next measure().
    rail.classList.toggle('opacity-0', max === 0);
  }

  function paint() {
    pending = false;
    var p = max === 0 ? 0 : (window.scrollY || window.pageYOffset) / max;
    // Clamp: iOS rubber-banding and scroll-smooth overshoot both run past
    // the ends, and a scaleX above 1 would spill the rail past the nav.
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    // Inline transform deliberately overrides the `scale-x-0` utility that
    // holds the no-JS initial state; both agree at p = 0, so nothing jumps.
    rail.style.transform = 'scaleX(' + p + ')';
  }

  function schedule() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(paint);
  }

  function remeasure() {
    measure();
    schedule();
  }

  window.addEventListener('scroll', schedule, { passive: true });

  // Catches the document growing under us — gallery images decoding, fonts
  // swapping in. <html> has no intrinsic height in standards mode, so its
  // content box tracks the document's height.
  new ResizeObserver(remeasure).observe(document.documentElement);

  // ResizeObserver does NOT cover a viewport height change on its own: when
  // content is taller than the viewport, <html>'s box is the content height
  // and doesn't move, but `max` does. Mobile URL-bar collapse hits this.
  window.addEventListener('resize', remeasure, { passive: true });

  // Paint once at init so a page restored mid-scroll by the browser's scroll
  // restoration is correct on the first frame rather than the first scroll.
  measure();
  paint();
}
