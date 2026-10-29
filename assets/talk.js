// /talk/ (#172): the chat with Seth's AI, and the one contact form.
(function () {
  'use strict';
  var ENDPOINT = 'https://ask.sethshoultes.com/talk';
  var chat = document.getElementById('chat');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var send = document.getElementById('chat-send');
  var chips = document.getElementById('chips');
  var history = [];

  function add(role, text) {
    var d = document.createElement('div');
    d.className = 'msg ' + (role === 'user' ? 'me' : 'bot');
    d.textContent = text;
    chat.appendChild(d);
    d.scrollIntoView({ block: 'nearest' });
    return d;
  }

  function addSources(msg, sources) {
    if (!sources || !sources.length) return;
    var box = document.createElement('p');
    box.className = 'sources';
    box.appendChild(document.createTextNode('From Seth’s writing:'));
    sources.forEach(function (s) {
      if (s.url.indexOf('https://sethshoultes.com/') !== 0) return; // only ever link to this site
      var a = document.createElement('a');
      a.href = s.url;
      a.textContent = s.title;
      box.appendChild(a);
    });
    msg.appendChild(box);
  }

  async function ask(q) {
    add('user', q);
    history.push({ role: 'user', content: q });
    send.disabled = true;
    var wait = add('assistant', 'Looking through Seth’s writing…');
    try {
      var res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || '');
      wait.textContent = data.answer;
      addSources(wait, data.sources);
      history.push({ role: 'assistant', content: data.answer });
    } catch (err) {
      history.pop();
      wait.textContent = err.message || 'I couldn’t answer that just now. You can send Seth a message below.';
    }
    send.disabled = false;
    if (window.matchMedia('(pointer: fine)').matches) input.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) return;
    input.value = '';
    chips.hidden = true;
    ask(q);
  });
  chips.addEventListener('click', function (e) {
    if (e.target.classList.contains('chip')) { chips.hidden = true; ask(e.target.textContent); }
  });

  // The one contact form.
  var cform = document.getElementById('contact-form');
  var status = document.getElementById('form-status');
  cform.addEventListener('submit', async function (event) {
    event.preventDefault();
    var button = cform.querySelector('button');
    var data = Object.fromEntries(new FormData(cform));
    status.className = '';
    status.textContent = 'Sending…';
    button.disabled = true;
    try {
      var res = await fetch('https://contact.sethshoultes.com/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(body.error || 'Sending failed. Please email seth@smartwebutah.com.');
      cform.reset();
      status.className = 'ok';
      status.textContent = 'Thanks! I got your message and will reply within two business days.';
    } catch (err) {
      status.className = 'err';
      status.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
})();
