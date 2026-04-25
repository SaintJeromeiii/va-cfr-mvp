"use strict";

const express = require("express");
const path = require("path");
const morgan = require("morgan");

const { createConditionStore } = require("./conditions");

function createApp(options = {}) {
  const app = express();
  const conditionStore = options.conditionStore || createConditionStore();

  app.use(morgan(options.logFormat || "dev"));
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

  app.get("/condition/:id", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  app.use((err, req, res, next) => {
    console.error(err.stack || err.message || err);
    res.status(500).json({ error: "Something went wrong!" });
  });

  return app;
}

module.exports = { createApp };
