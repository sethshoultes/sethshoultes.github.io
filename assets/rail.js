// The "Play something" rail (#169): buttons, and a slow auto-advance that stops for
// prefers-reduced-motion, on hover or focus, when off-screen or the tab is hidden, and with the Pause button.
(function () {
  var rail = document.querySelector('[data-rail]');
  if (!rail) return;
  var track = rail.querySelector('[data-rail-track]');
  var pause = rail.querySelector('[data-rail-pause]');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var touch = matchMedia('(hover: none)'); // phones swipe; nothing moves by itself there, so no pause is needed
  var count = rail.querySelector('[data-rail-count]');
  var total = track.children.length;
  var step = function () { var li = track.firstElementChild; return li ? li.getBoundingClientRect().width + 20 : 300; };
  var go = function (dir) {
    var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    var atStart = track.scrollLeft <= 4;
    if (dir > 0 && atEnd) track.scrollTo({ left: 0, behavior: reduced.matches ? 'auto' : 'smooth' });
    else if (dir < 0 && atStart) track.scrollTo({ left: track.scrollWidth, behavior: reduced.matches ? 'auto' : 'smooth' });
    else track.scrollBy({ left: dir * step(), behavior: reduced.matches ? 'auto' : 'smooth' });
  };
  rail.querySelector('[data-rail-prev]').addEventListener('click', function () { go(-1); });
  rail.querySelector('[data-rail-next]').addEventListener('click', function () { go(1); });

  var paused = false, hover = false, visible = true, timer = 0;
  var still = function () { return reduced.matches || touch.matches; };
  var run = function () { return !still() && !paused && !hover && visible && !document.hidden; };
  var tick = function () { if (run()) go(1); };
  var sync = function () { clearInterval(timer); if (run()) timer = setInterval(tick, 4500); };
  pause.hidden = still();
  pause.addEventListener('click', function () { paused = !paused; pause.setAttribute('aria-pressed', paused); pause.textContent = paused ? 'Play' : 'Pause'; sync(); });
  ['mouseenter', 'focusin', 'touchstart'].forEach(function (e) { rail.addEventListener(e, function () { hover = true; sync(); }, { passive: true }); });
  ['mouseleave', 'focusout'].forEach(function (e) { rail.addEventListener(e, function () { hover = false; sync(); }); });
  new IntersectionObserver(function (en) { visible = en[0].isIntersecting; sync(); }).observe(rail);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', function () { pause.hidden = still(); sync(); });
  var where = function () {
    var i = Math.min(total, Math.round(track.scrollLeft / step()) + 1);
    count.textContent = i + ' of ' + total;
    rail.classList.toggle('at-end', track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
  };
  track.addEventListener('scroll', where, { passive: true });
  where();
  sync();
})();
