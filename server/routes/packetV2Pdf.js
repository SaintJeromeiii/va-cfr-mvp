// server/routes/packetV2Pdf.js
const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");
const router = express.Router();

const { buildPacketBundle } = require("../engines/packetBuilderV2");

// POST /api/intelligence/packet-v2/pdf
// body: { state, conditionId, selectedEvidenceIds?: string[] }
router.post("/packet-v2/pdf", async (req, res) => {
  try {
    const state = req.body?.state;
    const conditionId = req.body?.conditionId;
    const selectedEvidenceIds = req.body?.selectedEvidenceIds;
    const pdfOptions = req.body?.pdfOptions || {};

    if (!state) return res.status(400).json({ ok: false, error: "Missing state" });
    if (!conditionId) return res.status(400).json({ ok: false, error: "Missing conditionId" });

    // Build the same bundle we use for Packet v2
    const bundle = buildPacketBundle({ state, conditionId, selectedEvidenceIds });
    if (!bundle.ok) return res.status(404).json(bundle);

    // Attach PDF options
    bundle.pdfOptions = {
      separatorPages: pdfOptions.separatorPages !== false,
      includeSnippets: pdfOptions.includeSnippets !== false
    };

    // Temp output path
    const safeName = (bundle.condition?.name || "claim_packet")
      .toString()
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);

    const outPath = path.join(os.tmpdir(), `VA_CFR_${safeName}_${Date.now()}.pdf`);

    // Python renderer path
    const pyScript = path.join(__dirname, "..", "pdf", "render_packet_v2.py");

    // Spawn python3
    const py = spawn("python3", [pyScript, outPath], { stdio: ["pipe", "pipe", "pipe"] });

    let stderr = "";
    py.stderr.on("data", (d) => (stderr += d.toString()));

    // Send JSON bundle over stdin
    py.stdin.write(JSON.stringify(bundle));
    py.stdin.end();

    py.on("close", (code) => {
      if (code !== 0) {
        return res.status(500).json({
          ok: false,
          error: `PDF render failed (code ${code}). ${stderr || ""}`.trim()
        });
      }

      // Stream the PDF back
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName || "claim_packet"}.pdf"`);

      const stream = fs.createReadStream(outPath);
      stream.on("error", (err) => res.status(500).json({ ok: false, error: err.message }));
      stream.on("close", () => {
        // cleanup temp file
        fs.unlink(outPath, () => {});
      });

      stream.pipe(res);
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
});

module.exports = router;
