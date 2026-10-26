// Reads a city's named neighborhoods from OpenStreetMap, for the neighborhood
// planner and the local SEO audit. The map service (Overpass) can take up to a
// minute, so the visitor's browser asks it directly instead of waiting on our
// server, and keeps the answer for a week. Exposes window.SWSNeighborhoods.read(osmId).
(function () {
  'use strict';

  var OVERPASS = 'https://overpass-api.de/api/interpreter';
  var WEEK_MS = 7 * 24 * 3600 * 1000;

  function read(osmId) {
    var key = 'hoods:' + osmId;
    try {
      var saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && Date.now() - saved.at < WEEK_MS) return Promise.resolve(saved.list);
    } catch (e) { /* storage unavailable: just ask */ }
    var kinds = '^(neighbourhood|suburb|quarter)$';
    var query = '[out:json][timeout:80];area(id:' + (3600000000 + osmId) + ')->.a;(node["place"~"' + kinds + '"](area.a);way["place"~"' + kinds + '"](area.a);relation["place"~"' + kinds + '"](area.a););out center 120;';
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 90000);
    return fetch(OVERPASS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: controller.signal })
      .then(function (res) {
        if (!res.ok) throw new Error('The neighborhood map is busy right now. Please try again in a few minutes.');
        return res.json();
      })
      .then(function (data) {
        var seen = {};
        var list = [];
        (data.elements || []).forEach(function (e) {
          var name = e.tags && e.tags.name && e.tags.name.trim();
          var lat = e.lat !== undefined ? e.lat : e.center && e.center.lat;
          var lon = e.lon !== undefined ? e.lon : e.center && e.center.lon;
          if (!name || lat === undefined || lon === undefined || seen[name.toLowerCase()]) return;
          seen[name.toLowerCase()] = true;
          list.push({ name: name, lat: lat, lon: lon });
        });
        list = list.slice(0, 40);
        try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), list: list })); } catch (e) { /* not kept */ }
        return list;
      })
      .catch(function (err) {
        if (err.name === 'AbortError') throw new Error('The neighborhood map took too long to answer. Please try again in a few minutes.');
        if (err instanceof TypeError) throw new Error('We could not reach the neighborhood map. Please try again in a few minutes.');
        throw err;
      })
      .then(function (list) { clearTimeout(timer); return list; }, function (err) { clearTimeout(timer); throw err; });
  }

  window.SWSNeighborhoods = { read: read };
})();
