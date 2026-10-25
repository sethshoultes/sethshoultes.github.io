/* Scroll-driven video for /lab/ prototypes.
   The poster shows first. The clip loads after the page is usable, then plays
   on its own. The first scroll takes over: scroll position sets the frame.
   Reduced motion never loads the clip. */
(function () {
  var stage = document.querySelector('.scrub-stage');
  var track = document.querySelector('.scrub');
  var btn = document.querySelector('.lab-play');
  if (!stage || !track) return;
  var video = stage.querySelector('video');
  if (!video) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var target = 0, current = 0, duration = 0, ticking = false;
  var auto = true;      // the clip is allowed to play on its own
  var scrolled = false; // the visitor has taken over by scrolling

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
    if (!scrolled) {
      scrolled = true;
      video.pause();
      current = video.currentTime / duration;
    }
    target = progress();
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }
  function setPressed(paused) {
    btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    btn.setAttribute('aria-label', paused ? 'Play the scene' : 'Pause the scene');
  }
  function play() {
    var p = video.play();
    if (p && p.catch) p.catch(function () { auto = false; setPressed(true); });
  }
  function onButton() {
    auto = !auto;
    setPressed(!auto);
    if (!auto) { video.pause(); return; }
    // Resume from where the video is; scrolling still takes over again.
    scrolled = false;
    play();
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
      window.addEventListener('resize', function () { target = progress(); });
      if (btn) { btn.hidden = false; btn.addEventListener('click', onButton); }
      // Begin from where the page is: the top, or wherever the visitor already scrolled.
      if (window.scrollY > 10) { scrolled = true; current = target = progress(); video.currentTime = current * duration; }
      else play();
    });
    video.load();
  }
  function whenIdle() {
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2500 }); else setTimeout(start, 800);
  }
  if (document.readyState === 'complete') whenIdle(); else window.addEventListener('load', whenIdle);
})();
