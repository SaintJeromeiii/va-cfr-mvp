const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const router = express.Router();

router.use(express.json({ limit: "50mb" }));

router.post("/", async (req, res) => {
  try {
    const bundle = req.body;
    
    // Extract PDF options from request
    const pdfOptions = bundle.pdfOptions || {};
    
    // Set bundle.pdfOptions with all options including new summary page options
    bundle.pdfOptions = {
      separatorPages: pdfOptions.separatorPages !== false,
      includeSnippets: pdfOptions.includeSnippets !== false,
      
      // NEW: Summary page options
      summaryPages: pdfOptions.summaryPages !== false,              // default true
      summarySnippetPreview: pdfOptions.summarySnippetPreview !== false // default true
    };

    // Generate temporary filename
    const timestamp = Date.now();
    const tmpDir = path.join(__dirname, "..", "..", "tmp");
    
    // Ensure tmp directory exists
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    const outPath = path.join(tmpDir, `packet_${timestamp}.pdf`);
    const pythonScript = path.join(__dirname, "..", "pdf", "render_packet_v2.py");

    // Spawn Python process
    const python = spawn("python3", [pythonScript, outPath]);
    
    // Send bundle as JSON to stdin
    python.stdin.write(JSON.stringify(bundle));
    python.stdin.end();

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("close", (code) => {
      if (code !== 0) {
        console.error("Python script error:", stderr);
        return res.status(500).json({ 
          error: "PDF generation failed", 
          details: stderr 
        });
      }

      // Check if file was created
      if (!fs.existsSync(outPath)) {
        return res.status(500).json({ 
          error: "PDF file was not created" 
        });
      }

      // Send PDF file
      const conditionName = (bundle.condition?.name || "claim_packet")
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      
      res.download(outPath, `${conditionName}_packet.pdf`, (err) => {
        // Clean up temp file after sending
        if (fs.existsSync(outPath)) {
          fs.unlinkSync(outPath);
        }
        
        if (err) {
          console.error("Error sending PDF:", err);
        }
      });
    });

    python.on("error", (err) => {
      console.error("Failed to start Python process:", err);
      res.status(500).json({ 
        error: "Failed to start PDF renderer", 
        details: err.message 
      });
    });

  } catch (error) {
    console.error("PDF route error:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      details: error.message 
    });
  }
});

module.exports = router;
