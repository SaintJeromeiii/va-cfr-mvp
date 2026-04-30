(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrTimeline = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function toSortableDateKey(dateStr) {
    const value = (dateStr || "").trim();

    if (!value) {
      return "9999-99-99";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    if (/^\d{4}-\d{2}$/.test(value)) {
      return `${value}-01`;
    }

    if (/^\d{4}$/.test(value)) {
      return `${value}-01-01`;
    }

    return "9999-99-99";
  }

  function sortTimeline(entries) {
    return (entries || [])
      .slice()
      .sort((a, b) => toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)));
  }

  return { toSortableDateKey, sortTimeline };
});
