// Registers the offline fallback worker (see sw.js).
//
// A separate file rather than an inline <script> on purpose: inline script
// would require 'unsafe-inline' in this host's CSP, and that relaxation would
// apply to the whole marketing page — the one surface where an injected
// third-party snippet would most directly contradict what the page says about
// itself. Two lines in their own file is a cheap price for keeping
// `script-src 'self'`.
//
// Failure is silent by design. The worker exists to make being offline more
// pleasant; if registration fails, the visitor gets the browser's own error
// page, which is exactly what they would have got anyway.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
