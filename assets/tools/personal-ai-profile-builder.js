(function () {
  'use strict';

  var form = document.getElementById('profile-form');
  var out = document.getElementById('profile-output');
  var copyBtn = document.getElementById('profile-copy');
  var status = document.getElementById('profile-status');
  var used = false;

  function track(name) {
    if (typeof gtag === 'function') gtag('event', name, { tool_name: 'personal-ai-profile-builder' });
  }

  function val(name) { return form.elements[name].value.trim(); }

  function build() {
    var lines = [];
    var intro = [];
    if (val('name')) intro.push('My name is ' + val('name') + '.');
    if (val('role')) intro.push(val('role').replace(/[.\s]+$/, '') + '.');
    if (intro.length) lines.push(intro.join(' '));

    var style = [];
    if (val('tone')) style.push('Use a ' + val('tone') + ' tone.');
    ['detail', 'humor', 'format'].forEach(function (k) { if (val(k)) style.push(val(k)); });
    if (style.length) lines.push(style.join(' '));

    if (val('always')) lines.push('Always do this: ' + val('always'));
    if (val('never')) lines.push('Never do this: ' + val('never'));
    return lines.join('\n\n');
  }

  function render() {
    var text = build();
    out.textContent = text || 'Fill in a field or pick an option to start.';
    copyBtn.disabled = !text;
  }

  function touched() {
    if (!used) { used = true; track('tool_use'); }
    status.textContent = '';
    render();
  }
  form.addEventListener('input', touched);
  form.addEventListener('change', touched);
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  copyBtn.addEventListener('click', function () {
    var text = build();
    function done(ok) {
      status.textContent = ok ? 'Copied. Paste it into your assistant.' : 'Your browser blocked copying. Select the text and copy it by hand.';
      if (ok) track('tool_copy');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
      done(false);
    }
  });

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tool-tabs [role=tab]'));
  function select(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { select(tab); track('tool_tab'); });
    tab.addEventListener('keydown', function (e) {
      var next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
      if (next === null) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length]);
    });
  });

  render();
})();
