(function () {
  'use strict';

  var ENDPOINT = 'https://tools-api.sethshoultes.com/llms-txt';
  var form = document.getElementById('llms-form');
  var go = document.getElementById('llms-go');
  var box = document.getElementById('llms-result');
  var title = document.getElementById('llms-title');
  var status = document.getElementById('llms-status');
  var pre = document.getElementById('llms-code');
  var out = document.getElementById('llms-output');
  var note = document.getElementById('llms-note');
  var cp = document.getElementById('llms-cp');
  var copyBtn = document.getElementById('llms-copy');
  var dlBtn = document.getElementById('llms-download');
  var text = '';

  function track(name) {
    if (typeof gtag === 'function') gtag('event', name, { tool_name: 'llms-txt-generator' });
  }

  function reset() {
    text = '';
    pre.hidden = true;
    note.hidden = true;
    cp.hidden = true;
    copyBtn.disabled = true;
    dlBtn.disabled = true;
    status.className = 'tool-status';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form));
    go.disabled = true;
    box.hidden = false;
    reset();
    status.textContent = 'Reading your sitemap and pages. This can take up to half a minute.';
    track('tool_use');
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok) throw new Error(body.error || 'The tool failed. Please try again.');
          return body;
        });
      })
      .then(function (d) {
        if (!d.site) { status.textContent = ''; return; }
        if (d.error) { status.className = 'tool-status tool-status-err'; status.textContent = d.error; return; }
        text = d.llms;
        status.textContent = '';
        title.textContent = 'Your llms.txt for ' + d.site.replace(/^https?:\/\//, '');
        out.textContent = text;
        pre.hidden = false;
        copyBtn.disabled = false;
        dlBtn.disabled = false;
        var parts = ['Built from ' + d.counts.sitemapUrls + ' sitemap addresses; ' + d.counts.listed + ' pages listed.'];
        if (d.counts.skipped) parts.push(d.counts.skipped + ' page(s) could not be read and were left out.');
        if (!d.homeDescription) parts.push('Your home page has no description, so the summary line is missing. Add one by hand.');
        parts.push('Read it through before you upload it. Save it as llms.txt at the top of your site.');
        note.textContent = parts.join(' ');
        note.hidden = false;
        cp.hidden = false;
      })
      .catch(function (err) {
        status.className = 'tool-status tool-status-err';
        status.textContent = err.message && err.message !== 'Failed to fetch' ? err.message : 'We could not reach the tool. Please try again in a minute.';
      })
      .then(function () { go.disabled = false; });
  });

  copyBtn.addEventListener('click', function () {
    function done(ok) {
      status.className = 'tool-status';
      status.textContent = ok ? 'Copied.' : 'Your browser blocked copying. Select the text and copy it by hand.';
      if (ok) track('tool_copy');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
      done(false);
    }
  });

  dlBtn.addEventListener('click', function () {
    var url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = 'llms.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    track('tool_download');
  });
})();
