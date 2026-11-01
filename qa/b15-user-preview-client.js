/* URL adaptation only. Authorization remains on the server on every request. */
(() => {
  const base = __B15_BASE_JSON__;
  function adapt(value) {
    const url = new URL(value, location.href);
    if (url.origin === location.origin && /^\/(api(?:\/|$)|assets\/|fixtures\/|fr036\/)/.test(url.pathname)) {
      url.pathname = base.slice(0, -1) + url.pathname;
    }
    return url.href;
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => originalFetch(input instanceof Request ? new Request(adapt(input.url), input) : adapt(input), init);
})();
