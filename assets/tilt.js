// Cartridge tilt (#165): game cards on /projects/ lean toward the cursor like a cartridge in your hand.
// Pointer devices only (hover: hover), never under prefers-reduced-motion. It sets two CSS variables on the
// card; the transform itself lives in assets/tilt.css. Nothing loads or moves for touch.
(function () {
  'use strict';
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var MAX = 7; // degrees
  document.querySelectorAll('.game-card').forEach(function (card) {
    var raf = 0;
    card.addEventListener('pointermove', function (e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--tilt-x', (-y * MAX).toFixed(2) + 'deg');
        card.style.setProperty('--tilt-y', (x * MAX).toFixed(2) + 'deg');
        card.classList.add('is-tilting');
      });
    });
    card.addEventListener('pointerleave', function () {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      card.classList.remove('is-tilting');
      card.style.removeProperty('--tilt-x');
      card.style.removeProperty('--tilt-y');
    });
  });
})();
