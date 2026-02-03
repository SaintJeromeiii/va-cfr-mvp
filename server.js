const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

// Serve frontend files from /public
app.use(express.static(path.join(__dirname, "public")));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

const DATA_PATH = path.join(__dirname, "data", "conditions.json");

function loadConditions() {
  const raw = fs.readFileSync(DATA_PATH, "utf-8");

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error("❌ conditions.json is invalid JSON:", err.message);
    throw err;
  }

  if (!Array.isArray(data)) {
    throw new Error("conditions.json must be a JSON array []");
  }

  // Basic validation so the UI doesn't break later
  const seen = new Set();
  data.forEach((c, i) => {
    if (!c.id || typeof c.id !== "string") {
      throw new Error(`Condition at index ${i} is missing a string 'id'`);
    }
    if (seen.has(c.id)) {
      throw new Error(`Duplicate id found: '${c.id}'`);
    }
    seen.add(c.id);

    if (!c.name || typeof c.name !== "string") {
      throw new Error(`Condition '${c.id}' is missing a string 'name'`);
    }

    if (!Array.isArray(c.cfr) || c.cfr.length === 0) {
      throw new Error(`Condition '${c.id}' must have a non-empty 'cfr' array`);
    }

    c.cfr.forEach((r, j) => {
      if (!r.section || !r.diagnostic_code || !r.title || !r.url) {
        throw new Error(`Condition '${c.id}' cfr[${j}] missing section/diagnostic_code/title/url`);
      }
    });
  });

  console.log(`✅ Loaded ${data.length} conditions`);
  return data;
}


// Serve the front-end
app.use(express.static(path.join(__dirname, "public")));

// API: get all conditions (for search)
app.get("/api/conditions", (req, res) => {
  const conditions = loadConditions();
  res.json(conditions);
});

// API: get a single condition by id
app.get("/api/conditions/:id", (req, res) => {
  const conditions = loadConditions();
  const item = conditions.find(c => c.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

app.get("/condition/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/condition/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


app.listen(PORT, () => {
  console.log(`VA CFR MVP running at http://localhost:${PORT}`);
});
