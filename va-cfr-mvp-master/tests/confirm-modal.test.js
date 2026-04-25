"use strict";

const { createConfirmModalApi } = require("../public/js/confirm-modal");

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
});
