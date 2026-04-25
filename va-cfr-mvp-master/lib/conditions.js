"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_DATA_PATH = path.join(__dirname, "..", "data", "conditions.json");

function validateConditions(data) {
  if (!Array.isArray(data)) {
    throw new Error("conditions.json must be a JSON array []");
  }

  const seen = new Set();

  data.forEach((condition, index) => {
    if (!condition.id || typeof condition.id !== "string") {
      throw new Error(`Condition at index ${index} is missing a string 'id'`);
    }

    if (seen.has(condition.id)) {
      throw new Error(`Duplicate id found: '${condition.id}'`);
    }
    seen.add(condition.id);

    if (!condition.name || typeof condition.name !== "string") {
      throw new Error(`Condition '${condition.id}' is missing a string 'name'`);
    }

    if (!Array.isArray(condition.cfr) || condition.cfr.length === 0) {
      throw new Error(`Condition '${condition.id}' must have a non-empty 'cfr' array`);
    }

    condition.cfr.forEach((reference, refIndex) => {
      if (
        !reference.section ||
        !reference.diagnostic_code ||
        !reference.title ||
        !reference.url
      ) {
        throw new Error(
          `Condition '${condition.id}' cfr[${refIndex}] missing section/diagnostic_code/title/url`
        );
      }
    });
  });

  return data;
}

function parseConditions(raw) {
  let data;

  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`conditions.json is invalid JSON: ${error.message}`);
  }

  return validateConditions(data);
}

function loadConditionsFromFile(filePath = DEFAULT_DATA_PATH) {
  const raw = fs.readFileSync(filePath, "utf8");
  return parseConditions(raw);
}

function createConditionStore(filePath = DEFAULT_DATA_PATH) {
  let cache = null;
  let cacheMtimeMs = null;

  function load() {
    const stats = fs.statSync(filePath);

    if (cache && cacheMtimeMs === stats.mtimeMs) {
      return cache;
    }

    cache = loadConditionsFromFile(filePath);
    cacheMtimeMs = stats.mtimeMs;
    return cache;
  }

  function clear() {
    cache = null;
    cacheMtimeMs = null;
  }

  return { load, clear, filePath };
}

module.exports = {
  DEFAULT_DATA_PATH,
  validateConditions,
  parseConditions,
  loadConditionsFromFile,
  createConditionStore,
};
