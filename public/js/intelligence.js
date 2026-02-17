// public/js/intelligence.js
// Frontend integration for readiness scoring + narrative generation.
// Assumes you already have a function to get the full app state from localStorage or in-memory store.

(function () {
  const $ = (id) => document.getElementById(id);

  // ---- REQUIRED: adapt these two functions to your app ----
  function getAppState() {
    // Read from actual VA CFR Finder workspace structure
    const WORKSPACE_KEY = "vaCfrWorkspace:v4";
    const RELATIONS_KEY = "vaCfrEvidenceRelations:v1";
    
    try {
      // 1. Load workspace (contains condition IDs)
      const wsRaw = localStorage.getItem(WORKSPACE_KEY);
      if (!wsRaw) return null;
      
      const workspace = JSON.parse(wsRaw);
      const conditionIds = Array.isArray(workspace.nodes) ? workspace.nodes : [];
      if (!conditionIds.length) return null;
      
      // 2. Load all conditions - use global CONDITIONS array from app.js if available
      const conditions = [];
      const globalConditions = window.CONDITIONS || [];
      
      for (const id of conditionIds) {
        // Try to find full condition data from global array
        const fullCondition = globalConditions.find(c => c.id === id);
        if (fullCondition) {
          conditions.push({
            id: fullCondition.id,
            name: fullCondition.name,
            title: fullCondition.name,
            cfr: fullCondition.cfr,
            diagnosticCodes: fullCondition.cfr?.map(r => r.diagnostic_code).filter(Boolean) || []
          });
        } else {
          // Fallback: use ID as name
          conditions.push({ id, name: id, title: id });
        }
      }
      
      // 3. Load all evidence from all conditions
      const allEvidence = [];
      const evidenceByUrl = new Map();
      
      for (const conditionId of conditionIds) {
        const evidenceKey = `vaCfrEvidenceLinks:${conditionId}`;
        const evRaw = localStorage.getItem(evidenceKey);
        if (!evRaw) continue;
        
        try {
          const evidenceList = JSON.parse(evRaw);
          if (!Array.isArray(evidenceList)) continue;
          
          evidenceList.forEach(ev => {
            if (!ev || !ev.url) return;
            const url = normalizeUrl(ev.url);
            
            // Avoid duplicates (same URL might be in multiple conditions)
            if (evidenceByUrl.has(url)) return;
            
            // Build evidence object with all fields the scoring engine expects
            const evidence = {
              id: ev.id || url,
              url: ev.url,
              title: ev.title || ev.text || ev.url,
              text: ev.text || "",
              body: ev.text || "",
              description: ev.text || "",
              type: ev.type || "other",
              date: ev.date || null,
              conditionId: conditionId,
              conditionIds: [conditionId],
              conditions: [conditionId]
            };
            
            allEvidence.push(evidence);
            evidenceByUrl.set(url, evidence);
          });
        } catch (e) {
          console.warn(`Failed to load evidence for ${conditionId}:`, e);
        }
      }
      
      // 4. Load evidence relationships and convert to edges format
      const edges = [];
      const relRaw = localStorage.getItem(RELATIONS_KEY);
      if (relRaw) {
        try {
          const relations = JSON.parse(relRaw);
          const seen = new Set();
          
          for (const [urlA, targets] of Object.entries(relations)) {
            if (!Array.isArray(targets)) continue;
            
            for (const urlB of targets) {
              const key = [urlA, urlB].sort().join("::::");
              if (seen.has(key)) continue;
              seen.add(key);
              
              edges.push({
                from: urlA,
                to: urlB,
                type: "supports" // default type, could be enhanced
              });
            }
          }
        } catch (e) {
          console.warn("Failed to load evidence relations:", e);
        }
      }
      
      // 5. Return state in expected format
      return {
        conditions,
        evidence: allEvidence,
        edges,
        // Legacy aliases
        conditionList: conditions,
        evidenceNodes: allEvidence,
        relationships: edges
      };
    } catch (e) {
      console.error("getAppState error:", e);
      return null;
    }
  }
  
  function normalizeUrl(url) {
    if (!url) return "";
    return url.toString().trim().replace(/\/+$/, "");
  }

  function setNarrativeForCondition(conditionId, markdown) {
    // persist narrative drafts per condition
    const k = "vaCfrFinderNarratives";
    const raw = localStorage.getItem(k);
    const obj = raw ? (JSON.parse(raw) || {}) : {};
    obj[String(conditionId)] = { markdown, updatedAt: new Date().toISOString() };
    localStorage.setItem(k, JSON.stringify(obj));
  }

  function getNarrativeForCondition(conditionId) {
    const k = "vaCfrFinderNarratives";
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw) || {};
      return obj[String(conditionId)]?.markdown || null;
    } catch (_) {
      return null;
    }
  }
  // --------------------------------------------------------

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
    return data;
  }

  function safeId(x) {
    return (x?.id || x?._id || x?.uuid || x?.key || "").toString();
  }

  function populateConditions(state) {
    const sel = $("intelConditionSelect");
    sel.innerHTML = "";

    const conditions = state?.conditions || state?.conditionList || [];
    for (const c of conditions) {
      const opt = document.createElement("option");
      opt.value = safeId(c) || (c?.name || c?.title || "");
      opt.textContent = c?.name || c?.title || "(Unnamed condition)";
      sel.appendChild(opt);
    }
  }

  function renderScore(result) {
    const score = result?.score ?? null;
    $("intelScoreText").textContent = score == null ? "--" : `${score}/100`;
    $("intelScoreBar").style.width = score == null ? "0%" : `${score}%`;

    const meta = [];
    if (result?.matchedEvidenceCount != null) meta.push(`Matched evidence: ${result.matchedEvidenceCount}`);
    if (result?.edgeCount != null) meta.push(`Edges (among matched): ${result.edgeCount}`);
    const cfrRefs = result?.cfr?.cfrRefs || [];
    const dcs = result?.cfr?.dcs || [];
    if (cfrRefs.length) meta.push(`CFR: ${cfrRefs.join(", ")}`);
    if (dcs.length) meta.push(`DCs: ${dcs.join(", ")}`);
    $("intelMeta").textContent = meta.join(" • ");

    const ul = $("intelMissingList");
    ul.innerHTML = "";
    (result?.missing || []).forEach((m) => {
      const li = document.createElement("li");
      li.textContent = m;
      ul.appendChild(li);
    });

    $("intelStrategy").textContent = result?.strategy ? `Strategy: ${result.strategy}` : "";
    console.log("[Intel] Evidence ranked:", result?.evidenceRanked || []);
  }

  async function refreshScore() {
    const state = getAppState();
    if (!state) {
      renderScore({ 
        score: null, 
        missing: [
          "No workspace data found.",
          "Add conditions to your workspace first by searching and clicking 'Add to Workspace'.",
          "Then open each condition and add evidence items."
        ] 
      });
      return;
    }

    populateConditions(state);

    const sel = $("intelConditionSelect");
    // keep current selection if possible
    const current = sel.value || (state.conditions?.[0]?.id ?? "");
    if (current) sel.value = current;

    const conditionId = sel.value;
    if (!conditionId) {
      renderScore({ 
        score: null, 
        missing: ["No condition selected."] 
      });
      return;
    }

    try {
      const out = await postJSON("/api/intelligence/score", { state, conditionId });
      renderScore(out.result);

      // load saved narrative draft (if any)
      const saved = getNarrativeForCondition(conditionId);
      if (saved) {
        $("intelNarrativeOut").value = saved;
        $("intelCopyBtn").disabled = false;
      }
    } catch (e) {
      renderScore({ 
        score: null, 
        missing: [`Error: ${e.message}`] 
      });
    }
  }

  async function generateNarrative() {
    const state = getAppState();
    const conditionId = $("intelConditionSelect").value;
    if (!state || !conditionId) return;

    $("intelNarrativeBtn").disabled = true;
    $("intelNarrativeBtn").textContent = "Generating...";

    try {
      const out = await postJSON("/api/intelligence/narrative", { state, conditionId });
      $("intelNarrativeOut").value = out.narrativeMarkdown || "";
      $("intelCopyBtn").disabled = !out.narrativeMarkdown;
      if (out.narrativeMarkdown) setNarrativeForCondition(conditionId, out.narrativeMarkdown);
      renderScore(out.readiness); // keeps score synced
    } catch (e) {
      $("intelNarrativeOut").value = `ERROR: ${e.message}`;
      $("intelCopyBtn").disabled = true;
    } finally {
      $("intelNarrativeBtn").disabled = false;
      $("intelNarrativeBtn").textContent = "Generate Narrative";
    }
  }

  async function copyNarrative() {
    const txt = $("intelNarrativeOut").value || "";
    if (!txt) return;
    await navigator.clipboard.writeText(txt);
  }

  async function refreshGaps() {
    const state = getAppState();
    const conditionId = $("intelConditionSelect").value;
    
    if (!state) {
      $("gapSummary").textContent = "No workspace data. Add conditions and evidence first.";
      $("gapLinksList").innerHTML = "";
      $("gapEdgesList").innerHTML = "";
      $("gapOrphansList").innerHTML = "";
      return;
    }
    
    if (!conditionId) {
      $("gapSummary").textContent = "No condition selected.";
      return;
    }

    $("gapRefreshBtn").disabled = true;
    $("gapRefreshBtn").textContent = "Finding...";

    try {
      const out = await postJSON("/api/intelligence/gaps", { state, conditionId });
      const r = out.result;
      
      // Check if there's any evidence for this condition
      if (r.counts.matchedEvidence === 0) {
        $("gapSummary").textContent = "No evidence found for this condition. Open the condition detail and add evidence items.";
        $("gapLinksList").innerHTML = "";
        $("gapEdgesList").innerHTML = "";
        $("gapOrphansList").innerHTML = "";
        return;
      }

      // Summary
      const missReq = (r.missingRequired || []).length;
      const discReq = (r.requiredLinkFindings || []).filter(x => x.status === "disconnected").length;
      const sugg = (r.edgeSuggestions || []).length;

      $("gapSummary").textContent =
        `Missing required roles: ${missReq} • Disconnected required links: ${discReq} • Suggestions: ${sugg}`;

      // Links
      const linksUl = $("gapLinksList");
      linksUl.innerHTML = "";
      (r.requiredLinkFindings || []).forEach(x => {
        const li = document.createElement("li");
        li.textContent = `${x.link}: ${x.status}${x.note ? " — " + x.note : ""}`;
        linksUl.appendChild(li);
      });

      // Suggestions cards
      const list = $("gapEdgesList");
      list.innerHTML = "";
      (r.edgeSuggestions || []).forEach(s => {
        const card = document.createElement("div");
        card.style.border = "1px solid #ddd";
        card.style.borderRadius = "8px";
        card.style.padding = "8px";

        const title = document.createElement("div");
        title.style.fontSize = "12px";
        title.innerHTML = `<strong>${s.type}</strong> • conf ${s.confidence}`;
        card.appendChild(title);

        const body = document.createElement("div");
        body.style.fontSize = "12px";
        body.style.marginTop = "4px";
        body.textContent = `${s.fromTitle} → ${s.toTitle}`;
        card.appendChild(body);

        const reason = document.createElement("div");
        reason.style.fontSize = "12px";
        reason.style.opacity = ".85";
        reason.style.marginTop = "4px";
        reason.textContent = s.reason || "";
        card.appendChild(reason);

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "8px";
        row.style.marginTop = "6px";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Apply Edge";
        btn.addEventListener("click", () => applySuggestedEdge(s));
        row.appendChild(btn);

        const small = document.createElement("button");
        small.type = "button";
        small.textContent = "Copy JSON";
        small.addEventListener("click", async () => {
          await navigator.clipboard.writeText(JSON.stringify({ from: s.from, to: s.to, type: s.type }, null, 2));
        });
        row.appendChild(small);

        card.appendChild(row);
        list.appendChild(card);
      });

      // Orphans
      const orphUl = $("gapOrphansList");
      orphUl.innerHTML = "";
      (r.roleOrphans || []).forEach(o => {
        const li = document.createElement("li");
        li.textContent = `${o.role}: ${o.title} (conf ${o.confidence})`;
        orphUl.appendChild(li);
      });

      console.log("[GapFinder] Full result:", r);
    } catch (e) {
      $("gapSummary").textContent = `ERROR: ${e.message}`;
    } finally {
      $("gapRefreshBtn").disabled = false;
      $("gapRefreshBtn").textContent = "Find Gaps";
    }
  }

  function applySuggestedEdge(s) {
    // IMPORTANT: this needs to plug into your existing edge add flow.
    // The cleanest integration is to call your existing function used by the UI to add an edge.
    // Try common names first; otherwise fallback to localStorage update.

    const edge = { from: s.from, to: s.to, type: s.type };

    // Option 1: if you already have a function that adds edges + re-renders graph
    if (typeof window.addEdge === "function") {
      window.addEdge(edge);
      return;
    }
    if (typeof window.graphAddEdge === "function") {
      window.graphAddEdge(edge);
      return;
    }

    // Option 2: fallback update state in localStorage (may require manual refresh)
    const state = getAppState();
    if (!state) return;

    if (!state.edges && !state.relationships) state.edges = [];
    const arr = state.edges || state.relationships;

    const exists = arr.some(e =>
      (e.from === edge.from && e.to === edge.to) || (e.from === edge.to && e.to === edge.from)
    );
    if (!exists) arr.push(edge);

    // persist back using the same key(s) used by getAppState()
    // If your app uses a specific key, replace this block with that key.
    const preferredKey = localStorage.getItem("vaCfrFinderState") ? "vaCfrFinderState"
      : (localStorage.getItem("VA_CFR_FINDER_STATE") ? "VA_CFR_FINDER_STATE" : "state");

    localStorage.setItem(preferredKey, JSON.stringify(state));

    alert("Edge added to localStorage. If your graph doesn't auto-refresh, reload the workspace.");
  }

  // ---- Packet Builder v2 persistence ----
  function pkt2Key(conditionId) { return `vaCfrFinderPkt2_${String(conditionId)}`; }

  function pkt2LoadSelection(conditionId) {
    const raw = localStorage.getItem(pkt2Key(conditionId));
    if (!raw) return [];
    try {
      const obj = JSON.parse(raw) || {};
      return Array.isArray(obj.selectedEvidenceIds) ? obj.selectedEvidenceIds : [];
    } catch (_) { return []; }
  }

  function pkt2SaveSelection(conditionId, selectedEvidenceIds) {
    localStorage.setItem(pkt2Key(conditionId), JSON.stringify({
      selectedEvidenceIds,
      updatedAt: new Date().toISOString()
    }));
  }

  function pkt2LoadLastOutput(conditionId) {
    const raw = localStorage.getItem(pkt2Key(conditionId));
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw) || {};
      return obj.lastPacketMarkdown || null;
    } catch (_) { return null; }
  }

  function pkt2SaveLastOutput(conditionId, packetMarkdown, exportObj) {
    const raw = localStorage.getItem(pkt2Key(conditionId));
    const obj = raw ? (JSON.parse(raw) || {}) : {};
    obj.lastPacketMarkdown = packetMarkdown || "";
    obj.lastExport = exportObj || null;
    obj.updatedAt = new Date().toISOString();
    localStorage.setItem(pkt2Key(conditionId), JSON.stringify(obj));
  }

  function pkt2LoadLastExport(conditionId) {
    const raw = localStorage.getItem(pkt2Key(conditionId));
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw) || {};
      return obj.lastExport || null;
    } catch (_) { return null; }
  }

  function getSelectedEvidenceIdsFromUI() {
    const host = document.getElementById("pkt2Candidates");
    const checks = host.querySelectorAll("input[type='checkbox'][data-evidence-id]");
    const ids = [];
    checks.forEach(ch => { if (ch.checked) ids.push(ch.dataset.evidenceId); });
    return ids;
  }

  function renderPkt2Candidates(candidates, selectedIds) {
    const host = document.getElementById("pkt2Candidates");
    host.innerHTML = "";

    const selSet = new Set((selectedIds || []).map(String));

    (candidates || []).forEach(c => {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.alignItems = "flex-start";
      row.style.border = "1px solid #ddd";
      row.style.borderRadius = "8px";
      row.style.padding = "8px";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.evidenceId = String(c.id);
      cb.checked = selSet.has(String(c.id));
      cb.addEventListener("change", () => {
        const conditionId = document.getElementById("intelConditionSelect").value;
        pkt2SaveSelection(conditionId, getSelectedEvidenceIdsFromUI());
      });

      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.flex = "1";
      meta.innerHTML = `<div><strong>${c.title}</strong></div>
        <div style="opacity:.85; margin-top:2px;">
          ${c.type ? c.type : "unknown"}${c.date ? " \u2022 " + c.date : ""}${(c.scorePct != null) ? " \u2022 relevance " + c.scorePct + "%" : ""}
        </div>`;

      row.appendChild(cb);
      row.appendChild(meta);
      host.appendChild(row);
    });

    if (!candidates || !candidates.length) {
      host.innerHTML = `<div style="font-size:12px; opacity:.85;">No candidates found. Add evidence or ensure condition matching works.</div>`;
    }
  }

  async function pkt2LoadCandidates() {
    const state = getAppState();
    const conditionId = document.getElementById("intelConditionSelect").value;
    if (!state || !conditionId) return;

    const btn = document.getElementById("pkt2RefreshBtn");
    btn.disabled = true;
    btn.textContent = "Loading...";

    try {
      // Use existing readiness endpoint to get ranked evidence list
      const out = await postJSON("/api/intelligence/score", { state, conditionId });
      const ranked = out.result?.evidenceRanked || [];

      // Candidate list: top 20 ranked evidence (id/title/type/date/scorePct)
      const candidates = ranked.slice(0, 20).map(e => ({
        id: e.id,
        title: e.title,
        type: e.type,
        date: e.date,
        scorePct: e.scorePct
      }));

      const savedSel = pkt2LoadSelection(conditionId);

      // If no saved selection, preselect top 8
      const selectedIds = savedSel.length ? savedSel : candidates.slice(0, 8).map(x => String(x.id));
      pkt2SaveSelection(conditionId, selectedIds);

      renderPkt2Candidates(candidates, selectedIds);

      // restore last output if exists
      const last = pkt2LoadLastOutput(conditionId);
      if (last) {
        document.getElementById("pkt2Out").value = last;
        document.getElementById("pkt2CopyMdBtn").disabled = false;
        document.getElementById("pkt2CopyJsonBtn").disabled = !pkt2LoadLastExport(conditionId);
      }
    } catch (e) {
      document.getElementById("pkt2Candidates").innerHTML = `<div style="font-size:12px;">ERROR: ${e.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Load Candidates";
    }
  }

  async function pkt2Generate() {
    const state = getAppState();
    const conditionId = document.getElementById("intelConditionSelect").value;
    if (!state || !conditionId) return;

    const btn = document.getElementById("pkt2GenBtn");
    btn.disabled = true;
    btn.textContent = "Generating...";

    try {
      const selectedEvidenceIds = getSelectedEvidenceIdsFromUI();
      pkt2SaveSelection(conditionId, selectedEvidenceIds);

      const out = await postJSON("/api/intelligence/packet-v2", { state, conditionId, selectedEvidenceIds });

      document.getElementById("pkt2Out").value = out.packetMarkdown || "";
      document.getElementById("pkt2CopyMdBtn").disabled = !out.packetMarkdown;
      document.getElementById("pkt2CopyJsonBtn").disabled = !out.export;

      pkt2SaveLastOutput(conditionId, out.packetMarkdown, out.export);

      console.log("[PacketV2] bundle:", out);
    } catch (e) {
      document.getElementById("pkt2Out").value = `ERROR: ${e.message}`;
      document.getElementById("pkt2CopyMdBtn").disabled = true;
      document.getElementById("pkt2CopyJsonBtn").disabled = true;
    } finally {
      btn.disabled = false;
      btn.textContent = "Generate Packet v2";
    }
  }

  async function pkt2CopyMd() {
    const txt = document.getElementById("pkt2Out").value || "";
    if (!txt) return;
    await navigator.clipboard.writeText(txt);
  }

  async function pkt2CopyJson() {
    const conditionId = document.getElementById("intelConditionSelect").value;
    const exp = pkt2LoadLastExport(conditionId);
    if (!exp) return;
    await navigator.clipboard.writeText(JSON.stringify(exp, null, 2));
  }

  async function pkt2DownloadPdf() {
    const state = getAppState();
    const conditionId = document.getElementById("intelConditionSelect").value;
    if (!state || !conditionId) return;

    const btn = document.getElementById("pkt2PdfBtn");
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = "Preparing...";

    try {
      const selectedEvidenceIds = getSelectedEvidenceIdsFromUI();
      pkt2SaveSelection(conditionId, selectedEvidenceIds);

      const pdfOptions = {
        separatorPages: document.getElementById("pkt2SepPages")?.checked !== false,
        includeSnippets: document.getElementById("pkt2InclSnips")?.checked !== false
      };

      const res = await fetch("/api/intelligence/packet-v2/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, conditionId, selectedEvidenceIds, pdfOptions })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `PDF request failed: ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Try to derive filename from Content-Disposition
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || "claim_packet.pdf";

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`PDF export failed: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  function wire() {
    $("intelRefreshBtn")?.addEventListener("click", refreshScore);
    $("intelConditionSelect")?.addEventListener("change", () => {
      refreshScore();
      pkt2LoadCandidates().catch(console.error);
    });
    $("intelNarrativeBtn")?.addEventListener("click", generateNarrative);
    $("intelCopyBtn")?.addEventListener("click", copyNarrative);
    $("gapRefreshBtn")?.addEventListener("click", refreshGaps);
    
    // Packet v2 buttons
    $("pkt2RefreshBtn")?.addEventListener("click", pkt2LoadCandidates);
    $("pkt2GenBtn")?.addEventListener("click", pkt2Generate);
    $("pkt2PdfBtn")?.addEventListener("click", pkt2DownloadPdf);
    $("pkt2CopyMdBtn")?.addEventListener("click", pkt2CopyMd);
    $("pkt2CopyJsonBtn")?.addEventListener("click", pkt2CopyJson);

    // initial load
    refreshScore().catch(err => {
      console.error(err);
      $("intelNarrativeOut").value = `ERROR: ${err.message}`;
    });
  }

  // Run after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
