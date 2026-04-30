"use strict";

const { createNotifierApi } = require("../public/js/notifier");

describe("notifier", () => {
  test("shows a message in the notification element", () => {
    const element = {
      textContent: "",
      dataset: {},
      classList: {
        values: new Set(["hidden"]),
        remove(value) { this.values.delete(value); },
        add(value) { this.values.add(value); },
      },
    };
    const api = createNotifierApi({
      documentRef: {
        getElementById(id) {
          return id === "notification" ? element : null;
        },
      },
      windowRef: {
        setTimeout(fn) {
          this.timeoutFn = fn;
          return 1;
        },
        clearTimeout() {},
      },
      fallbackAlert: () => {},
    });

    api.show("Saved!", { type: "success", duration: 0 });

    expect(element.textContent).toBe("Saved!");
    expect(element.dataset.type).toBe("success");
    expect(element.classList.values.has("hidden")).toBe(false);
  });

  test("falls back when the notification element is unavailable", () => {
    const seen = [];
    const api = createNotifierApi({
      documentRef: { getElementById: () => null },
      windowRef: { setTimeout() {}, clearTimeout() {} },
      fallbackAlert: (message) => seen.push(message),
    });

    api.show("Fallback notice");

    expect(seen).toEqual(["Fallback notice"]);
  });
});
