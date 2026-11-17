// radar (superintelligentfoo#94): one cookieless page-view beacon per page, to the site's own /api/radar. It sends the page
// address without its query string or fragment (origin + path) and the referring site's origin only, nothing else: no cookie,
// no storage, no identifier, so a query string never leaves the site. Nothing at all under Global Privacy Control or Do Not
// Track. A prerendered page counts only once the visitor actually sees it.
(function () {
  var nav = window.navigator || {};
  if (nav.globalPrivacyControl === true || nav.doNotTrack === "1" || nav.doNotTrack === "yes" || nav.msDoNotTrack === "1" || window.doNotTrack === "1") return;
  function from(address) {
    try {
      var origin = new URL(address).origin;
      return origin && origin !== "null" ? origin : "";
    } catch (e) { return ""; }
  }
  function send() {
    var body = JSON.stringify({ url: window.location.origin + window.location.pathname, referrer: from(document.referrer) });
    try {
      if (nav.sendBeacon && nav.sendBeacon("/api/radar", body)) return;
    } catch (e) { /* fall through to fetch */ }
    try {
      window.fetch("/api/radar", { method: "POST", body: body, keepalive: true, credentials: "omit",
        headers: { "Content-Type": "text/plain" } }).catch(function () {});
    } catch (e) { /* a page view is never worth an error */ }
  }
  if (document.prerendering) document.addEventListener("prerenderingchange", send, { once: true });
  else send();
})();
