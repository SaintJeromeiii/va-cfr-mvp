(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrNotifierFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createNotifierApi(deps) {
    const {
      documentRef = document,
      windowRef = window,
      fallbackAlert = (message) => alert(message),
      elementId = "notification",
      defaultDuration = 2600,
    } = deps || {};

    let hideTimer = null;

    function getElement() {
      return documentRef?.getElementById ? documentRef.getElementById(elementId) : null;
    }

    function show(message, options = {}) {
      const el = getElement();
      const text = (message || "").toString().trim();
      const type = options.type || "info";
      const duration = options.duration ?? defaultDuration;

      if (!el) {
        fallbackAlert(text);
        return;
      }

      el.textContent = text;
      el.dataset.type = type;
      el.classList.remove("hidden");

      if (hideTimer) windowRef.clearTimeout(hideTimer);
      if (duration > 0) {
        hideTimer = windowRef.setTimeout(() => {
          hide();
        }, duration);
      }
    }

    function hide() {
      const el = getElement();
      if (!el) return;
      el.classList.add("hidden");
    }

    return { show, hide };
  }

  return { createNotifierApi };
});
