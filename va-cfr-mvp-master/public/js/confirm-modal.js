(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrConfirmModalFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createConfirmModalApi(deps) {
    const {
      documentRef = document,
      fallbackConfirm = (message) => Promise.resolve(confirm(message)),
    } = deps || {};

    function confirmAction(options) {
      const config = typeof options === "string" ? { message: options } : (options || {});
      const rootEl = documentRef.getElementById("confirmModal");
      if (!rootEl) {
        return fallbackConfirm(config.message || "Are you sure?");
      }

      const titleEl = documentRef.getElementById("confirmModalTitle");
      const bodyEl = documentRef.getElementById("confirmModalBody");
      const confirmBtn = documentRef.getElementById("confirmModalConfirm");
      const cancelBtn = documentRef.getElementById("confirmModalCancel");

      if (!titleEl || !bodyEl || !confirmBtn || !cancelBtn) {
        return fallbackConfirm(config.message || "Are you sure?");
      }

      titleEl.textContent = config.title || "Confirm action";
      bodyEl.textContent = config.message || "Are you sure you want to continue?";
      confirmBtn.textContent = config.confirmLabel || "Confirm";
      cancelBtn.textContent = config.cancelLabel || "Cancel";

      rootEl.classList.remove("hidden");

      return new Promise((resolve) => {
        const cleanup = (result) => {
          rootEl.classList.add("hidden");
          confirmBtn.removeEventListener("click", onConfirm);
          cancelBtn.removeEventListener("click", onCancel);
          rootEl.removeEventListener("click", onBackdrop);
          documentRef.removeEventListener("keydown", onKeydown);
          resolve(result);
        };

        const onConfirm = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onBackdrop = (event) => {
          if (event.target === rootEl) cleanup(false);
        };
        const onKeydown = (event) => {
          if (event.key === "Escape") cleanup(false);
        };

        confirmBtn.addEventListener("click", onConfirm);
        cancelBtn.addEventListener("click", onCancel);
        rootEl.addEventListener("click", onBackdrop);
        documentRef.addEventListener("keydown", onKeydown);
        confirmBtn.focus();
      });
    }

    return { confirmAction };
  }

  return { createConfirmModalApi };
});
