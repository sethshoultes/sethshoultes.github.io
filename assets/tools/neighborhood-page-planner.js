(function () {
  'use strict';

  var ENDPOINT = 'https://tools-api.sethshoultes.com/neighborhood-planner';
  var form = document.getElementById('hood-form');
  var go = document.getElementById('hood-go');
  var box = document.getElementById('hood-result');
  var title = document.getElementById('hood-title');
  var status = document.getElementById('hood-status');
  var table = document.getElementById('hood-table');
  var note = document.getElementById('hood-note');
  var nf = new Intl.NumberFormat('en-US');
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function track(name) {
    if (typeof gtag === 'function') gtag('event', name, { tool_name: 'neighborhood-page-planner' });
  }

  function cell(row, text) {
    var td = row.insertCell();
    td.textContent = text;
    return td;
  }

  function render(d) {
    var t = document.createElement('table');
    t.className = 'tool-table';
    var head = t.createTHead().insertRow();
    ['#', 'Neighborhood', 'Median year homes built', 'Homes in the area', 'Median home value'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    });
    var body = t.createTBody();
    d.neighborhoods.forEach(function (n, i) {
      var r = body.insertRow();
      cell(r, n.priority === null ? '—' : String(i + 1));
      cell(r, n.name);
      cell(r, n.medianYearBuilt ? String(n.medianYearBuilt) : '—');
      cell(r, n.housingUnits ? nf.format(n.housingUnits) : '—');
      cell(r, n.medianValue ? money.format(n.medianValue) : '—');
    });
    table.innerHTML = '';
    table.appendChild(t);
  }

  function post(body) {
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (out) {
          if (!res.ok) throw new Error(out.error || 'The planner failed. Please try again.');
          return out;
        });
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form));
    go.disabled = true;
    box.hidden = false;
    table.innerHTML = '';
    note.hidden = true;
    title.textContent = 'Neighborhoods';
    status.className = 'tool-status';
    status.textContent = 'Finding your city.';
    track('tool_use');
    var cityName;
    post({ city: data.city, website: data.website })
      .then(function (c) {
        cityName = c.city;
        status.textContent = 'Found ' + c.city + '. Reading the neighborhood map. This can take up to a minute.';
        return window.SWSNeighborhoods.read(c.osmId);
      })
      .then(function (list) {
        if (!list.length) {
          title.textContent = cityName;
          status.className = 'tool-status tool-status-err';
          status.textContent = 'OpenStreetMap has no named neighborhoods mapped inside ' + cityName + ', so there is nothing to list. Local mappers add them over time.';
          return null;
        }
        status.textContent = 'Found ' + list.length + ' neighborhoods. Reading the Census figures.';
        return post({ step: 'join', city: cityName, neighborhoods: list, website: data.website });
      })
      .then(function (d) {
        if (!d) return;
        status.textContent = '';
        title.textContent = d.neighborhoods.length + ' neighborhoods in ' + d.city;
        render(d);
        var parts = ['Ranked by homes times the age of those homes, using Census figures for the tract each neighborhood sits in (' + d.sources.census + '). Neighborhoods in one tract share its numbers. Map data \u00a9 ' + d.sources.map + '.'];
        if (d.unmatched) parts.push(d.unmatched + ' neighborhood(s) have no Census figures and are listed last with dashes.');
        note.textContent = parts.join(' ');
        note.hidden = false;
      })
      .catch(function (err) {
        status.className = 'tool-status tool-status-err';
        status.textContent = err.message && err.message !== 'Failed to fetch' ? err.message : 'We could not reach the planner. Please try again in a minute.';
      })
      .then(function () { go.disabled = false; });
  });
})();
