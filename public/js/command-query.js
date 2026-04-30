(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrCommandQuery = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function parseCommandQuery(raw) {
    const q = (raw || "").trim();
    const lower = q.toLowerCase();
    const normalized = lower.replace(/[:=]/g, " ").replace(/\s+/g, " ").trim();

    if (normalized === "notes" || normalized === "note") {
      return { mode: "jump", jump: "notes", text: "" };
    }

    if (normalized === "evidence" || normalized === "checklist") {
      return { mode: "jump", jump: "evidence", text: "" };
    }

    const diagnosticCodeMatch = normalized.match(/^(dc)\s+(\d{3,5})$/);
    if (diagnosticCodeMatch) {
      return {
        mode: "jump",
        jump: diagnosticCodeMatch[2],
        text: diagnosticCodeMatch[2],
      };
    }

    const sectionMatch = normalized.match(/^(sec|section|§)\s+([0-9]+\.[0-9]+[a-z]?)$/);
    if (sectionMatch) {
      return { mode: "jump", jump: sectionMatch[2], text: sectionMatch[2] };
    }

    const directSectionMatch = normalized.match(/^§?([0-9]+\.[0-9]+[a-z]?)$/);
    if (directSectionMatch && q.includes("§")) {
      return { mode: "jump", jump: directSectionMatch[1], text: directSectionMatch[1] };
    }

    const systemMatch = normalized.match(/^(system|sys)\s+(.+)$/);
    if (systemMatch) {
      return { mode: "system", system: systemMatch[2].trim(), text: "" };
    }

    return { mode: "text", text: q };
  }

  return { parseCommandQuery };
});
