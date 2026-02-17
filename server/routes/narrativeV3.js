// server/routes/narrativeV3.js
const express = require("express");
const router = express.Router();
const { buildNarrativeV3 } = require("../engines/narrativeV3");

// POST /api/intelligence/narrative-v3
// body: { state, conditionId, selectedEvidenceIds?: string[] }
router.post("/narrative-v3", (req, res) => {
  try {
    const state = req.body?.state;
    const conditionId = req.body?.conditionId;
    const selectedEvidenceIds = req.body?.selectedEvidenceIds;

    if (!state) return res.status(400).json({ ok: false, error: "Missing state" });
    if (!conditionId) return res.status(400).json({ ok: false, error: "Missing conditionId" });

    const out = buildNarrativeV3({ state, conditionId, selectedEvidenceIds });
    if (!out.ok) return res.status(404).json(out);

    return res.json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
});

module.exports = router;
