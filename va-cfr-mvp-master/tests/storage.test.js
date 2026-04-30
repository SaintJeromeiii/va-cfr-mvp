"use strict";

const { createStorageApi } = require("../public/js/storage");

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

describe("storage helpers", () => {
  test("loads workspace state from the current v4 shape", () => {
    const storage = createMemoryStorage({
      "vaCfrWorkspace:v4": JSON.stringify({
        nodes: ["ptsd", "migraines"],
        primaryId: "ptsd",
        links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
      }),
    });
    const api = createStorageApi(storage);

    expect(api.loadWorkspaceState()).toEqual({
      nodes: ["ptsd", "migraines"],
      primaryId: "ptsd",
      links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
    });
  });

  test("migrates legacy workspace shapes", () => {
    const storage = createMemoryStorage({
      "vaCfrWorkspace:v4": JSON.stringify({
        ids: ["ptsd", "sleep-apnea"],
        primaryId: "ptsd",
        secondaryIds: ["sleep-apnea"],
      }),
    });
    const api = createStorageApi(storage);

    expect(api.loadWorkspaceState()).toEqual({
      nodes: ["ptsd", "sleep-apnea"],
      primaryId: "ptsd",
      links: [{ from: "ptsd", to: "sleep-apnea", type: "Secondary to" }],
    });
  });

  test("falls back safely on invalid json", () => {
    const storage = createMemoryStorage({
      "vaCfrTimeline:ptsd": "{broken",
    });
    const api = createStorageApi(storage);

    expect(api.loadTimeline("ptsd")).toEqual([]);
  });
});
