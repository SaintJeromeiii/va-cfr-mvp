"use strict";

const express = require("express");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { createConditionStore } = require("./conditions");

const DOC_EXTRACT_PYTHON = String.raw`
import base64
import io
import json
import sys

def extract_pdf(data):
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages:
        pages.append((page.extract_text() or "").strip())
    return {
        "text": "\n\n".join([page for page in pages if page]).strip(),
        "pageCount": len(reader.pages),
        "paragraphCount": 0
    }

def extract_docx(data):
    from docx import Document
    doc = Document(io.BytesIO(data))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
    table_lines = []
    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text and cell.text.strip()]
            if cells:
                table_lines.append(" | ".join(cells))
    lines = paragraphs + table_lines
    return {
        "text": "\n".join(lines).strip(),
        "pageCount": 0,
        "paragraphCount": len(paragraphs)
    }

request = json.load(sys.stdin)
extension = (request.get("extension") or "").lower()
raw = base64.b64decode(request.get("base64") or "")

if extension == ".pdf":
    result = extract_pdf(raw)
elif extension == ".docx":
    result = extract_docx(raw)
else:
    raise ValueError(f"Unsupported extension: {extension}")

result["extractedFrom"] = extension
print(json.dumps(result))
`;

function pythonCandidates() {
  return [
    process.env.VA_CFR_PYTHON_PATH,
    process.env.CODEX_PYTHON_PATH,
    path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "bin", "python3"),
    "python3",
  ].filter(Boolean);
}

function runPythonExtractor(command, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["-c", DOC_EXTRACT_PYTHON], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Document extractor exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (error) {
        reject(new Error(`Could not parse extractor output: ${error.message}`));
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

async function extractDocumentText(payload) {
  let lastError = null;
  for (const command of pythonCandidates()) {
    try {
      return await runPythonExtractor(command, payload);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || "No supported Python runtime was available for document extraction.");
}

function createApp(options = {}) {
  const app = express();
  const conditionStore = options.conditionStore || createConditionStore();
  const pageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(morgan(options.logFormat || "dev"));
  app.use(express.json({ limit: "20mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/api/conditions", (req, res, next) => {
    try {
      res.json(conditionStore.load());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/conditions/:id", (req, res, next) => {
    try {
      const item = conditionStore.load().find((condition) => condition.id === req.params.id);

      if (!item) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.json(item);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/extract-document", async (req, res, next) => {
    try {
      const filename = String(req.body?.filename || "").trim();
      const extension = path.extname(filename).toLowerCase();
      const base64 = String(req.body?.base64 || "").trim();

      if (!base64) {
        res.status(400).json({ error: "Missing base64 document payload." });
        return;
      }

      if (![".pdf", ".docx"].includes(extension)) {
        res.status(400).json({ error: "Only .pdf and .docx are supported by the server extractor." });
        return;
      }

      const result = await extractDocumentText({ extension, base64 });
      res.json({
        filename,
        text: String(result.text || ""),
        pageCount: Number(result.pageCount || 0) || 0,
        paragraphCount: Number(result.paragraphCount || 0) || 0,
        extractedFrom: result.extractedFrom || extension,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/condition/:id", pageLimiter, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  app.use((err, req, res, next) => {
    console.error(err.stack || err.message || err);
    res.status(500).json({ error: "Something went wrong!" });
  });

  return app;
}

module.exports = { createApp };
