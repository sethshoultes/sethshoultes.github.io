(function () {
  'use strict';

  var ENDPOINT = 'https://tools-api.sethshoultes.com/crawler-check';
  var form = document.getElementById('crawl-form');
  var go = document.getElementById('crawl-go');
  var box = document.getElementById('crawl-result');
  var title = document.getElementById('crawl-title');
  var status = document.getElementById('crawl-status');
  var list = document.getElementById('crawl-list');
  var cp = document.getElementById('crawl-cp');

  function track(name) {
    if (typeof gtag === 'function') gtag('event', name, { tool_name: 'ai-crawler-access-check' });
  }

  function item(state, heading, detail, fix, label) {
    var li = document.createElement('li');
    li.className = 'tool-check tool-check-' + state;
    var badge = document.createElement('span');
    badge.className = 'tool-badge';
    badge.textContent = label || { ok: 'Open', warn: 'Partly', bad: 'Missing', block: 'Blocked', unknown: 'Unknown' }[state];
    var h = document.createElement('strong');
    h.textContent = heading;
    li.appendChild(badge);
    li.appendChild(h);
    [detail, fix].forEach(function (text) {
      if (!text) return;
      var p = document.createElement('p');
      p.textContent = text;
      li.appendChild(p);
    });
    list.appendChild(li);
  }

  function renderBots(robots) {
    if (robots.state === 'unreadable') {
      item('unknown', 'robots.txt', 'We could not read it. ' + (robots.error || ''), 'Try again in a few minutes.');
    } else if (robots.state === 'missing') {
      item('ok', 'robots.txt', 'No robots.txt was found, so nothing tells AI crawlers to stay out.');
    } else {
      robots.bots.forEach(function (b) {
        var rules = b.rules.length ? ' Rule found: ' + b.rules.join('; ') + '.' : '';
        if (b.status === 'allowed') item('ok', b.name + ' (' + b.owner + ')', 'Allowed. This crawler may read your whole site.');
        else if (b.status === 'partial') item('warn', b.name + ' (' + b.owner + ')', 'Allowed to read your pages, but some paths are closed.' + rules);
        else item('block', b.name + ' (' + b.owner + ')', 'Blocked from your whole site.' + rules, 'If you want this assistant to recommend you, ask whoever manages your site to remove that rule.');
      });
    }
  }

  function renderRest(d) {
    var l = d.llms;
    if (l.state === 'found') item('ok', 'llms.txt', 'Found (' + l.bytes + ' characters). It starts: ' + l.firstLine, null, 'Found');
    else if (l.state === 'missing') item('bad', 'llms.txt', 'No llms.txt was found.', 'A plain file at the top of your site that tells AI assistants what you do and where to look.');
    else item('unknown', 'llms.txt', 'We could not check it. ' + (l.error || ''));

    var m = d.markdown;
    if (m.state === 'found') item('ok', 'Markdown version', m.how, null, 'Found');
    else if (m.state === 'missing') item('bad', 'Markdown version', 'No markdown version of your home page was found.', 'A clean text copy of a page is easy for AI to read.');
    else item('unknown', 'Markdown version', 'We could not check it. ' + (m.error || ''));

    var j = d.jsonld;
    if (j.state === 'found') item('ok', 'JSON-LD', 'Found on your home page: ' + (j.types.join(', ') || 'no types named') + '.' + (j.invalid ? ' ' + j.invalid + ' block(s) could not be read and may have a typo.' : ''), null, 'Found');
    else if (j.state === 'missing') item('bad', 'JSON-LD', 'No JSON-LD was found on your home page.', 'It spells out your business details for machines. The free schema generator on this site writes it for you.');
    else item('unknown', 'JSON-LD', 'We could not check it. ' + (j.error || ''));
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form));
    go.disabled = true;
    box.hidden = false;
    list.innerHTML = '';
    cp.hidden = true;
    title.textContent = 'Results';
    status.className = 'tool-status';
    status.textContent = 'Checking. This takes a few seconds.';
    track('tool_use');
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok) throw new Error(body.error || 'The check failed. Please try again.');
          return body;
        });
      })
      .then(function (d) {
        if (!d.site) { status.textContent = ''; return; }
        title.textContent = 'Results for ' + d.site.replace(/^https?:\/\//, '');
        status.textContent = '';
        renderBots(d.robots);
        renderRest(d);
        cp.hidden = false;
      })
      .catch(function (err) {
        status.className = 'tool-status tool-status-err';
        status.textContent = err.message && err.message !== 'Failed to fetch' ? err.message : 'We could not reach the checker. Please try again in a minute.';
      })
      .then(function () { go.disabled = false; });
  });
})();
