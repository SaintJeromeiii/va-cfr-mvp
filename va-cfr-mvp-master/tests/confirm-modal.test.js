"use strict";

const { createConfirmModalApi } = require("../public/js/confirm-modal");

function makeFakeElement() {
  const listeners = new Map();
  const classes = new Set(["hidden"]);

  return {
    textContent: "",
    attributes: {},
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    dispatch(type, event = {}) {
      const handler = listeners.get(type);
      if (handler) handler(event);
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    focus() {
      this.focused = true;
    },
  };
}

describe("confirm modal", () => {
  test("falls back when modal markup is unavailable", async () => {
    const seen = [];
    const api = createConfirmModalApi({
      documentRef: { getElementById: () => null },
      fallbackConfirm: async (message) => {
        seen.push(message);
        return true;
      },
    });

    const result = await api.confirmAction("Delete item?");

    expect(result).toBe(true);
    expect(seen).toEqual(["Delete item?"]);
  });

  test("resolves true when confirm is clicked", async () => {
    const rootEl = makeFakeElement();
    const titleEl = makeFakeElement();
    const bodyEl = makeFakeElement();
    const confirmBtn = makeFakeElement();
    const cancelBtn = makeFakeElement();
    const keyHandlers = new Map();
    const documentRef = {
      getElementById(id) {
        return {
          confirmModal: rootEl,
          confirmModalTitle: titleEl,
          confirmModalBody: bodyEl,
          confirmModalConfirm: confirmBtn,
          confirmModalCancel: cancelBtn,
        }[id] || null;
      },
      addEventListener(type, handler) {
        keyHandlers.set(type, handler);
      },
      removeEventListener(type, handler) {
        if (keyHandlers.get(type) === handler) keyHandlers.delete(type);
      },
    };
    const api = createConfirmModalApi({ documentRef });

    const resultPromise = api.confirmAction({
      title: "Delete notes",
      message: "Delete saved notes?",
      confirmLabel: "Delete",
    });

    confirmBtn.dispatch("click", {
      preventDefault() {},
      stopPropagation() {},
      target: confirmBtn,
    });

    await expect(resultPromise).resolves.toBe(true);
    expect(titleEl.textContent).toBe("Delete notes");
    expect(bodyEl.textContent).toBe("Delete saved notes?");
    expect(confirmBtn.textContent).toBe("Delete");
    expect(rootEl.classList.contains("hidden")).toBe(true);
    expect(rootEl.attributes["aria-hidden"]).toBe("true");
  });

  test("resolves false when cancel is clicked", async () => {
    const rootEl = makeFakeElement();
    const titleEl = makeFakeElement();
    const bodyEl = makeFakeElement();
    const confirmBtn = makeFakeElement();
    const cancelBtn = makeFakeElement();
    const keyHandlers = new Map();
    const documentRef = {
      getElementById(id) {
        return {
          confirmModal: rootEl,
          confirmModalTitle: titleEl,
          confirmModalBody: bodyEl,
          confirmModalConfirm: confirmBtn,
          confirmModalCancel: cancelBtn,
        }[id] || null;
      },
      addEventListener(type, handler) {
        keyHandlers.set(type, handler);
      },
      removeEventListener(type, handler) {
        if (keyHandlers.get(type) === handler) keyHandlers.delete(type);
      },
    };
    const api = createConfirmModalApi({ documentRef });

    const resultPromise = api.confirmAction("Keep current notes?");

    cancelBtn.dispatch("click", {
      preventDefault() {},
      stopPropagation() {},
      target: cancelBtn,
    });

    await expect(resultPromise).resolves.toBe(false);
    expect(rootEl.classList.contains("hidden")).toBe(true);
    expect(rootEl.attributes["aria-hidden"]).toBe("true");
  });
});
