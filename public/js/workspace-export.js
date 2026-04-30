(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrWorkspaceExportFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function base64UrlEncode(str) {
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function base64UrlDecode(b64url) {
    let b64 = b64url.replaceAll("-", "+").replaceAll("_", "/");
    while (b64.length % 4) {
      b64 += "=";
    }
    return decodeURIComponent(escape(atob(b64)));
  }

  function createWorkspaceExportApi(deps) {
    const {
      loadWorkspaceState,
      saveWorkspaceState,
      loadNotes,
      loadEvidenceState,
      getConditionById,
      now = () => new Date().toLocaleString(),
    } = deps;

    function pushSection(lines, title, rows) {
      lines.push(title);
      lines.push("-".repeat(title.length));
      (rows || []).forEach((row) => lines.push(row));
      lines.push("");
    }

    function evidenceSummary(item, evState) {
      const total = (item.evidence_checklist || []).length;
      const done = (item.evidence_checklist || []).reduce((acc, _, idx) => acc + (evState[idx] ? 1 : 0), 0);
      const pct = total ? Math.round((done / total) * 100) : 0;
      return { done, total, pct };
    }

    function relationshipRows(item, wsState) {
      if (item.id === wsState.primaryId) return ["- Primary condition in this workspace."];

      const linksToItem = (wsState.links || []).filter((link) => link.to === item.id);
      if (!linksToItem.length) return ["- Unlinked in current workspace."];

      return linksToItem.map((link) => {
        const parent = getConditionById(link.from);
        const parentName = parent ? parent.name : link.from;
        return `- ${link.type || "Secondary to"} ${parentName}`;
      });
    }

    function nextStepRows(item, evState, notes, wsState) {
      const summary = evidenceSummary(item, evState);
      const rows = [];

      if (!notes.trim()) {
        rows.push("- Add a concise condition summary in Notes covering onset, severity, and functional impact.");
      }
      if (summary.total && summary.done < summary.total) {
        rows.push(`- Finish the evidence checklist (${summary.done}/${summary.total} complete) before exporting a final packet.`);
      }
      if (item.id !== wsState.primaryId && !(wsState.links || []).some((link) => link.to === item.id)) {
        rows.push("- Link this condition to the most relevant parent condition if it is intended as a secondary claim.");
      }
      if (!(item.cfr || []).length) {
        rows.push("- Verify CFR references before relying on this packet.");
      }

      return rows.length
        ? rows
        : ["- Packet is in good shape for educational review; verify CFR language and supporting records before use."];
    }

    function makeSharePayload() {
      const st = loadWorkspaceState();
      return { v: 1, nodes: st.nodes || [], primaryId: st.primaryId || "", links: st.links || [] };
    }

    function applySharePayload(payload) {
      if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.links)) {
        throw new Error("Invalid workspace share payload.");
      }

      saveWorkspaceState({
        nodes: payload.nodes,
        primaryId: payload.primaryId || payload.nodes[0] || "",
        links: payload.links,
      });
    }

    function buildClaimPacketText(item, evState) {
      const wsState = loadWorkspaceState();
      const notes = (loadNotes(item.id) || "").trim();
      const evSummary = evidenceSummary(item, evState);
      const lines = [];
      lines.push(`VA CFR Finder — Claim Packet`);
      lines.push(now());
      lines.push("");
      lines.push(`Condition: ${item.name}`);
      lines.push(`Condition ID: ${item.id}`);
      lines.push(`Body system: ${item.body_system || "(unknown)"}`);
      lines.push("");

      pushSection(lines, "Claim Snapshot", [
        `- Workspace role: ${item.id === wsState.primaryId ? "Primary" : "Secondary / supporting"}`,
        `- Evidence readiness: ${evSummary.done}/${evSummary.total} (${evSummary.pct}%)`,
        `- Notes saved: ${notes ? "Yes" : "No"}`,
      ]);

      pushSection(lines, "Relationship Summary", relationshipRows(item, wsState));

      pushSection(lines, "CFR References", (item.cfr || []).flatMap((reference) => {
        const rows = [`- ${reference.section || ""} | DC ${reference.diagnostic_code || ""} | ${reference.title || ""}`];
        if (reference.url) rows.push(`  Source: ${reference.url}`);
        return rows;
      }));

      if (item.strategy && item.strategy.length) {
        pushSection(lines, "Claim Strategy (Educational)", item.strategy.map((step) => `- ${step}`));
      }

      pushSection(lines, "Evidence Checklist", (item.evidence_checklist || []).map((entry, idx) => {
        const mark = evState[idx] ? "[x]" : "[ ]";
        return `${mark} ${entry}`;
      }));

      pushSection(lines, "Notes", [notes ? notes : "(none)"]);
      pushSection(lines, "Recommended Next Steps", nextStepRows(item, evState, notes, wsState));

      lines.push("Disclaimer: Educational only. Not legal advice/representation.");
      return lines.join("\n");
    }

    function buildWorkspacePacketText(items) {
      const lines = [];
      lines.push("VA CFR Finder — Claim Workspace Packet");
      lines.push(now());
      lines.push("");
      lines.push(`Conditions in workspace: ${items.length}`);
      lines.push("");

      const wsState = loadWorkspaceState();
      const totals = items.reduce((acc, item) => {
        const summary = evidenceSummary(item, loadEvidenceState(item.id));
        acc.done += summary.done;
        acc.total += summary.total;
        return acc;
      }, { done: 0, total: 0 });
      const primary = wsState.primaryId ? getConditionById(wsState.primaryId) : null;

      pushSection(lines, "Workspace Summary", [
        `- Primary condition: ${primary ? primary.name : "(none)"}`,
        `- Linked relationships: ${(wsState.links || []).length}`,
        `- Evidence readiness: ${totals.done}/${totals.total}${totals.total ? ` (${Math.round((totals.done / totals.total) * 100)}%)` : ""}`,
      ]);

      items.forEach((item, index) => {
        const evidenceState = loadEvidenceState(item.id);
        const evSummary = evidenceSummary(item, evidenceState);
        const notes = (loadNotes(item.id) || "").trim();
        const linksToItem = (wsState.links || []).filter((link) => link.to === item.id);

        lines.push("=".repeat(60));
        lines.push(`${index + 1}) ${item.name} (${item.id})`);
        lines.push(`Body system: ${item.body_system || "(unknown)"}`);

        if (item.id === wsState.primaryId) {
          lines.push("Role: Primary");
        } else if (linksToItem.length) {
          lines.push("Role: Linked");
          lines.push("Linked to:");
          linksToItem.forEach((link) => {
            const parent = getConditionById(link.from);
            const parentName = parent ? parent.name : link.from;
            lines.push(`- ${parentName} (${link.type || "Secondary to"})`);
          });
        } else {
          lines.push("Role: Unlinked (in workspace)");
        }
        lines.push("");
        pushSection(lines, "Condition Snapshot", [
          `- Evidence readiness: ${evSummary.done}/${evSummary.total} (${evSummary.pct}%)`,
          `- Notes saved: ${notes ? "Yes" : "No"}`,
          `- Relationship count: ${relationshipRows(item, wsState).length}`,
        ]);
        pushSection(lines, "Relationship Summary", relationshipRows(item, wsState));
        pushSection(lines, "CFR References", (item.cfr || []).flatMap((reference) => {
          const rows = [`- ${reference.section || ""} | DC ${reference.diagnostic_code || ""} | ${reference.title || ""}`];
          if (reference.url) rows.push(`  Source: ${reference.url}`);
          return rows;
        }));

        if (item.strategy && item.strategy.length) {
          pushSection(lines, "Claim Strategy (Educational)", item.strategy.map((step) => `- ${step}`));
        }

        pushSection(lines, "Evidence Checklist", (item.evidence_checklist || []).map((entry, idx) => {
          const mark = evidenceState[idx] ? "[x]" : "[ ]";
          return `${mark} ${entry}`;
        }));

        pushSection(lines, "Notes", [notes ? notes : "(none)"]);
        pushSection(lines, "Recommended Next Steps", nextStepRows(item, evidenceState, notes, wsState));
      });

      lines.push("=".repeat(60));
      lines.push("Disclaimer: Educational only. Not legal advice/representation.");
      return lines.join("\n");
    }

    function downloadText(filename, text) {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }

    return {
      makeSharePayload,
      applySharePayload,
      buildClaimPacketText,
      buildWorkspacePacketText,
      downloadText,
    };
  }

  return {
    base64UrlEncode,
    base64UrlDecode,
    createWorkspaceExportApi,
  };
});
