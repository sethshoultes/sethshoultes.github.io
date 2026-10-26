(function () {
  'use strict';

  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var form = document.getElementById('schema-form');
  var out = document.getElementById('schema-output');
  var notes = document.getElementById('schema-notes');
  var copyBtn = document.getElementById('schema-copy');
  var status = document.getElementById('schema-status');
  var hoursBox = document.getElementById('schema-hours');
  var used = false;

  function track(name) {
    if (typeof gtag === 'function') gtag('event', name, { tool_name: 'local-business-schema-generator' });
  }

  DAYS.forEach(function (day) {
    var row = document.createElement('div');
    row.className = 'tool-hours-row';
    row.innerHTML = '<span>' + day + '</span>' +
      '<input type="time" name="open-' + day + '" aria-label="' + day + ' opens">' +
      '<input type="time" name="close-' + day + '" aria-label="' + day + ' closes">';
    hoursBox.appendChild(row);
  });

  function val(name) { return form.elements[name].value.trim(); }
  function lines(name) { return val(name).split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
  function isWebUrl(s) { try { var u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; } }

  function build() {
    var problems = [];
    var data = { '@context': 'https://schema.org', '@type': val('type') || 'LocalBusiness', name: val('name') };

    if (val('description')) data.description = val('description');
    ['url', 'image'].forEach(function (k) {
      if (!val(k)) return;
      if (isWebUrl(val(k))) data[k] = val(k);
      else problems.push('The ' + (k === 'url' ? 'website' : 'logo') + ' address must start with http:// or https://, so it was left out.');
    });
    if (val('telephone')) data.telephone = val('telephone');
    if (val('email')) data.email = val('email');
    if (val('price')) data.priceRange = val('price');

    var addr = { street: 'streetAddress', city: 'addressLocality', region: 'addressRegion', postal: 'postalCode' };
    var address = {};
    Object.keys(addr).forEach(function (k) { if (val(k)) address[addr[k]] = val(k); });
    if (Object.keys(address).length) {
      address['@type'] = 'PostalAddress';
      address.addressCountry = 'US';
      data.address = address;
    }

    var groups = {};
    var order = [];
    DAYS.forEach(function (day) {
      var open = val('open-' + day);
      var close = val('close-' + day);
      if (!open || !close) return;
      var key = open + '-' + close;
      if (!groups[key]) { groups[key] = { '@type': 'OpeningHoursSpecification', dayOfWeek: [], opens: open, closes: close }; order.push(key); }
      groups[key].dayOfWeek.push(day);
    });
    if (order.length) data.openingHoursSpecification = order.map(function (k) { return groups[k]; });

    var areas = lines('areas');
    if (areas.length) data.areaServed = areas.map(function (n) { return { '@type': 'City', name: n }; });

    var services = lines('services');
    if (services.length) {
      data.hasOfferCatalog = {
        '@type': 'OfferCatalog',
        name: 'Services',
        itemListElement: services.map(function (n) {
          return { '@type': 'Offer', itemOffered: { '@type': 'Service', name: n } };
        })
      };
    }

    var profiles = lines('sameas');
    var good = profiles.filter(isWebUrl);
    if (good.length) data.sameAs = good;
    if (good.length < profiles.length) problems.push('Profile addresses must start with http:// or https://. Some were left out.');

    return { data: data, problems: problems };
  }

  function advice(data) {
    var tips = [];
    if (!data.address) tips.push('Add your street address and city. It is the first thing a local search looks for.');
    if (!data.telephone) tips.push('Add a phone number.');
    if (!data.openingHoursSpecification) tips.push('Add your hours so people and assistants know when you are open.');
    if (!data.url) tips.push('Add your website address.');
    if (!data.hasOfferCatalog) tips.push('List your services so assistants can match you to what people ask for.');
    return tips;
  }

  function render() {
    var result = build();
    if (!result.data.name) {
      out.textContent = 'Type your business name to start.';
      copyBtn.disabled = true;
      notes.innerHTML = '';
      return;
    }
    var json = JSON.stringify(result.data, null, 2).replace(/</g, '\\u003c');
    out.textContent = '<script type="application/ld+json">\n' + json + '\n</script>';
    copyBtn.disabled = false;

    var items = result.problems.concat(advice(result.data));
    notes.innerHTML = '';
    if (items.length) {
      var h = document.createElement('h3');
      h.textContent = 'To make it stronger';
      var ul = document.createElement('ul');
      items.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
      notes.appendChild(h);
      notes.appendChild(ul);
    }
  }

  form.addEventListener('input', function () {
    if (!used) { used = true; track('tool_use'); }
    status.textContent = '';
    render();
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  document.getElementById('schema-weekdays').addEventListener('click', function () {
    var open = val('open-Monday');
    var close = val('close-Monday');
    ['Tuesday', 'Wednesday', 'Thursday', 'Friday'].forEach(function (d) {
      form.elements['open-' + d].value = open;
      form.elements['close-' + d].value = close;
    });
    render();
  });

  copyBtn.addEventListener('click', function () {
    var text = out.textContent;
    function done(ok) {
      status.textContent = ok ? 'Copied. Paste it into your page.' : 'Your browser blocked copying. Select the code and copy it by hand.';
      if (ok) track('tool_copy');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
      done(false);
    }
  });

  render();
})();
