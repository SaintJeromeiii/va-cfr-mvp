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

    let activeDialog = null;

    function closeActiveDialog(result) {
      if (!activeDialog) return;

      const {
        rootEl,
        confirmBtn,
        cancelBtn,
        onConfirm,
        onCancel,
        onBackdrop,
        onKeydown,
        resolve,
      } = activeDialog;

      rootEl.classList.add("hidden");
      rootEl.setAttribute("aria-hidden", "true");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      rootEl.removeEventListener("click", onBackdrop);
      documentRef.removeEventListener("keydown", onKeydown);
      activeDialog = null;
      resolve(result);
    }

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

      if (activeDialog) {
        closeActiveDialog(false);
      }

      rootEl.classList.remove("hidden");
      rootEl.setAttribute("aria-hidden", "false");

      return new Promise((resolve) => {
        const onConfirm = (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          closeActiveDialog(true);
        };
        const onCancel = (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          closeActiveDialog(false);
        };
        const onBackdrop = (event) => {
          if (event.target === rootEl) closeActiveDialog(false);
        };
        const onKeydown = (event) => {
          if (event.key === "Escape") closeActiveDialog(false);
        };

        activeDialog = {
          rootEl,
          confirmBtn,
          cancelBtn,
          onConfirm,
          onCancel,
          onBackdrop,
          onKeydown,
          resolve,
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
