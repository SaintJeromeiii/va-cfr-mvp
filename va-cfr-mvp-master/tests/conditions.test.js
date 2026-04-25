"use strict";

const fs = require("fs");

const {
  parseConditions,
  validateConditions,
  createConditionStore,
} = require("../lib/conditions");

describe("conditions validation", () => {
  test("accepts a valid conditions payload", () => {
    const data = [
      {
        id: "tinnitus",
        name: "Tinnitus",
        cfr: [
          {
            section: "4.87",
            diagnostic_code: "6260",
            title: "Tinnitus",
            url: "https://example.com",
          },
        ],
      },
    ];

    expect(validateConditions(data)).toEqual(data);
  });

  test("rejects duplicate ids", () => {
    expect(() =>
      validateConditions([
        {
          id: "dup",
          name: "One",
          cfr: [{ section: "4.1", diagnostic_code: "1111", title: "Title", url: "x" }],
        },
        {
          id: "dup",
          name: "Two",
          cfr: [{ section: "4.2", diagnostic_code: "2222", title: "Title", url: "y" }],
        },
      ]),
    ).toThrow("Duplicate id found: 'dup'");
  });

  test("rejects invalid json", () => {
    expect(() => parseConditions("{")).toThrow("conditions.json is invalid JSON");
  });
});

describe("condition store caching", () => {
  test("reloads when the file mtime changes", () => {
    const filePath = "/tmp/conditions.json";
    const firstRaw = JSON.stringify([
      {
        id: "one",
        name: "One",
        cfr: [{ section: "4.1", diagnostic_code: "1111", title: "One", url: "x" }],
      },
    ]);
    const secondRaw = JSON.stringify([
      {
        id: "two",
        name: "Two",
        cfr: [{ section: "4.2", diagnostic_code: "2222", title: "Two", url: "y" }],
      },
    ]);

    const statSyncMock = jest
      .fn()
      .mockReturnValueOnce({ mtimeMs: 1 })
      .mockReturnValueOnce({ mtimeMs: 1 })
      .mockReturnValueOnce({ mtimeMs: 2 });
    const readFileSyncMock = jest.fn().mockReturnValueOnce(firstRaw).mockReturnValueOnce(secondRaw);

    const statSpy = jest.spyOn(fs, "statSync").mockImplementation(statSyncMock);
    const readSpy = jest.spyOn(fs, "readFileSync").mockImplementation(readFileSyncMock);

    try {
      const store = createConditionStore(filePath);

      expect(store.load().map((condition) => condition.id)).toEqual(["one"]);
      expect(store.load().map((condition) => condition.id)).toEqual(["one"]);
      expect(store.load().map((condition) => condition.id)).toEqual(["two"]);
      expect(readSpy).toHaveBeenCalledTimes(2);
    } finally {
      statSpy.mockRestore();
      readSpy.mockRestore();
    }
  });
});
