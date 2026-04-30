(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrEvidenceGraphFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createEvidenceGraphApi(deps) {
    const {
      loadWorkspaceState,
      isLinkedNode,
      getConditionById,
      loadEvidenceLinks,
      normalizeUrl,
      relatedEvidenceKeys,
      buildEvidenceGraphData,
      escapeHtml,
      toSortableDateKey,
      documentRef = document,
      windowRef = window,
    } = deps;

    let activeGraphSim = null;

    function buildWorkspaceEvidenceIndex(scope = "all") {
      const st = loadWorkspaceState();
      const primaryId = st.primaryId || "";
      let ids = (st.nodes || []).slice();

      if (scope === "primary") ids = primaryId ? [primaryId] : [];
      else if (scope === "linked") {
        ids = ids.filter((id) => isLinkedNode(id, st));
        if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
      }

      const byUrl = new Map();

      ids.forEach((id) => {
        const condition = getConditionById(id);
        if (!condition) return;

        const links = loadEvidenceLinks(id);
        links.forEach((link) => {
          const key = normalizeUrl(link.url);
          if (!key) return;

          if (!byUrl.has(key)) {
            byUrl.set(key, {
              url: link.url,
              label: link.label || "",
              type: link.type || "Other",
              date: link.date || "",
              note: link.note || "",
              conditions: new Set([condition.name]),
            });
            return;
          }

          const entry = byUrl.get(key);
          entry.conditions.add(condition.name);
          if (!entry.label && link.label) entry.label = link.label;
          if ((!entry.type || entry.type === "Other") && link.type) entry.type = link.type;
          if (!entry.date && link.date) entry.date = link.date;
          if (link.note && !entry.note) entry.note = link.note;
        });
      });

      const out = new Map();
      for (const [key, value] of byUrl.entries()) {
        out.set(key, { ...value, conditions: [...value.conditions].sort() });
      }
      return out;
    }

    function evidenceDisplayName(entry) {
      const bits = [];
      if (entry.label) bits.push(entry.label);
      if (entry.date) bits.push(entry.date);
      if (entry.type) bits.push(entry.type);
      return bits.join(" • ") || entry.url;
    }

    function renderEvidenceGraph({ scope = "all", hideOrphans = false, showLabelOnly = undefined } = {}) {
      const host = documentRef.getElementById("wsGraph");
      const info = documentRef.getElementById("wsGraphInfo");
      if (!host) return;

      host.innerHTML = "";
      const { nodes, edges } = buildEvidenceGraphData(scope, hideOrphans);

      const showLabelOnlyFlag = typeof showLabelOnly === "boolean"
        ? showLabelOnly
        : (documentRef.getElementById("wsGraphShowLabelOnly")?.checked ?? true);

      let nodesToRender = nodes.slice();
      let edgesToRender = edges.slice();
      if (!showLabelOnlyFlag) {
        const kept = new Set(nodesToRender.filter((node) => !node.synthetic).map((node) => node.id));
        nodesToRender = nodesToRender.filter((node) => kept.has(node.id));
        edgesToRender = edgesToRender.filter((edge) => kept.has(edge.source) && kept.has(edge.target));
      }

      if (!nodes.length) {
        host.innerHTML = `<div class="small" style="padding:12px">(No evidence nodes to display for this scope.)</div>`;
        if (info) info.textContent = "No nodes found.";
        return;
      }

      const w = host.clientWidth || 900;
      const h = host.clientHeight || 520;

      const svg = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "graphSvg");
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

      const g = documentRef.createElementNS("http://www.w3.org/2000/svg", "g");
      svg.appendChild(g);

      const edgeEls = edgesToRender.map(() => {
        const line = documentRef.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("class", "edgeLine");
        g.appendChild(line);
        return line;
      });

      const nodeGroupEls = nodesToRender.map((node) => {
        const grp = documentRef.createElementNS("http://www.w3.org/2000/svg", "g");
        const radius = Math.max(6, Math.min(18, 6 + node.degree * 2));

        const circle = documentRef.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("r", radius);
        circle.setAttribute("class", "nodeCircle");
        circle.setAttribute("fill", `rgba(255,255,255,${Math.min(0.35 + node.degree * 0.08, 0.80)})`);
        if (node.synthetic) circle.classList.add("synthetic");

        const label = documentRef.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("class", "nodeLabel" + (node.synthetic ? " synthetic" : ""));
        label.setAttribute("x", radius + 6);
        label.setAttribute("y", 4);
        label.textContent = (node.label || "(Evidence)").slice(0, 34);

        grp.appendChild(circle);
        grp.appendChild(label);
        g.appendChild(grp);

        circle.addEventListener("click", (event) => {
          event.stopPropagation();
          if (info) {
            info.innerHTML = `
              <strong>${escapeHtml(node.label || "Evidence")}</strong>
              ${node.date ? ` • ${escapeHtml(node.date)}` : ""}
              ${node.type ? ` • ${escapeHtml(node.type)}` : ""}
              <br/>
              <span>Conditions:</span> ${escapeHtml((node.conditions || []).join(", ") || "(none)")}
              <br/>
              ${node.url ? `<a href="${escapeHtml(node.url)}" target="_blank" rel="noreferrer">Open link</a>` : ""}
              ${node.note ? `<div style="margin-top:6px">${escapeHtml(node.note)}</div>` : ""}
            `;
          }
          if (node.url) windowRef.open(node.url, "_blank");
        });

        return { grp, circle };
      });

      host.appendChild(svg);

      let scale = 1;
      let panX = 0;
      let panY = 0;

      function applyTransform() {
        g.setAttribute("transform", `translate(${panX},${panY}) scale(${scale})`);
      }

      svg.addEventListener("wheel", (event) => {
        event.preventDefault();
        const delta = Math.sign(event.deltaY);
        const next = scale * (delta > 0 ? 0.92 : 1.08);
        scale = Math.max(0.25, Math.min(2.5, next));
        applyTransform();
      }, { passive: false });

      let panning = false;
      let lastPan = null;

      svg.addEventListener("mousedown", (event) => {
        if (event.target && event.target.tagName === "circle") return;
        panning = true;
        lastPan = { x: event.clientX, y: event.clientY };
      });

      const panHandler = (event) => {
        if (!panning || !lastPan) return;
        panX += event.clientX - lastPan.x;
        panY += event.clientY - lastPan.y;
        lastPan = { x: event.clientX, y: event.clientY };
        applyTransform();
      };

      const upHandler = () => {
        panning = false;
        lastPan = null;
      };

      windowRef.addEventListener("mousemove", panHandler);
      windowRef.addEventListener("mouseup", upHandler);

      nodes.forEach((node) => {
        node.x = w / 2 + (Math.random() - 0.5) * 180;
        node.y = h / 2 + (Math.random() - 0.5) * 180;
        node.vx = 0;
        node.vy = 0;
        node.fx = null;
        node.fy = null;
      });

      const nodeById = new Map(nodes.map((node) => [node.id, node]));
      const links = edges.map((edge) => ({
        a: nodeById.get(edge.source),
        b: nodeById.get(edge.target),
      })).filter((link) => link.a && link.b);

      const dragState = new Map();
      nodeGroupEls.forEach(({ circle }, idx) => {
        const node = nodes[idx];
        dragState.set(idx, { dragging: false });

        circle.addEventListener("mousedown", (event) => {
          event.stopPropagation();
          dragState.get(idx).dragging = true;
          node.fx = node.x;
          node.fy = node.y;
        });
      });

      const dragMoveHandler = (event) => {
        nodeGroupEls.forEach((_, idx) => {
          if (!dragState.get(idx).dragging) return;
          const node = nodes[idx];
          const rect = svg.getBoundingClientRect();
          node.fx = (event.clientX - rect.left - panX) / scale;
          node.fy = (event.clientY - rect.top - panY) / scale;
        });
      };

      const dragUpHandler = () => {
        nodeGroupEls.forEach((_, idx) => {
          if (!dragState.get(idx).dragging) return;
          dragState.get(idx).dragging = false;
          const node = nodes[idx];
          node.fx = null;
          node.fy = null;
        });
      };

      windowRef.addEventListener("mousemove", dragMoveHandler);
      windowRef.addEventListener("mouseup", dragUpHandler);

      if (activeGraphSim?.stop) activeGraphSim.stop();

      let running = true;
      let tickCount = 0;

      function tick() {
        if (!running) return;

        const centerX = w / 2;
        const centerY = h / 2;
        const springK = 0.04;
        const restLen = 70;

        links.forEach((link) => {
          const dx = link.b.x - link.a.x;
          const dy = link.b.y - link.a.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const diff = dist - restLen;
          const fx = (dx / dist) * diff * springK;
          const fy = (dy / dist) * diff * springK;

          link.a.vx += fx;
          link.a.vy += fy;
          link.b.vx -= fx;
          link.b.vy -= fy;
        });

        const repK = 600;
        for (let i = 0; i < nodes.length; i += 1) {
          for (let j = i + 1; j < nodes.length; j += 1) {
            const a = nodes[i];
            const b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d2 = dx * dx + dy * dy + 0.01;
            const f = repK / d2;
            const fx = dx * f;
            const fy = dy * f;
            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
          }
        }

        const damp = 0.9;
        nodes.forEach((node) => {
          node.vx += (centerX - node.x) * 0.005;
          node.vy += (centerY - node.y) * 0.0015;

          if (node.fx != null && node.fy != null) {
            node.x = node.fx;
            node.y = node.fy;
            node.vx = 0;
            node.vy = 0;
          } else {
            node.vx *= damp;
            node.vy *= damp;
            node.x += node.vx;
            node.y += node.vy;
          }

          node.x = Math.max(10, Math.min(w - 10, node.x));
          node.y = Math.max(10, Math.min(h - 10, node.y));
        });

        edges.forEach((edge, idx) => {
          const a = nodeById.get(edge.source);
          const b = nodeById.get(edge.target);
          if (!a || !b) return;
          edgeEls[idx].setAttribute("x1", a.x);
          edgeEls[idx].setAttribute("y1", a.y);
          edgeEls[idx].setAttribute("x2", b.x);
          edgeEls[idx].setAttribute("y2", b.y);
        });

        nodes.forEach((node, idx) => {
          nodeGroupEls[idx].grp.setAttribute("transform", `translate(${node.x},${node.y})`);
        });

        tickCount += 1;
        if (tickCount === 60) {
          try {
            svg.__fit && svg.__fit();
          } catch (_) {}
        }
        if (tickCount > 900) running = false;

        windowRef.requestAnimationFrame(tick);
      }

      windowRef.requestAnimationFrame(tick);

      activeGraphSim = {
        stop() {
          running = false;
          windowRef.removeEventListener("mousemove", panHandler);
          windowRef.removeEventListener("mouseup", upHandler);
          windowRef.removeEventListener("mousemove", dragMoveHandler);
          windowRef.removeEventListener("mouseup", dragUpHandler);
        },
      };

      svg.__fit = () => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        nodes.forEach((node) => {
          minX = Math.min(minX, node.x);
          minY = Math.min(minY, node.y);
          maxX = Math.max(maxX, node.x);
          maxY = Math.max(maxY, node.y);
        });

        const bw = Math.max(1, maxX - minX);
        const bh = Math.max(1, maxY - minY);
        const pad = 40;
        const sx = (w - pad) / bw;
        const sy = (h - pad) / bh;
        scale = Math.max(0.25, Math.min(2.5, Math.min(sx, sy)));

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        panX = w / 2 - cx * scale;
        panY = h / 2 - cy * scale;
        applyTransform();
      };

      windowRef.setTimeout(() => {
        svg.__fit && svg.__fit();
      }, 120);

      if (info) {
        info.textContent = `Nodes: ${nodes.length} | Links: ${edges.length}. Drag nodes, scroll to zoom, drag background to pan.`;
      }
    }

    return {
      buildWorkspaceEvidenceIndex,
      evidenceDisplayName,
      renderEvidenceGraph,
    };
  }

  return { createEvidenceGraphApi };
});
