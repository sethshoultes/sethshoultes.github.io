(function () {
  'use strict';

  var ENDPOINT = 'https://tools-api.sethshoultes.com/ai-knows-you';
  var form = document.getElementById('know-form');
  var go = document.getElementById('know-go');
  var box = document.getElementById('know-result');
  var title = document.getElementById('know-title');
  var status = document.getElementById('know-status');
  var list = document.getElementById('know-list');
  var note = document.getElementById('know-note');
  var cta = document.getElementById('know-cta');

  function track(name) {
    if (typeof gtag === 'function') gtag('event', name, { tool_name: 'does-ai-know-your-business' });
  }

  function add(r, business) {
    var li = document.createElement('li');
    var unclear = r.state === 'answered' && r.named === null;
    var state = r.state !== 'answered' || unclear ? 'unknown' : r.named ? 'ok' : 'bad';
    li.className = 'tool-check tool-check-' + state;
    var badge = document.createElement('span');
    badge.className = 'tool-badge';
    badge.textContent = r.state !== 'answered' ? 'No answer' : unclear ? "Can't tell" : r.named ? 'Named' : 'Not named';
    var h = document.createElement('strong');
    h.textContent = r.label;
    li.appendChild(badge);
    li.appendChild(h);
    var p = document.createElement('p');
    if (r.state !== 'answered') {
      p.textContent = r.error || 'It could not answer.';
    } else if (unclear) {
      p.textContent = 'This answer did not come with a clear list of business names, so we cannot say whether ' + business + ' is in it. Read the answer below.';
    } else if (r.named) {
      p.textContent = business + ' is on its list.';
    } else {
      p.textContent = business + ' is not on its list.';
    }
    li.appendChild(p);
    if (r.state === 'answered') {
      if (!unclear) {
        var who = document.createElement('p');
        who.textContent = r.others.length ? 'Named instead: ' + r.others.join(', ') + '.' : 'No other businesses were named.';
        li.appendChild(who);
      }
      var d = document.createElement('details');
      var s = document.createElement('summary');
      s.textContent = 'Read the full answer';
      var body = document.createElement('p');
      body.className = 'tool-wrap';
      body.textContent = r.answer;
      d.appendChild(s);
      d.appendChild(body);
      li.appendChild(d);
    }
    list.appendChild(li);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form));
    go.disabled = true;
    box.hidden = false;
    list.innerHTML = '';
    note.hidden = true;
    cta.hidden = true;
    title.textContent = 'What they said';
    status.className = 'tool-status';
    status.textContent = 'Asking three assistants. This takes about 20 seconds.';
    track('tool_use');
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok) throw new Error(body.error || 'The check failed. Please try again.');
          return body;
        });
      })
      .then(function (d) {
        if (!d.results) { status.textContent = ''; return; }
        status.textContent = '';
        var named = d.results.filter(function (r) { return r.named === true; }).length;
        var clear = d.results.filter(function (r) { return r.state === 'answered' && r.named !== null; }).length;
        title.textContent = clear
          ? d.business + ' is named by ' + named + ' of ' + clear + ' assistants we could read, for "' + d.service + '" in ' + d.city
          : 'We could not read a clear list from any assistant for "' + d.service + '" in ' + d.city;
        d.results.forEach(function (r) { add(r, d.business); });
        note.hidden = false;
        cta.hidden = false;
      })
      .catch(function (err) {
        status.className = 'tool-status tool-status-err';
        status.textContent = err.message && err.message !== 'Failed to fetch' ? err.message : 'We could not reach the checker. Please try again in a minute.';
      })
      .then(function () { go.disabled = false; });
  });
})();
