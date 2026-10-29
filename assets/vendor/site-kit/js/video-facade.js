// Video facade: a poster image link that becomes the YouTube player when clicked. Without JS the link opens YouTube.
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a.video-facade');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  var id = a.getAttribute('data-video-id');
  if (!id) return;
  e.preventDefault();
  var f = document.createElement('iframe');
  f.src = 'https://www.youtube.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
  f.title = a.getAttribute('data-title') || 'Video';
  f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  f.allowFullscreen = true;
  var box = a.parentNode;
  box.replaceChild(f, a);
  box.classList.add('is-playing');
  f.focus();
});
