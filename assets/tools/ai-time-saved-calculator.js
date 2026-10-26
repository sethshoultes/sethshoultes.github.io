(function () {
  'use strict';

  var form = document.getElementById('calc-form');
  var rowsBox = document.getElementById('calc-rows');
  var out = document.getElementById('calc-output');
  var table = document.getElementById('calc-table');
  var copyBtn = document.getElementById('calc-copy');
  var status = document.getElementById('calc-status');
  var summary = '';
  var used = false;
  var nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function track(name) {
    if (typeof gtag === 'function') gtag('event', name, { tool_name: 'ai-time-saved-calculator' });
  }

  function addRow() {
    var row = document.createElement('div');
    row.className = 'tool-row';
    row.innerHTML =
      '<label>Task<input type="text" data-f="name" placeholder="Answering customer emails"></label>' +
      '<label>Times a week<input type="number" data-f="times" min="0" step="any" inputmode="decimal" placeholder="10"></label>' +
      '<label>Minutes each<input type="number" data-f="minutes" min="0" step="any" inputmode="decimal" placeholder="15"></label>' +
      '<label>Percent AI saves<input type="number" data-f="percent" min="0" max="100" step="any" inputmode="decimal" placeholder="50"></label>' +
      '<button type="button" class="tool-link" data-remove>Remove</button>';
    rowsBox.appendChild(row);
  }

  function num(el) {
    var n = parseFloat(el.value);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  function calculate() {
    var rate = num(form.elements.rate);
    var weeks = Math.min(num(form.elements.weeks), 52);
    var tasks = [];
    rowsBox.querySelectorAll('.tool-row').forEach(function (row) {
      var f = {};
      row.querySelectorAll('[data-f]').forEach(function (el) { f[el.getAttribute('data-f')] = el; });
      var percent = Math.min(num(f.percent), 100);
      var hours = num(f.times) * num(f.minutes) / 60 * percent / 100;
      if (hours > 0) tasks.push({ name: f.name.value.trim() || 'Untitled task', weekly: hours });
    });
    return { rate: rate, weeks: weeks, tasks: tasks };
  }

  function render() {
    var c = calculate();
    table.innerHTML = '';
    if (!c.tasks.length) {
      out.textContent = 'Add a task, how often you do it, how long it takes and the percent AI could save.';
      copyBtn.disabled = true;
      summary = '';
      return;
    }
    var weekly = c.tasks.reduce(function (s, t) { return s + t.weekly; }, 0);
    var yearly = weekly * c.weeks;
    var lines = ['Hours back each week: ' + nf.format(weekly), 'Hours back each year: ' + nf.format(yearly)];
    var html = '<div class="proof"><div><strong>' + nf.format(weekly) + ' hours</strong><p>back each week</p></div>' +
      '<div><strong>' + nf.format(yearly) + ' hours</strong><p>back each year (' + c.weeks + ' weeks)</p></div>';
    if (c.rate > 0) {
      lines.push('Value each year: ' + money.format(yearly * c.rate));
      html += '<div><strong>' + money.format(yearly * c.rate) + '</strong><p>a year, at ' + money.format(c.rate) + ' an hour</p></div>';
    } else {
      html += '<div><strong>Add your hourly value</strong><p>to see the dollars</p></div>';
    }
    html += '</div>';
    out.innerHTML = html;

    var sorted = c.tasks.slice().sort(function (a, b) { return b.weekly - a.weekly; });
    var t = document.createElement('table');
    t.className = 'tool-table';
    var head = t.createTHead().insertRow();
    ['Task', 'Hours a week', 'Hours a year'].forEach(function (h) { var th = document.createElement('th'); th.textContent = h; head.appendChild(th); });
    var body = t.createTBody();
    sorted.forEach(function (task) {
      var r = body.insertRow();
      r.insertCell().textContent = task.name;
      r.insertCell().textContent = nf.format(task.weekly);
      r.insertCell().textContent = nf.format(task.weekly * c.weeks);
      lines.push('- ' + task.name + ': ' + nf.format(task.weekly) + ' hours a week');
    });
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.appendChild(t);
    table.appendChild(wrap);
    summary = lines.join('\n') + '\n(Your estimates. Calculated at sethshoultes.com/tools/ai-time-saved-calculator/)';
    copyBtn.disabled = false;
  }

  function touched() {
    if (!used) { used = true; track('tool_use'); }
    status.textContent = '';
    render();
  }

  form.addEventListener('input', touched);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-remove')) {
      e.target.closest('.tool-row').remove();
      if (!rowsBox.children.length) addRow();
      touched();
    }
  });
  document.getElementById('calc-add').addEventListener('click', addRow);

  copyBtn.addEventListener('click', function () {
    function done(ok) {
      status.textContent = ok ? 'Copied.' : 'Your browser blocked copying. Select the text and copy it by hand.';
      if (ok) track('tool_copy');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(summary).then(function () { done(true); }, function () { done(false); });
    } else {
      done(false);
    }
  });

  addRow();
  render();
})();
