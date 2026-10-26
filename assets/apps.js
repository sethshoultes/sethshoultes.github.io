(function () {
  'use strict';
  document.querySelectorAll('[data-buy]').forEach(function (a) {
    a.addEventListener('click', function () {
      if (typeof gtag === 'function') gtag('event', 'apps_checkout_click', { plan: a.getAttribute('data-buy') });
    });
  });
})();
