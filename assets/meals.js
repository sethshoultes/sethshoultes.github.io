/* Shoultes family meal planner: pick meals for the week, get a grocery list by store.
   Everything stays in this browser (localStorage); nothing is sent anywhere. */
(function (root) {
  'use strict';

  var DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];

  // Build the grocery list: one line per item, grouped by store.
  // week: {mon: {meals: [slug or "custom text"], note: ""}, ...}; state.stores overrides where an item is bought;
  // state.extras are items added by hand.
  function grocery(data, week, state) {
    var bySlug = {};
    data.meals.forEach(function (m) { bySlug[m.slug] = m; });
    var lines = {};
    function add(label, store, detail) {
      var key = label.trim().toLowerCase();
      if (!key) return;
      var line = lines[key] || (lines[key] = { key: key, label: label.trim(), store: store || 'other', details: [] });
      if (detail && line.details.indexOf(detail) === -1) line.details.push(detail);
    }
    DAYS.forEach(function (d) {
      ((week[d[0]] || {}).meals || []).forEach(function (id) {
        var m = bySlug[id];
        if (!m) return;
        m.ingredients.forEach(function (ing) {
          add(ing.item, ing.store, [ing.qty, m.short || m.name].filter(Boolean).join(' for '));
        });
      });
    });
    (state.extras || []).forEach(function (e) { add(e.item, e.store, ''); });
    var groups = {};
    data.stores.forEach(function (s) { groups[s.key] = []; });
    Object.keys(lines).forEach(function (k) {
      var l = lines[k];
      var over = (state.stores || {})[k];
      if (over && groups[over]) l.store = over;
      if (!groups[l.store]) l.store = 'other';
      groups[l.store].push(l);
    });
    Object.keys(groups).forEach(function (s) {
      groups[s].sort(function (a, b) { return a.label.localeCompare(b.label); });
    });
    return groups;
  }

  function listText(data, groups, checked) {
    var out = [];
    data.stores.forEach(function (s) {
      var items = groups[s.key].filter(function (l) { return !(checked || {})[l.key]; });
      if (!items.length) return;
      out.push(s.name);
      items.forEach(function (l) { out.push('- ' + l.label + (l.details.length ? ' (' + l.details.join('; ') + ')' : '')); });
      out.push('');
    });
    return out.join('\n').trim();
  }

  var api = { DAYS: DAYS, grocery: grocery, listText: listText };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.MealPlanner = api;

  var box = document.getElementById('mp');
  if (!box) return;
  var data = JSON.parse(document.getElementById('mp-data').textContent);
  var KEY = 'shoultes-meal-planner-v1';
  var state = { week: {}, checked: {}, stores: {}, extras: [] };
  try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* private mode: works for this visit only */ }
  var bySlug = {};
  data.meals.forEach(function (m) { bySlug[m.slug] = m; });

  var weekEl = document.getElementById('mp-week');
  var listEl = document.getElementById('mp-list');
  var statusEl = document.getElementById('mp-status');

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function say(msg) { statusEl.textContent = msg; }
  function day(k) { return state.week[k] || (state.week[k] = { meals: [], note: '' }); }
  function nameOf(id) { return bySlug[id] ? bySlug[id].name : id; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }

  function renderWeek() {
    weekEl.textContent = '';
    DAYS.forEach(function (d) {
      var k = d[0], name = d[1], cur = day(k);
      var card = el('section', 'mp-day');
      card.setAttribute('data-day', k);
      card.appendChild(el('h3', '', name));
      var ul = el('ul', 'mp-day-meals');
      cur.meals.forEach(function (id, i) {
        var li = el('li');
        li.appendChild(el('span', '', nameOf(id)));
        var rm = el('button', 'mp-x', 'Remove');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove ' + nameOf(id) + ' from ' + name);
        rm.addEventListener('click', function () { cur.meals.splice(i, 1); save(); render(); say(nameOf(id) + ' removed from ' + name + '.'); });
        li.appendChild(rm);
        ul.appendChild(li);
      });
      card.appendChild(ul);
      var sel = el('select', 'mp-add');
      sel.setAttribute('aria-label', 'Add a meal to ' + name);
      sel.appendChild(new Option('Add a meal', ''));
      data.meals.forEach(function (m) { sel.appendChild(new Option(m.name, m.slug)); });
      sel.addEventListener('change', function () {
        if (!sel.value) return;
        var id = sel.value;
        cur.meals.push(id); save(); render(); say(nameOf(id) + ' added to ' + name + '.');
      });
      card.appendChild(sel);
      var own = el('input', 'mp-own');
      own.type = 'text'; own.placeholder = 'Or type your own'; own.setAttribute('aria-label', 'Type your own meal for ' + name);
      own.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || !own.value.trim()) return;
        e.preventDefault();
        cur.meals.push(own.value.trim()); save(); render(); say(own.value.trim() + ' added to ' + name + '.');
      });
      card.appendChild(own);
      var note = el('input', 'mp-note');
      note.type = 'text'; note.placeholder = 'Notes: soccer, guild'; note.value = cur.note || '';
      note.setAttribute('aria-label', 'Notes for ' + name);
      note.addEventListener('input', function () { cur.note = note.value; save(); });
      card.appendChild(note);
      // drop target for dragged meal cards
      card.addEventListener('dragover', function (e) { e.preventDefault(); card.classList.add('mp-over'); });
      card.addEventListener('dragleave', function () { card.classList.remove('mp-over'); });
      card.addEventListener('drop', function (e) {
        e.preventDefault(); card.classList.remove('mp-over');
        var id = e.dataTransfer.getData('text/plain');
        if (bySlug[id]) { cur.meals.push(id); save(); render(); say(nameOf(id) + ' added to ' + name + '.'); }
      });
      weekEl.appendChild(card);
    });
  }

  function renderList() {
    var groups = grocery(data, state.week, state);
    listEl.textContent = '';
    var total = 0;
    data.stores.forEach(function (s) {
      var items = groups[s.key];
      if (!items.length) return;
      total += items.length;
      var sec = el('section', 'mp-store');
      sec.appendChild(el('h3', '', s.name));
      var ul = el('ul', 'mp-items');
      items.forEach(function (l) {
        var li = el('li');
        var lab = el('label');
        var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!state.checked[l.key];
        cb.addEventListener('change', function () { state.checked[l.key] = cb.checked; save(); li.classList.toggle('mp-done', cb.checked); });
        lab.appendChild(cb);
        var txt = el('span', '', l.label);
        lab.appendChild(txt);
        if (l.details.length) lab.appendChild(el('small', '', ' ' + l.details.join('; ')));
        li.appendChild(lab);
        li.classList.toggle('mp-done', cb.checked);
        var mv = el('select', 'mp-move');
        mv.setAttribute('aria-label', 'Where to buy ' + l.label);
        data.stores.forEach(function (st) { var o = new Option(st.name, st.key); o.selected = st.key === l.store; mv.appendChild(o); });
        mv.addEventListener('change', function () { state.stores[l.key] = mv.value; save(); renderList(); say(l.label + ' moved to ' + mv.options[mv.selectedIndex].text + '.'); });
        li.appendChild(mv);
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      listEl.appendChild(sec);
    });
    if (!total) listEl.appendChild(el('p', 'mp-empty', 'Add meals to the week and the grocery list builds itself here.'));
    ['mp-copy', 'mp-text', 'mp-print'].forEach(function (id) { document.getElementById(id).disabled = !total; });
  }

  function render() { renderWeek(); renderList(); }

  function currentText() {
    var groups = grocery(data, state.week, state);
    return 'Grocery list\n\n' + listText(data, groups, state.checked);
  }

  document.getElementById('mp-copy').addEventListener('click', function () {
    var t = currentText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { say('Grocery list copied.'); }, function () { say('Could not copy. Select the list and copy it by hand.'); });
    } else { say('Could not copy. Select the list and copy it by hand.'); }
  });
  document.getElementById('mp-text').addEventListener('click', function () {
    location.href = 'sms:?&body=' + encodeURIComponent(currentText());
  });
  document.getElementById('mp-print').addEventListener('click', function () { window.print(); });
  document.getElementById('mp-clear').addEventListener('click', function () { state.checked = {}; save(); renderList(); say('Checkmarks cleared.'); });
  document.getElementById('mp-reset').addEventListener('click', function () {
    if (!window.confirm('Clear the whole week and the grocery list?')) return;
    state = { week: {}, checked: {}, stores: {}, extras: [] }; save(); render(); say('Started a new week.');
  });
  document.getElementById('mp-extra-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = document.getElementById('mp-extra');
    if (!inp.value.trim()) return;
    state.extras.push({ item: inp.value.trim(), store: 'other' }); inp.value = ''; save(); renderList(); say('Added to the list.');
  });

  // meal cards can be dragged onto a day
  box.querySelectorAll('[data-meal]').forEach(function (card) {
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', card.getAttribute('data-meal')); });
  });
  box.querySelectorAll('[data-add-meal]').forEach(function (b) {
    b.addEventListener('click', function () {
      var wd = document.getElementById('mp-pick');
      var slug = b.getAttribute('data-add-meal');
      var k = wd.value;
      day(k).meals.push(slug); save(); render();
      say(nameOf(slug) + ' added to ' + DAYS.filter(function (d) { return d[0] === k; })[0][1] + '.');
    });
  });
  render();
})(typeof window !== 'undefined' ? window : this);
