(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrWorkspaceDraftsFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createWorkspaceDraftsApi(deps) {
    const {
      loadWorkspaceState,
      getConditionById,
      loadNotes,
      loadTimeline,
      loadEvidenceLinks,
      loadEvidenceState,
      evidenceCompletion,
      toSortableDateKey,
      now = () => new Date().toLocaleString(),
    } = deps;

    function shortCfrRefs(cond) {
      const refs = (cond?.cfr || []).slice(0, 2);
      if (!refs.length) return "";
      return refs.map((ref) => {
        const secShort = (ref.section || "").replace(/38\s*cfr\s*§/i, "").trim();
        const dc = (ref.diagnostic_code || "").toString().trim();
        const title = (ref.title || "").trim();
        const parts = [];
        if (secShort) parts.push(`§${secShort}`);
        else if (ref.section) parts.push(ref.section);
        if (dc) parts.push(`DC ${dc}`);
        if (title) parts.push(title);
        return parts.join(" — ");
      }).join(" | ");
    }

    function firstLine(text, fallback = "") {
      const trimmed = (text || "").trim();
      if (!trimmed) return fallback;
      const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      return lines[0] || fallback;
    }

    function isLinkedNode(nodeId, st) {
      if (!nodeId) return false;
      if (nodeId === st.primaryId) return true;
      return (st.links || []).some((link) => link.to === nodeId || link.from === nodeId);
    }

    function roleLineForNode(nodeId, st) {
      if (nodeId === st.primaryId) return "Role: Primary";
      const linksToMe = (st.links || []).filter((link) => link.to === nodeId);
      if (!linksToMe.length) return "Role: Unlinked (in workspace)";
      return "Role: Linked";
    }

    function linkedToLines(nodeId, st) {
      if (nodeId === st.primaryId) return [];
      const linksToMe = (st.links || []).filter((link) => link.to === nodeId);
      if (!linksToMe.length) return [];

      return linksToMe.map((link) => {
        const parent = getConditionById(link.from);
        const parentName = parent ? parent.name : link.from;
        return `- Linked to: ${parentName} (${link.type || "Secondary to"})`;
      });
    }

    function relationshipSentence(childId, st) {
      const linksToMe = (st.links || []).filter((link) => link.to === childId);
      if (!linksToMe.length) return "";

      const parts = linksToMe.slice(0, 2).map((link) => {
        const parent = getConditionById(link.from);
        const parentName = parent ? parent.name : link.from;
        return `${link.type || "Secondary to"} ${parentName}`;
      });

      if (parts.length === 1) return `This condition is modeled as ${parts[0]}.`;
      return `This condition is modeled as ${parts.join(" and ")}.`;
    }

    function autoDraftParagraph(cond, st, style = "concise") {
      const notes = (loadNotes(cond.id) || "").trim();
      const opening = firstLine(notes, "");
      if (opening) {
        if (style === "detailed") {
          const rel = relationshipSentence(cond.id, st);
          return `${opening} ${rel ? `${rel} ` : ""}Functional impact, frequency/severity, and treatment history can be expanded in Notes.`;
        }
        return opening;
      }

      const rel = relationshipSentence(cond.id, st);
      const body = cond.body_system ? `within the ${cond.body_system} system` : "within the VA rating system";
      const cfr = shortCfrRefs(cond);
      const cfrPart = cfr ? `Relevant rating reference(s) include ${cfr}. ` : "";

      if (cond.id === st.primaryId) {
        if (style === "detailed") {
          return `The Veteran seeks consideration for ${cond.name} ${body}. ${cfrPart}Add Notes describing symptom timeline, frequency/severity, and occupational/social impact, then regenerate this draft.`;
        }
        return `The Veteran seeks consideration for ${cond.name}. Add Notes describing symptoms and functional impact, then regenerate.`;
      }

      if (style === "detailed") {
        return `The Veteran reports ${cond.name} ${body}. ${rel ? `${rel} ` : ""}${cfrPart}Add Notes describing onset/timeline, current severity, functional impact, and treatment history, then regenerate this draft.`;
      }

      return `The Veteran reports ${cond.name}. ${rel ? `${rel} ` : ""}Add Notes for timeline, severity, and impact, then regenerate.`;
    }

    function workspaceTimelineDraft(scope = "all") {
      const st = loadWorkspaceState();
      const primaryId = st.primaryId || "";
      let ids = (st.nodes || []).slice();

      if (scope === "primary") {
        ids = primaryId ? [primaryId] : [];
      } else if (scope === "linked") {
        ids = ids.filter((id) => isLinkedNode(id, st));
        if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
      }

      const merged = [];
      ids.forEach((id) => {
        const cond = getConditionById(id);
        if (!cond) return;

        loadTimeline(id).forEach((entry) => {
          merged.push({
            conditionId: id,
            conditionName: cond.name,
            date: entry.date,
            type: entry.type,
            note: entry.note,
          });
        });
      });

      merged.sort((a, b) => toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)));

      const lines = [];
      lines.push("VA CFR Finder — Workspace Timeline (Educational)");
      lines.push(now());
      lines.push("");

      if (!merged.length) {
        lines.push("(No timeline entries found in this scope.)");
        return lines.join("\n");
      }

      merged.forEach((entry) => {
        lines.push(`${entry.date || ""} • ${entry.type || "Other"} • ${entry.conditionName}`);
        lines.push(`${entry.note || ""}`);
        lines.push("");
      });

      return lines.join("\n");
    }

    function generateNarrativeDraft(options = {}) {
      const linkedOnly = !!options.linkedOnly;
      const style = options.style === "detailed" ? "detailed" : "concise";
      const st = loadWorkspaceState();
      const nodes = (st.nodes || []).slice();
      let chosenNodes = nodes;

      if (linkedOnly) {
        chosenNodes = nodes.filter((id) => isLinkedNode(id, st));
        if (st.primaryId && !chosenNodes.includes(st.primaryId)) chosenNodes.unshift(st.primaryId);
      }

      const primary = st.primaryId ? getConditionById(st.primaryId) : null;
      if (!primary) {
        return "No Primary is set. Set a Primary in the Workspace first, then generate the narrative.";
      }

      const items = chosenNodes
        .map((id) => getConditionById(id))
        .filter(Boolean)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      const primaryFirst = [primary, ...items.filter((item) => item.id !== primary.id)];
      const lines = [];
      lines.push("VA CFR Finder — Claim Narrative Draft (Educational)");
      lines.push(now());
      lines.push("");
      lines.push("DISCLAIMER: This is an educational draft only. It is not legal advice and not representation. Always verify current CFR language and consult an accredited representative if needed.");
      lines.push("");
      lines.push(`PRIMARY CONDITION: ${primary.name}`);
      lines.push(`CFR refs (high-level): ${shortCfrRefs(primary) || "(none listed)"}`);

      const primaryNotes = (loadNotes(primary.id) || "").trim();
      lines.push("");
      lines.push("Primary notes (user-entered):");
      lines.push(primaryNotes || "(none)");
      lines.push("");
      lines.push("RELATIONSHIP SUMMARY (from workspace links):");

      if (!(st.links || []).length) {
        lines.push("- (no links yet)");
      } else {
        (st.links || []).forEach((link) => {
          const from = getConditionById(link.from);
          const to = getConditionById(link.to);
          lines.push(`- ${(to ? to.name : link.to)} — ${link.type || "Secondary to"} — ${(from ? from.name : link.from)}`);
        });
      }

      const mergedTimeline = workspaceTimelineDraft(linkedOnly ? "linked" : "all");
      const hasAnyTimeline = !mergedTimeline.includes("(No timeline entries");
      lines.push("");
      lines.push("TIMELINE (if provided):");
      if (hasAnyTimeline) {
        lines.push(...mergedTimeline.split("\n").slice(3));
      } else {
        lines.push("(No timeline entries yet — add timelines in each condition detail view.)");
      }

      lines.push("");
      lines.push("CONDITION-BY-CONDITION DRAFT:");
      lines.push("");

      primaryFirst.forEach((cond) => {
        const ev = evidenceCompletion(cond, loadEvidenceState(cond.id));
        const notes = (loadNotes(cond.id) || "").trim();
        lines.push("------------------------------------------------------------");
        lines.push(`${cond.name}`);
        lines.push(roleLineForNode(cond.id, st));
        linkedToLines(cond.id, st).forEach((line) => lines.push(line));
        lines.push(`Body system: ${cond.body_system || "(not set)"}`);
        lines.push(`CFR refs (high-level): ${shortCfrRefs(cond) || "(none listed)"}`);
        lines.push(`Evidence readiness: ${ev.done}/${ev.total} (${ev.pct}%)`);
        lines.push(`Evidence links saved: ${loadEvidenceLinks(cond.id).length}`);
        lines.push("");
        lines.push(`Draft paragraph: ${autoDraftParagraph(cond, st, style)}`);

        if (Array.isArray(cond.evidence_checklist) && cond.evidence_checklist.length) {
          lines.push("");
          lines.push("Evidence categories (educational):");
          cond.evidence_checklist.forEach((entry) => lines.push(`- ${entry}`));
        }

        lines.push("");
        lines.push("Notes (verbatim):");
        lines.push(notes || "(none)");
        lines.push("");
      });

      lines.push("------------------------------------------------------------");
      lines.push("NEXT STEPS (Educational):");
      lines.push("- Fill in missing Notes for each linked condition (timeline, severity, functional impact, treatment).");
      lines.push("- Ensure evidence checklist items are supported by your records or statements.");
      lines.push("- If filing secondary relationships, consider adding clear medical nexus language in notes (from your provider if applicable).");
      lines.push("- Consult an accredited representative for claim-specific guidance.");
      lines.push("");

      return lines.join("\n");
    }

    return {
      shortCfrRefs,
      firstLine,
      roleLineForNode,
      linkedToLines,
      isLinkedNode,
      relationshipSentence,
      autoDraftParagraph,
      workspaceTimelineDraft,
      generateNarrativeDraft,
    };
  }

  return { createWorkspaceDraftsApi };
});
