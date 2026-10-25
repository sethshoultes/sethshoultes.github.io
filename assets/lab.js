/* Scroll-scrubbed video for /lab/ prototypes.
   The poster shows first. The clip loads after the page is usable, and only
   when the visitor has not asked for reduced motion. */
(function () {
  var stage = document.querySelector('.scrub-stage');
  var track = document.querySelector('.scrub');
  if (!stage || !track) return;
  var video = stage.querySelector('video');
  if (!video) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var target = 0, current = 0, duration = 0, ticking = false;

  function progress() {
    var r = track.getBoundingClientRect();
    var max = r.height - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, -r.top / max)) : 0;
  }
  function frame() {
    current += (target - current) * 0.12;
    if (Math.abs(target - current) < 0.0004) current = target;
    if (video.readyState >= 2 && !video.seeking) video.currentTime = current * duration;
    if (current !== target) requestAnimationFrame(frame); else ticking = false;
  }
  function onScroll() {
    target = progress();
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }
  function start() {
    var sources = JSON.parse(video.getAttribute('data-sources'));
    sources.forEach(function (s) {
      var el = document.createElement('source');
      el.src = s.src; el.type = s.type;
      video.appendChild(el);
    });
    video.addEventListener('loadedmetadata', function () {
      duration = video.duration;
      stage.classList.add('ready');
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      onScroll();
    });
    video.load();
  }
  function whenIdle() {
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2500 }); else setTimeout(start, 800);
  }
  if (document.readyState === 'complete') whenIdle(); else window.addEventListener('load', whenIdle);
})();
