(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrWorkspaceUiFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createWorkspaceUiApi(deps) {
    const {
      documentRef = document,
      loadWorkspaceState,
      saveWorkspaceState,
      loadEvidenceState,
      loadEvidenceLinks = () => [],
      loadNotes = () => "",
      getConditions,
      getConditionById,
      escapeHtml,
      systemClassName,
      REL_TYPES,
      isOrphan,
      showDetail,
      setPrimary,
      removeNode,
      updateLinkType,
      removeLink,
      addLink,
      renderHealthPanel,
      alertFn = (msg) => alert(msg),
      cssEscape = (value) => CSS.escape(value),
    } = deps;

    const api = {};
    let activeRiskFilterKey = "";

    function evidenceCompletion(item, state) {
      const total = (item.evidence_checklist || []).length;
      if (!total) return { done: 0, total: 0, pct: 0 };
      const done = (item.evidence_checklist || []).reduce(
        (acc, _, idx) => acc + (state[idx] ? 1 : 0),
        0,
      );
      return { done, total, pct: Math.round((done / total) * 100) };
    }

    function workspaceCompletion(conditions) {
      let done = 0;
      let total = 0;

      (conditions || []).forEach((item) => {
        const state = loadEvidenceState(item.id);
        const count = (item.evidence_checklist || []).length;
        total += count;
        done += (item.evidence_checklist || []).reduce(
          (acc, _, idx) => acc + (state[idx] ? 1 : 0),
          0,
        );
      });

      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    }

    function parentsOf(childId, links) {
      return (links || []).filter((link) => link.to === childId);
    }

    function buildAdjacency(links) {
      const childrenBy = new Map();
      (links || []).forEach((link) => {
        if (!childrenBy.has(link.from)) childrenBy.set(link.from, []);
        childrenBy.get(link.from).push(link);
      });
      return childrenBy;
    }

    function relationshipSummary(item, st) {
      if (item.id === st.primaryId) return "Primary condition";
      const linksToMe = parentsOf(item.id, st.links);
      if (!linksToMe.length) return "Unlinked in workspace";
      return linksToMe
        .slice(0, 2)
        .map((link) => {
          const parent = getConditionById(link.from);
          const parentName = parent ? parent.name : link.from;
          return `${link.type || "Secondary to"} ${parentName}`;
        })
        .join(" • ");
    }

    function nextStepHint(item, st, evidence) {
      const total = evidence.total || 0;
      if (total && evidence.done < total) {
        return `Finish checklist items (${evidence.done}/${total}) to improve readiness.`;
      }
      if (item.id !== st.primaryId && !parentsOf(item.id, st.links).length) {
        return "Link this condition to a parent if it belongs in the claim chain.";
      }
      if (item.id !== st.primaryId && parentsOf(item.id, st.links).length) {
        const evidenceLinks = loadEvidenceLinks(item.id);
        const notes = (loadNotes(item.id) || "").trim();
        if (!evidenceLinks.length) {
          return "Add supporting evidence links for this secondary condition so the relationship has visible support.";
        }
        if (!notes) {
          return "Add notes explaining the secondary relationship, timeline, and nexus/support details.";
        }
      }
      if (!Array.isArray(item.cfr) || !item.cfr.length) {
        return "Verify CFR references before exporting this condition.";
      }
      return "This item is in good shape for educational review.";
    }

    function summarizeWorkspaceRisks(items, st) {
      const linkedSecondaries = (items || []).filter((item) => item.id !== st.primaryId && parentsOf(item.id, st.links).length);
      const missingSupportIds = linkedSecondaries.filter((item) => !loadEvidenceLinks(item.id).length).map((item) => item.id);
      const missingNotesIds = linkedSecondaries.filter((item) => !(loadNotes(item.id) || "").trim()).map((item) => item.id);
      const disconnectedIds = (items || []).filter((item) => item.id !== st.primaryId && !parentsOf(item.id, st.links).length).map((item) => item.id);
      const lowReadinessIds = (items || []).filter((item) => {
        const summary = evidenceCompletion(item, loadEvidenceState(item.id));
        return summary.total > 0 && summary.done < summary.total;
      }).map((item) => item.id);

      return [
        {
          key: "missing-support",
          ids: missingSupportIds,
          label: missingSupportIds.length ? `${missingSupportIds.length} linked secondar${missingSupportIds.length === 1 ? "y" : "ies"} missing support links` : "Secondary support links look covered",
          level: missingSupportIds.length ? "warn" : "ok",
        },
        {
          key: "missing-notes",
          ids: missingNotesIds,
          label: missingNotesIds.length ? `${missingNotesIds.length} linked item${missingNotesIds.length === 1 ? "" : "s"} missing notes` : "Linked items have notes",
          level: missingNotesIds.length ? "warn" : "ok",
        },
        {
          key: "disconnected",
          ids: disconnectedIds,
          label: disconnectedIds.length ? `${disconnectedIds.length} workspace item${disconnectedIds.length === 1 ? "" : "s"} not linked into the chain` : "Workspace chain is connected",
          level: disconnectedIds.length ? "warn" : "ok",
        },
        {
          key: "low-readiness",
          ids: lowReadinessIds,
          label: lowReadinessIds.length ? `${lowReadinessIds.length} item${lowReadinessIds.length === 1 ? "" : "s"} still have checklist gaps` : "Checklist coverage looks strong",
          level: lowReadinessIds.length ? "warn" : "ok",
        },
      ];
    }

    function renderClaimTree() {
      const treeEl = documentRef.getElementById("tree");
      if (!treeEl) return;

      const conditions = getConditions();
      const st = loadWorkspaceState();
      const items = (st.nodes || []).map((id) => getConditionById(id)).filter(Boolean);
      const risks = summarizeWorkspaceRisks(items, st);
      const activeRisk = risks.find((risk) => risk.key === activeRiskFilterKey) || null;
      const activeIds = new Set(activeRisk?.ids || []);
      const primary = st.primaryId ? getConditionById(st.primaryId) : null;

      if (!primary) {
        treeEl.innerHTML = `<div class="small treeHint">No Primary set yet. In the Workspace, click "Set Primary".</div>`;
        return;
      }

      const childrenBy = buildAdjacency(st.links);
      const levels = [];
      const seen = new Set();
      const q = [{ id: primary.id, depth: 0 }];

      while (q.length) {
        const cur = q.shift();
        if (seen.has(cur.id)) continue;
        seen.add(cur.id);
        if (!levels[cur.depth]) levels[cur.depth] = [];
        levels[cur.depth].push(cur.id);
        (childrenBy.get(cur.id) || []).forEach((link) => q.push({ id: link.to, depth: cur.depth + 1 }));
      }

      const nodeW = 340;
      const nodeH = 64;
      const padX = 30;
      const padY = 20;
      const gapX = 90;
      const gapY = 22;
      const maxCols = levels.length || 1;
      const maxRows = Math.max(...levels.map((arr) => arr.length), 1);
      const width = padX * 2 + maxCols * nodeW + (maxCols - 1) * gapX;
      const height = padY * 2 + maxRows * nodeH + (maxRows - 1) * gapY;
      const pos = new Map();

      levels.forEach((ids, depth) => {
        ids.forEach((id, idx) => {
          pos.set(id, {
            x: padX + depth * (nodeW + gapX),
            y: padY + idx * (nodeH + gapY),
          });
        });
      });

      const nodeHtml = (id, label, x, y, badge) => `
        <g class="treeNode${activeIds.size ? (activeIds.has(id) ? " highlighted" : " dimmed") : ""}" data-id="${escapeHtml(id)}" transform="translate(${x},${y})">
          <rect width="${nodeW}" height="${nodeH}"></rect>
          ${(() => {
            const approxChar = 7;
            const padRight = 140;
            const maxChars = Math.max(18, Math.floor((nodeW - padRight) / approxChar));
            const words = (label || "").split(/\s+/).filter(Boolean);
            const lines = [];
            let cur = "";

            for (const word of words) {
              if ((cur + " " + word).trim().length <= maxChars) cur = (cur + " " + word).trim();
              else {
                lines.push(cur);
                cur = word;
                if (lines.length >= 1) break;
              }
            }
            if (cur) lines.push(cur);
            if (lines.length > 2) {
              const first = lines[0];
              let second = lines.slice(1).join(" ");
              if (second.length > maxChars) second = second.slice(0, maxChars - 3) + "...";
              lines.length = 0;
              lines.push(first, second);
            }
            if (lines.length === 1) lines.push("");

            return `
              <text fill="rgba(255,255,255,0.95)" style="font-size:13px;font-weight:600">
                <tspan x="12" y="22">${escapeHtml(lines[0] || "")}</tspan>
                <tspan x="12" y="40">${escapeHtml(lines[1] || "")}</tspan>
              </text>
            `;
          })()}
          ${badge ? `<text x="${nodeW - 12}" y="22" fill="rgba(255,255,255,0.65)" style="font-size:12px;text-anchor:end">${escapeHtml(badge)}</text>` : ""}
        </g>
      `;

      let lines = "";
      let labels = "";
      let nodes = "";

      (st.links || []).forEach((link) => {
        const p = pos.get(link.from);
        const c = pos.get(link.to);
        if (!p || !c) return;

        const x1 = p.x + nodeW;
        const y1 = p.y + nodeH / 2;
        const x2 = c.x;
        const y2 = c.y + nodeH / 2;

        const edgeActive = !activeIds.size || activeIds.has(link.from) || activeIds.has(link.to);
        lines += `<line class="treeLine${edgeActive ? "" : " dimmed"}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
        labels += `<text x="${(x1 + x2) / 2 + 6}" y="${(y1 + y2) / 2 - 6}" fill="rgba(255,255,255,0.55)">${escapeHtml(link.type || "Secondary to")}</text>`;
      });

      pos.forEach((p, id) => {
        const item = conditions.find((condition) => condition.id === id);
        if (!item) return;
        const badge = id === st.primaryId ? `Primary • ${item.body_system || ""}` : `${item.body_system || ""}`;
        nodes += nodeHtml(id, item.name, p.x, p.y, badge);
      });

      treeEl.innerHTML = `
        <svg class="treeSvg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
          ${lines}
          ${labels}
          ${nodes}
        </svg>
      `;

      treeEl.querySelectorAll(".treeNode").forEach((group) => {
        group.addEventListener("click", () => {
          const id = group.getAttribute("data-id");
          if (!id) return;
          showDetail(id);
          documentRef.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }

    function renderWorkspace() {
      const wsList = documentRef.getElementById("wsList");
      const wsScore = documentRef.getElementById("wsScore");
      const wsOrphans = documentRef.getElementById("wsOrphans");
      const wsBarFill = documentRef.getElementById("wsBarFill");
      const wsRiskSummary = documentRef.getElementById("wsRiskSummary");
      const wsRiskFilterBar = documentRef.getElementById("wsRiskFilterBar");
      const wsRiskFilterText = documentRef.getElementById("wsRiskFilterText");
      const wsRiskFilterClear = documentRef.getElementById("wsRiskFilterClear");
      if (!wsList || !wsScore || !wsBarFill) return;

      const st = loadWorkspaceState();
      const items = st.nodes.map((id) => getConditionById(id)).filter(Boolean);

      wsList.innerHTML = "";

      if (!items.length) {
        wsScore.textContent = "Evidence Readiness: 0/0 (0%)";
        wsBarFill.style.width = "0%";
        if (wsRiskSummary) wsRiskSummary.innerHTML = "";
        if (wsRiskFilterBar) wsRiskFilterBar.classList.add("hidden");
        wsList.innerHTML = `<div class="small">Workspace is empty. Open a condition and click “Add to Workspace”.</div>`;
        return;
      }

      const { done, total, pct } = workspaceCompletion(items);
      wsScore.textContent = `Evidence Readiness: ${done}/${total} (${pct}%)`;
      wsBarFill.style.width = `${pct}%`;

      const orphanItems = items.filter((item) => isOrphan(item.id, st));
      if (wsOrphans) wsOrphans.textContent = `Orphans: ${orphanItems.length}`;
      const risks = summarizeWorkspaceRisks(items, st);
      const activeRisk = risks.find((risk) => risk.key === activeRiskFilterKey) || null;
      if (activeRiskFilterKey && !activeRisk?.ids?.length) activeRiskFilterKey = "";
      const visibleItems = activeRisk?.ids?.length
        ? items.filter((item) => activeRisk.ids.includes(item.id))
        : items;

      if (wsRiskSummary) {
        wsRiskSummary.innerHTML = risks
          .map((risk) => `<button class="wsRiskChip${risk.key === activeRiskFilterKey ? " active" : ""}" data-level="${escapeHtml(risk.level)}" data-risk-key="${escapeHtml(risk.key)}" data-risk-ids="${escapeHtml((risk.ids || []).join(","))}" type="button">${escapeHtml(risk.label)}</button>`)
          .join("");

        wsRiskSummary.querySelectorAll(".wsRiskChip").forEach((chip) => {
          chip.addEventListener("click", () => {
            const key = chip.dataset.riskKey || "";
            activeRiskFilterKey = activeRiskFilterKey === key ? "" : key;
            renderWorkspace();
          });
        });
      }
      if (wsRiskFilterBar && wsRiskFilterText) {
        if (activeRisk?.ids?.length) {
          wsRiskFilterBar.classList.remove("hidden");
          wsRiskFilterText.textContent = `Focused view: ${activeRisk.label}`;
        } else {
          wsRiskFilterBar.classList.add("hidden");
          wsRiskFilterText.textContent = "";
        }
      }
      if (wsRiskFilterClear) {
        wsRiskFilterClear.onclick = () => {
          activeRiskFilterKey = "";
          renderWorkspace();
        };
      }

      visibleItems.forEach((item) => {
        const isPrimary = item.id === st.primaryId;
        const orphan = isOrphan(item.id, st);
        const stNow = loadWorkspaceState();
        const parentLinks = parentsOf(item.id, stNow.links);
        const candidates = stNow.nodes.filter((id) => id !== item.id);
        const ev = evidenceCompletion(item, loadEvidenceState(item.id));

        const card = documentRef.createElement("div");
        card.className = `wsCard ${systemClassName(item.body_system)}${orphan ? " orphan" : ""}`;
        card.dataset.conditionId = item.id;
        if (activeRisk?.ids?.includes(item.id)) card.classList.add("highlighted");
        card.innerHTML = `
          <div class="wsRow">
            <div style="min-width:260px">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                ${orphan ? `<span class="orphanBadge">Orphan</span>` : ""}
                ${isPrimary ? `<span class="wsBadge">Primary</span>` : `<span class="wsBadge">Linked</span>`}
              </div>
              <div class="small">${escapeHtml(item.body_system || "")} • ${ev.done}/${ev.total} (${ev.pct}%)</div>
              <div class="wsSummaryRow">
                <span class="wsSummaryLabel">Relationship</span>
                <span class="small">${escapeHtml(relationshipSummary(item, stNow))}</span>
              </div>
              <div class="wsSummaryRow">
                <span class="wsSummaryLabel">Next</span>
                <span class="small">${escapeHtml(nextStepHint(item, stNow, ev))}</span>
              </div>
              ${isPrimary ? "" : `
                <div class="small" style="margin-top:10px"><strong>Linked to (parents):</strong></div>
                <div class="wsLinks">
                  ${
                    parentLinks.length
                      ? parentLinks.map((link) => {
                          const parentItem = getConditionById(link.from);
                          const parentName = parentItem ? parentItem.name : link.from;
                          return `
                            <div class="wsLinkRow">
                              <div class="small"><strong>${escapeHtml(parentName)}</strong></div>
                              <select class="wsRelSelect" data-from="${escapeHtml(link.from)}" data-to="${escapeHtml(item.id)}">
                                ${REL_TYPES.map((type) => `<option value="${escapeHtml(type)}" ${type === (link.type || "Secondary to") ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
                              </select>
                              <button class="miniBtn danger" data-unlink-from="${escapeHtml(link.from)}" data-unlink-to="${escapeHtml(item.id)}" type="button">Remove link</button>
                            </div>
                          `;
                        }).join("")
                      : `<div class="small">(no parent links yet)</div>`
                  }
                </div>
                <div class="small" style="margin-top:10px">Add parent link:</div>
                <div class="wsAddLinkRow">
                  <select class="wsAddParentSelect" data-child="${escapeHtml(item.id)}">
                    <option value="">Choose parent…</option>
                    ${candidates.map((pid) => {
                      const parentItem = getConditionById(pid);
                      const label = parentItem ? parentItem.name : pid;
                      return `<option value="${escapeHtml(pid)}">${escapeHtml(label)}</option>`;
                    }).join("")}
                  </select>
                  <select class="wsAddTypeSelect" data-child="${escapeHtml(item.id)}">
                    ${REL_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
                  </select>
                  <button class="miniBtn" data-addlink="${escapeHtml(item.id)}" type="button">Add</button>
                </div>
              `}
            </div>
            <div class="wsRowBtns">
              <button class="miniBtn" data-open="${item.id}" type="button">Open</button>
              ${isPrimary ? "" : `<button class="miniBtn" data-primary="${item.id}" type="button">Set Primary</button>`}
              ${orphan && st.primaryId ? `<button class="miniBtn" data-link-primary="${escapeHtml(item.id)}" type="button">Link to Primary</button>` : ""}
              <button class="miniBtn danger" data-rm="${item.id}" type="button">Remove</button>
            </div>
          </div>
        `;

        wsList.appendChild(card);
      });

      if (!visibleItems.length) {
        wsList.innerHTML = `<div class="small">No workspace items match the current risk focus.</div>`;
      }

      wsList.querySelectorAll("button[data-open]").forEach((button) => {
        button.addEventListener("click", () => showDetail(button.dataset.open));
      });
      wsList.querySelectorAll("button[data-primary]").forEach((button) => {
        button.addEventListener("click", () => {
          setPrimary(button.dataset.primary);
          api.renderWorkspace();
          api.renderClaimTree();
          renderHealthPanel();
        });
      });
      wsList.querySelectorAll("button[data-rm]").forEach((button) => {
        button.addEventListener("click", () => {
          removeNode(button.dataset.rm);
          api.renderWorkspace();
          api.renderClaimTree();
          renderHealthPanel();
        });
      });
      wsList.querySelectorAll("select.wsRelSelect").forEach((select) => {
        select.addEventListener("change", () => {
          updateLinkType(select.dataset.from, select.dataset.to, select.value);
          api.renderWorkspace();
          api.renderClaimTree();
          renderHealthPanel();
        });
      });
      wsList.querySelectorAll("button[data-unlink-from]").forEach((button) => {
        button.addEventListener("click", () => {
          removeLink(button.dataset.unlinkFrom, button.dataset.unlinkTo);
          api.renderWorkspace();
          api.renderClaimTree();
          renderHealthPanel();
        });
      });
      wsList.querySelectorAll("button[data-addlink]").forEach((button) => {
        button.addEventListener("click", () => {
          const childId = button.dataset.addlink;
          const parentSel = wsList.querySelector(`select.wsAddParentSelect[data-child="${cssEscape(childId)}"]`);
          const typeSel = wsList.querySelector(`select.wsAddTypeSelect[data-child="${cssEscape(childId)}"]`);
          const parentId = parentSel?.value || "";
          const relType = typeSel?.value || "Secondary to";
          if (!parentId) return;

          try {
            addLink(parentId, childId, relType);
            api.renderWorkspace();
            api.renderClaimTree();
            renderHealthPanel();
          } catch (error) {
            alertFn(error.message || "That link would create a cycle. Choose a different parent.");
          }
        });
      });
      wsList.querySelectorAll("button[data-link-primary]").forEach((button) => {
        button.addEventListener("click", () => {
          const childId = button.dataset.linkPrimary;
          const st2 = loadWorkspaceState();
          if (!st2.primaryId) return;

          try {
            addLink(st2.primaryId, childId, "Secondary to");
            api.renderWorkspace();
            api.renderClaimTree();
            renderHealthPanel();
          } catch (error) {
            alertFn(error.message || "Could not link to Primary.");
          }
        });
      });

      api.renderClaimTree();
      renderHealthPanel();
    }

    api.evidenceCompletion = evidenceCompletion;
    api.workspaceCompletion = workspaceCompletion;
    api.parentsOf = parentsOf;
    api.buildAdjacency = buildAdjacency;
    api.relationshipSummary = relationshipSummary;
    api.nextStepHint = nextStepHint;
    api.summarizeWorkspaceRisks = summarizeWorkspaceRisks;
    api.renderWorkspace = renderWorkspace;
    api.renderClaimTree = renderClaimTree;
    return api;
  }

  return { createWorkspaceUiApi };
});
