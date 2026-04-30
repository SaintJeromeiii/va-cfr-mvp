(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrSecondaryConditionsFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createSecondaryConditionsApi(deps) {
    const {
      documentRef = document,
      getConditions,
      getConditionById,
      loadEvidenceState,
      saveEvidenceState,
      ensureNode,
      renderWorkspace,
      showDetail,
      escapeHtml,
    } = deps;

    function conditionEvidenceCount(condId) {
      const cond = getConditionById(condId);
      return cond && Array.isArray(cond.evidence_checklist) ? cond.evidence_checklist.length : 0;
    }

    function conditionEvidenceDone(condId) {
      const cond = getConditionById(condId);
      if (!cond) return 0;
      const state = loadEvidenceState(condId);
      return (cond.evidence_checklist || []).reduce((acc, _, idx) => acc + (state[idx] ? 1 : 0), 0);
    }

    function renderSecondaryCard(condId) {
      const cond = getConditionById(condId);
      const wrapper = documentRef.createElement("div");
      wrapper.className = "secondaryCard";

      if (!cond) {
        wrapper.textContent = condId;
        return wrapper;
      }

      const state = loadEvidenceState(cond.id);
      const total = (cond.evidence_checklist || []).length;
      const done = (cond.evidence_checklist || []).reduce((acc, _, idx) => acc + (state[idx] ? 1 : 0), 0);

      const title = documentRef.createElement("div");
      title.innerHTML = `<strong>${escapeHtml(cond.name)}</strong>`;
      const openBtn = documentRef.createElement("button");
      openBtn.className = "miniBtn";
      openBtn.type = "button";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", () => showDetail(cond.id));
      title.appendChild(openBtn);
      wrapper.appendChild(title);

      const summary = documentRef.createElement("div");
      summary.className = "small";
      summary.style.marginTop = "6px";
      summary.textContent = `Checklist: ${done}/${total}`;
      wrapper.appendChild(summary);

      const list = documentRef.createElement("div");
      list.className = "secEvList";
      list.style.marginTop = "8px";

      if (!total) {
        list.innerHTML = `<div class="small">(No checklist available for this condition)</div>`;
      } else {
        list.innerHTML = (cond.evidence_checklist || []).map((text, idx) => {
          const checked = state[idx] ? "checked" : "";
          return `
            <label class="evItem">
              <input type="checkbox" class="secondaryEvCheck" data-idx="${idx}" data-cond="${escapeHtml(cond.id)}" ${checked} />
              <span>${escapeHtml(text)}</span>
            </label>
          `;
        }).join("");
      }

      wrapper.appendChild(list);

      list.querySelectorAll("input.secondaryEvCheck").forEach((checkbox) => {
        checkbox.addEventListener("change", (event) => {
          const current = event.currentTarget;
          const idx = Number(current.dataset.idx);
          const cid = current.dataset.cond;
          const stObj = loadEvidenceState(cid);
          stObj[idx] = current.checked;
          saveEvidenceState(cid, stObj);
          try {
            ensureNode(cid);
          } catch (_) {}
          renderWorkspace();
          summary.textContent = `Checklist: ${conditionEvidenceDone(cid)}/${conditionEvidenceCount(cid)}`;
        });
      });

      return wrapper;
    }

    return {
      renderSecondaryCard,
      conditionEvidenceCount,
      conditionEvidenceDone,
    };
  }

  return { createSecondaryConditionsApi };
});
