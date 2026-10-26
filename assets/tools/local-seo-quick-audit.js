(function () {
  'use strict';

  var ENDPOINT = 'https://tools-api.sethshoultes.com/local-seo-audit';
  var form = document.getElementById('seo-form');
  var go = document.getElementById('seo-go');
  var box = document.getElementById('seo-result');
  var title = document.getElementById('seo-title');
  var status = document.getElementById('seo-status');
  var list = document.getElementById('seo-list');
  var note = document.getElementById('seo-note');
  var cta = document.getElementById('seo-cta');
  var nf = new Intl.NumberFormat('en-US');

  function track(name) {
    if (typeof gtag === 'function') gtag('event', name, { tool_name: 'local-seo-quick-audit' });
  }

  function post(body) {
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (out) {
          if (!res.ok) throw new Error(out.error || 'The audit failed. Please try again.');
          return out;
        });
      });
  }

  function item(state, label, heading, lines) {
    var li = document.createElement('li');
    li.className = 'tool-check tool-check-' + state;
    var badge = document.createElement('span');
    badge.className = 'tool-badge';
    badge.textContent = label;
    var h = document.createElement('strong');
    h.textContent = heading;
    li.appendChild(badge);
    li.appendChild(h);
    lines.forEach(function (line) {
      if (!line) return;
      var p = document.createElement('p');
      if (typeof line === 'string') {
        p.textContent = line;
      } else {
        p.textContent = line.text + ' ';
        var a = document.createElement('a');
        a.href = line.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = line.linkText;
        p.appendChild(a);
      }
      li.appendChild(p);
    });
    list.appendChild(li);
  }

  function mapsLink(url) { return url ? { text: '', url: url, linkText: 'See it on Google Maps' } : null; }
  function stars(c) { return (c.rating === null ? 'no rating shown' : c.rating + ' stars') + ', ' + (c.reviews === null ? 'no review count shown' : nf.format(c.reviews) + ' reviews'); }

  function renderProfile(d) {
    var p = d.profile;
    if (p.state === 'found') {
      var missing = [];
      if (!p.address) missing.push('address');
      if (!p.phone) missing.push('phone number');
      if (!p.website) missing.push('website');
      if (!p.hoursShown) missing.push('opening hours');
      item(missing.length ? 'warn' : 'ok', missing.length ? 'Found, gaps' : 'Found', 'Google listing: ' + p.name, [
        stars(p) + '.',
        missing.length ? 'Google Maps shows no ' + missing.join(', ') + ' for this listing. If that is not on purpose, add it in your Google Business Profile.' : 'Address, phone, website and hours are all shown.',
        mapsLink(p.mapsUrl),
      ]);
    } else if (p.state === 'other') {
      item('bad', 'Not found', 'Google listing', ['Google Maps has no listing named "' + d.business + '" in ' + d.city + '. The closest it returned was "' + p.closest.name + '" (' + stars(p.closest) + '), which is a different name, so we did not count it. If that is you, check the name on your listing matches the name you use.', mapsLink(p.closest.mapsUrl)]);
    } else if (p.state === 'notfound') {
      item('bad', 'Not found', 'Google listing', ['Google Maps returned no listing named "' + d.business + '" in ' + d.city + '. If you have none, claim or create your Google Business Profile first. If you do, try your name exactly as Google shows it.']);
    } else {
      item('unknown', 'Unknown', 'Google listing', [p.error || 'We could not read an answer from Google Maps for your listing. Please try again.']);
    }
  }

  function renderCompetitors(d) {
    var c = d.competitors;
    if (c.state === 'failed' || c.state === 'unreadable') {
      item('unknown', 'Unknown', 'Reviews against competitors', [c.error || 'We could not read the competitor list from Google Maps. Please try again.']);
      return;
    }
    if (c.state === 'none') {
      item('unknown', 'None', 'Reviews against competitors', ['Google Maps returned no other ' + d.service + ' businesses we could confirm in ' + d.city + '.']);
      return;
    }
    var mine = d.profile.state === 'found' ? d.profile.reviews : null;
    var lines = [];
    if (mine !== null) {
      var more = c.list.filter(function (x) { return x.reviews !== null && x.reviews > mine; }).length;
      var counted = c.list.filter(function (x) { return x.reviews !== null; }).length;
      lines.push('You have ' + nf.format(mine) + ' reviews. ' + more + ' of the ' + counted + ' competitors Google returned ' + (more === 1 ? 'has' : 'have') + ' more.');
    } else {
      lines.push('Your own review count is not shown above, so we cannot place you among them.');
    }
    var ul = document.createElement('ul');
    ul.className = 'tool-sublist';
    c.list.forEach(function (x) {
      var li = document.createElement('li');
      li.textContent = x.name + ': ' + stars(x) + ' ';
      if (x.mapsUrl) {
        var a = document.createElement('a');
        a.href = x.mapsUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Google Maps';
        li.appendChild(a);
      }
      ul.appendChild(li);
    });
    var state = mine === null ? 'unknown' : c.list.some(function (x) { return x.reviews !== null && x.reviews > mine; }) ? 'warn' : 'ok';
    item(state, 'Compared', 'Reviews against nearby competitors', lines);
    list.lastChild.appendChild(ul);
  }

  function renderPages(d, hoodCount) {
    if (d.state === 'nositemap') {
      item('unknown', 'Unknown', 'Neighborhood pages', ['We could not find a sitemap for ' + d.site.replace(/^https?:\/\//, '') + ' (we looked in robots.txt and at /sitemap.xml), so we could not check which neighborhoods have a page.']);
      return;
    }
    var lines = [d.have.length + ' of ' + hoodCount + ' neighborhoods in your city have a page whose address names them (' + d.sitemapPages + ' pages in your sitemap).'];
    if (d.have.length) lines.push('Covered: ' + d.have.map(function (h) { return h.name; }).join(', ') + '.');
    if (d.missing.length) lines.push('No page found for: ' + d.missing.join(', ') + '.');
    item(d.missing.length ? 'warn' : 'ok', d.missing.length ? 'Gaps' : 'Covered', 'Neighborhood pages', lines);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form));
    var siteText = (data.site || '').trim();
    go.disabled = true;
    box.hidden = false;
    list.innerHTML = '';
    note.hidden = true;
    cta.hidden = true;
    title.textContent = 'Your audit';
    status.className = 'tool-status';
    status.textContent = 'Reading Google Maps. This takes about 20 seconds.';
    track('tool_use');
    var result;
    post({ business: data.business, service: data.service, city: data.city, website: data.website })
      .then(function (d) {
        result = d;
        title.textContent = d.business + ' in ' + d.city;
        status.textContent = '';
        renderProfile(d);
        renderCompetitors(d);
        note.textContent = 'Figures are what ' + d.source + '. Open each Google Maps link to check them. Competitors are a sample of up to eight.';
        note.hidden = false;
        cta.hidden = false;
        if (!siteText) return null;
        if (!d.osmId) {
          item('unknown', 'Unknown', 'Neighborhood pages', ['We could not find your city on the map, so we could not list its neighborhoods.']);
          return null;
        }
        status.textContent = 'Now checking your site for neighborhood pages. The map can take up to a minute.';
        return window.SWSNeighborhoods.read(d.osmId).then(function (hoods) {
          if (!hoods.length) {
            item('unknown', 'None', 'Neighborhood pages', ['OpenStreetMap has no named neighborhoods mapped inside ' + d.city + ', so there is nothing to check your site against.']);
            return null;
          }
          return post({ step: 'pages', site: siteText, neighborhoods: hoods }).then(function (p) { renderPages(p, hoods.length); });
        }).catch(function (err) {
          item('unknown', 'Unknown', 'Neighborhood pages', [err.message || 'We could not check neighborhood pages.']);
        });
      })
      .then(function () { status.textContent = ''; })
      .catch(function (err) {
        status.className = 'tool-status tool-status-err';
        status.textContent = err.message && err.message !== 'Failed to fetch' ? err.message : 'We could not reach the audit. Please try again in a minute.';
        if (result) status.textContent = '';
      })
      .then(function () { go.disabled = false; });
  });
})();
