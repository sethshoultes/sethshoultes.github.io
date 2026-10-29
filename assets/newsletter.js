// Newsletter forms (#168): post to our own Worker, then say what happens next.
// On /library/?confirmed=1&dl=... (where the confirm email sends people) show the download.
(function () {
  'use strict';
  var API = 'https://news.sethshoultes.com';
  document.querySelectorAll('[data-news]').forEach(function (form) {
    var status = form.querySelector('.news-status');
    var button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.className = 'news-status';
      var email = form.elements.email.value.trim();
      if (!email || !form.elements.email.checkValidity()) { status.textContent = 'Please enter a valid email address.'; status.className = 'news-status err'; return; }
      if (!form.elements.consent.checked) { status.textContent = 'Please tick the box to say you want the emails.'; status.className = 'news-status err'; return; }
      button.disabled = true;
      status.textContent = 'Sending…';
      fetch(API + '/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: form.getAttribute('data-source'), consent: true, website: form.elements.website.value }),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
      }).then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Something went wrong. Please try again.');
        status.textContent = form.hasAttribute('data-ready') ? 'Check your inbox. I sent you a link to confirm your email, and the PDF comes with it.' : 'Check your inbox to confirm your email. I will send you the PDF the day it publishes.';
        status.className = 'news-status ok';
        form.elements.email.value = '';
        if (typeof gtag === 'function') gtag('event', 'newsletter_signup', { source: form.getAttribute('data-source') });
      }).catch(function (err) {
        status.textContent = err.message || 'Something went wrong. Please try again.';
        status.className = 'news-status err';
      }).then(function () { button.disabled = false; });
    });
  });

  var box = document.querySelector('[data-news-confirmed]');
  if (!box) return;
  var q = new URLSearchParams(location.search), dl = q.get('dl');
  // Only ever link to our own download host, whatever is in the address bar.
  if (q.get('confirmed') === '1') {
    var link = box.querySelector('[data-news-download]');
    if (dl && dl.indexOf(API + '/download?') === 0) { link.href = dl; link.hidden = false; box.querySelector('[data-news-wait]').hidden = true; }
    box.hidden = false;
    if (typeof gtag === 'function') gtag('event', 'newsletter_confirmed');
  }
})();
