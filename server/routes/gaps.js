// server/routes/gaps.js
const express = require("express");
const router = express.Router();
const { findEdgeAwareGaps } = require("../engines/gapFinder");

// POST /api/intelligence/gaps
// body: { state, conditionId? }
router.post("/gaps", (req, res) => {
  try {
    const state = req.body?.state;
    if (!state) return res.status(400).json({ ok: false, error: "Missing state" });

    const conditionId = req.body?.conditionId;
    const out = findEdgeAwareGaps({ state, conditionId });
    if (!out.ok) return res.status(404).json(out);
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
});

module.exports = router;
