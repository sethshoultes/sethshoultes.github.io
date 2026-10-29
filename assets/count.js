// Number counters (#165): a number counts up once, when it scrolls into view. The finished number is
// already in the HTML, so without JavaScript, and under prefers-reduced-motion, nothing moves.
(function () {
  'use strict';
  var els = document.querySelectorAll('.cs-count[data-count]');
  if (!els.length || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      var el = en.target, end = Number(el.getAttribute('data-count')), t0 = performance.now(), dur = 1100;
      var step = function (now) {
        var p = Math.min(1, (now - t0) / dur);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      el.textContent = '0';
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  els.forEach(function (el) { io.observe(el); });
})();
