// server/routes/intelligence.js
const express = require("express");
const router = express.Router();
const { computeConditionReadiness, buildNarrative } = require("../engines/scoringEngine");

// POST /api/intelligence/score
// body: { state, conditionId? }  (if conditionId omitted, returns all conditions)
router.post("/score", (req, res) => {
  try {
    const state = req.body?.state;
    if (!state) return res.status(400).json({ ok: false, error: "Missing state" });

    const conditions = state.conditions || state.conditionList || [];
    const conditionId = req.body?.conditionId;

    if (conditionId) {
      const condition = conditions.find(c => (c.id || c._id || c.uuid || c.key) == conditionId) ||
                       conditions.find(c => (c.name || c.title || "").toLowerCase() === String(conditionId).toLowerCase());
      if (!condition) return res.status(404).json({ ok: false, error: "Condition not found" });

      const result = computeConditionReadiness({ state, condition });
      return res.json({ ok: true, result });
    }

    const results = conditions.map(condition => computeConditionReadiness({ state, condition }));
    // sort by lowest score first (prioritize work)
    results.sort((a, b) => a.score - b.score);

    return res.json({ ok: true, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
});

// POST /api/intelligence/narrative
// body: { state, conditionId }
router.post("/narrative", (req, res) => {
  try {
    const state = req.body?.state;
    const conditionId = req.body?.conditionId;
    if (!state) return res.status(400).json({ ok: false, error: "Missing state" });
    if (!conditionId) return res.status(400).json({ ok: false, error: "Missing conditionId" });

    const out = buildNarrative({ state, conditionId });
    if (!out.ok) return res.status(404).json(out);

    return res.json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
});

module.exports = router;
