"use strict";

const { sortTimeline, toSortableDateKey } = require("../public/js/timeline-utils");

describe("timeline utilities", () => {
  test("normalizes partial dates for sorting", () => {
    expect(toSortableDateKey("2024")).toBe("2024-01-01");
    expect(toSortableDateKey("2024-03")).toBe("2024-03-01");
    expect(toSortableDateKey("2024-03-15")).toBe("2024-03-15");
  });

  test("sorts entries from earliest to latest", () => {
    const sorted = sortTimeline([
      { id: "c", date: "2024-03-01" },
      { id: "a", date: "2023" },
      { id: "b", date: "2024-02" },
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});
