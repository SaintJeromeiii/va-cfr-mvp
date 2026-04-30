(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrSearchUiFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createSearchUiApi(deps) {
    const {
      documentRef = document,
      getConditions,
      parseCommandQuery,
      normalize,
      escapeHtml,
      systemClassName,
      debounce,
      showDetail,
      ensureNode,
      renderWorkspace,
      alertFn = (msg) => alert(msg),
    } = deps;

    function escapeRegExp(str) {
      return (str ?? "").toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function highlight(text, query) {
      const q = normalize(query);
      const raw = (text ?? "").toString();
      if (!q) return escapeHtml(raw);
      const re = new RegExp(escapeRegExp(q), "ig");
      return escapeHtml(raw).replace(re, (match) => `<mark class="hl">${match}</mark>`);
    }

    function matches(condition, query) {
      const q = normalize(query);
      if (!q) return true;

      const cfrStrings = (condition.cfr || []).flatMap((ref) => [
        ref.diagnostic_code,
        ref.section,
        (ref.section || "").replace(/38\s*cfr\s*§/i, "").trim(),
        ref.title,
      ]);

      const haystack = [
        condition.name,
        condition.id,
        ...(condition.aliases || []),
        ...cfrStrings,
      ].map(normalize);

      return haystack.some((value) => value.includes(q));
    }

    function matchReason(condition, query) {
      const q = normalize(query);
      if (!q) return "";

      for (const ref of condition.cfr || []) {
        const dc = normalize(ref.diagnostic_code);
        if (dc === q) return "Diagnostic Code";
        if (dc.includes(q)) return "Diagnostic Code (partial)";
      }

      for (const ref of condition.cfr || []) {
        const section = normalize(ref.section);
        const short = normalize((ref.section || "").replace(/38\s*cfr\s*§/i, "").trim());
        if (short === q || section === q) return "CFR Section";
        if (short.includes(q) || section.includes(q)) return "CFR Section (partial)";
      }

      const name = normalize(condition.name);
      if (name === q) return "Name";
      if (name.startsWith(q)) return "Name (starts with)";
      if (name.includes(q)) return "Name (contains)";

      const id = normalize(condition.id);
      if (id === q) return "ID";
      if (id.includes(q)) return "ID (partial)";

      const aliases = (condition.aliases || []).map(normalize);
      if (aliases.some((alias) => alias === q)) return "Alias";
      if (aliases.some((alias) => alias.startsWith(q))) return "Alias (starts with)";
      if (aliases.some((alias) => alias.includes(q))) return "Alias (contains)";

      const titles = (condition.cfr || []).map((ref) => normalize(ref.title));
      if (titles.some((title) => title.includes(q))) return "CFR Title";

      return "Match";
    }

    function cfrSummary(condition) {
      const refs = (condition.cfr || []).slice(0, 2);
      if (!refs.length) return "";

      return refs.map((ref) => {
        const short = (ref.section || "").replace(/38\s*cfr\s*§/i, "").trim();
        const dc = ref.diagnostic_code ? `DC ${ref.diagnostic_code}` : "";
        const title = ref.title || "";
        const sec = short ? `§ ${short}` : (ref.section || "");
        return `${sec}${dc ? ` • ${dc}` : ""}${title ? ` • ${title}` : ""}`;
      }).join(" | ");
    }

    function scoreMatch(condition, query) {
      const q = normalize(query);
      if (!q) return 0;

      const name = normalize(condition.name);
      const id = normalize(condition.id);
      const aliases = (condition.aliases || []).map(normalize);
      const refs = (condition.cfr || []).map((ref) => ({
        section: normalize(ref.section),
        sectionShort: normalize((ref.section || "").replace(/38\s*cfr\s*§/i, "").trim()),
        dc: normalize(ref.diagnostic_code),
        title: normalize(ref.title),
      }));

      let score = 0;

      if (refs.some((ref) => ref.dc === q)) score += 1000;
      else if (refs.some((ref) => ref.dc.includes(q))) score += 500;

      if (id === q) score += 450;
      else if (id.includes(q)) score += 200;

      if (name === q) score += 420;
      else if (name.startsWith(q)) score += 260;
      else if (name.includes(q)) score += 160;

      if (aliases.some((alias) => alias === q)) score += 180;
      else if (aliases.some((alias) => alias.startsWith(q))) score += 120;
      else if (aliases.some((alias) => alias.includes(q))) score += 80;

      if (refs.some((ref) => ref.sectionShort === q)) score += 160;
      else if (refs.some((ref) => ref.sectionShort.includes(q))) score += 90;
      else if (refs.some((ref) => ref.section.includes(q))) score += 70;

      if (refs.some((ref) => ref.title.includes(q))) score += 60;

      return score;
    }

    function renderResults(list) {
      const el = documentRef.getElementById("results");
      if (!el) return;

      el.innerHTML = "";

      if (!list || !list.length) {
        el.innerHTML = `<div class="small">No matches. Try “8520”, “5260”, “8100”, or “ptsd”.</div>`;
        return;
      }

      const q = documentRef.getElementById("q")?.value || "";

      list.forEach((item) => {
        const div = documentRef.createElement("div");
        div.className = `result ${systemClassName(item.body_system)}`;

        const sys = item.body_system || "";
        const dc = item.cfr?.length ? item.cfr[0].diagnostic_code : "";
        const aliasesPreview = (item.aliases || []).slice(0, 3).join(", ");
        const reason = matchReason(item, q);
        const cfrLine = cfrSummary(item);
        const cfrHTML = cfrLine ? highlight(cfrLine, q) : "";

        div.innerHTML = `
          <div class="metaRow">
            ${sys ? `<span class="systemBadge ${systemClassName(sys)}">${escapeHtml(sys)}</span>` : ""}
            ${dc ? `<span class="dcBadge">${highlight(`DC ${dc}`, q)}</span>` : ""}
          </div>
          <div><strong>${highlight(item.name, q)}</strong></div>
          ${cfrHTML ? `
            <div class="cfrLine">
              <span class="cfrJump"
                data-dc="${escapeHtml(dc)}"
                data-sec="${escapeHtml((item.cfr?.[0]?.section || "").replace(/38\\s*cfr\\s*§/i, "").trim())}">
                CFR: ${cfrHTML}
              </span>
            </div>
          ` : ""}
          ${(q || "").trim() ? `<div class="matchNote">Matched: <strong>${escapeHtml(reason)}</strong></div>` : ""}
          <div class="small">Aliases: ${highlight(aliasesPreview, q)}${(item.aliases || []).length > 3 ? "…" : ""}</div>
        `;

        const cfrJumpEl = div.querySelector(".cfrJump");
        if (cfrJumpEl) {
          cfrJumpEl.addEventListener("click", (event) => {
            event.stopPropagation();
            const dcHint = (event.currentTarget.dataset.dc || "").trim();
            const secHint = (event.currentTarget.dataset.sec || "").trim();
            showDetail(item.id, true, dcHint || secHint);
          });
        }

        const addBtn = documentRef.createElement("button");
        addBtn.className = "miniBtn";
        addBtn.type = "button";
        addBtn.dataset.addToWs = item.id;
        addBtn.textContent = "+ Add to Workspace";
        addBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          ensureNode(item.id);
          renderWorkspace();
          alertFn("Added to workspace!");
        });

        const metaRow = div.querySelector(".metaRow");
        if (metaRow) metaRow.appendChild(addBtn);

        div.addEventListener("click", () => {
          const raw = documentRef.getElementById("q")?.value || "";
          const parsed = parseCommandQuery(raw);
          const hint = parsed.mode === "jump" ? parsed.jump : raw;
          showDetail(item.id, true, hint);
        });

        el.appendChild(div);
      });
    }

    function showLoadingResults() {
      const el = documentRef.getElementById("results");
      if (!el) return;
      el.innerHTML = "";
      for (let i = 0; i < 6; i += 1) {
        const div = documentRef.createElement("div");
        div.className = "result skeleton";
        div.innerHTML = `
          <div style="height:12px; width:60%; background:rgba(255,255,255,0.06); border-radius:6px; margin-bottom:8px"></div>
          <div style="height:10px; width:40%; background:rgba(255,255,255,0.04); border-radius:6px; margin-bottom:6px"></div>
          <div style="height:10px; width:80%; background:rgba(255,255,255,0.04); border-radius:6px"></div>
        `;
        el.appendChild(div);
      }
    }

    function hideLoadingResults() {}

    function populateSystemFilter(filterEl) {
      filterEl.innerHTML = `<option value="">All body systems</option>`;
      const systems = [...new Set((getConditions() || []).map((condition) => condition.body_system).filter(Boolean))].sort();
      systems.forEach((system) => {
        const option = documentRef.createElement("option");
        option.value = system;
        option.textContent = system;
        filterEl.appendChild(option);
      });
      return systems;
    }

    function mountSearchUi() {
      const input = documentRef.getElementById("q");
      const filter = documentRef.getElementById("systemFilter");
      const clearBtn = documentRef.getElementById("clearBtn");
      const legend = documentRef.getElementById("legend");

      if (!input || !filter) return;

      const systems = populateSystemFilter(filter);

      function applyFilters() {
        const parsed = parseCommandQuery(input.value || "");
        const q = parsed.mode === "text" ? parsed.text : (parsed.text || "");

        if (parsed.mode === "system" && parsed.system) {
          const target = parsed.system.toLowerCase();
          const options = [...filter.options].map((option) => option.value).filter(Boolean);
          const found = options.find((value) => value.toLowerCase() === target)
            || options.find((value) => value.toLowerCase().includes(target))
            || options.find((value) => target.includes(value.toLowerCase()));
          if (found) filter.value = found;
        }

        const sys = filter.value || "";
        let filtered = (getConditions() || []).filter((condition) => {
          const sysOk = !sys || condition.body_system === sys;
          return sysOk && matches(condition, q);
        });

        const normalizedQuery = normalize(q);
        if (normalizedQuery) {
          filtered = filtered
            .map((condition) => ({ condition, score: scoreMatch(condition, q) }))
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.condition);
        } else {
          filtered = filtered.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        }

        renderResults(filtered);
      }

      function clearAll() {
        input.value = "";
        filter.value = "";
        documentRef.querySelectorAll(".legendChip").forEach((chip) => chip.classList.remove("active"));
        applyFilters();
      }

      if (clearBtn) clearBtn.addEventListener("click", clearAll);

      const debouncedApply = debounce(applyFilters, 240);
      input.addEventListener("input", () => { showLoadingResults(); debouncedApply(); });
      input.addEventListener("keyup", () => { showLoadingResults(); debouncedApply(); });
      input.addEventListener("search", () => { showLoadingResults(); debouncedApply(); });
      filter.addEventListener("change", () => { showLoadingResults(); applyFilters(); });

      if (legend) {
        legend.innerHTML = "";
        systems.forEach((systemName) => {
          const chip = documentRef.createElement("span");
          chip.className = `systemBadge legendChip ${systemClassName(systemName)}`;
          chip.textContent = systemName;
          chip.addEventListener("click", () => {
            filter.value = systemName;
            documentRef.querySelectorAll(".legendChip").forEach((node) => node.classList.remove("active"));
            chip.classList.add("active");
            applyFilters();
          });
          legend.appendChild(chip);
        });
      }

      applyFilters();
    }

    return {
      escapeRegExp,
      highlight,
      matches,
      matchReason,
      cfrSummary,
      scoreMatch,
      renderResults,
      showLoadingResults,
      hideLoadingResults,
      populateSystemFilter,
      mountSearchUi,
    };
  }

  return { createSearchUiApi };
});
