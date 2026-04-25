"use strict";

const { createApp } = require("../lib/app");

function invokeRoute(app, path, req = {}) {
  return new Promise((resolve, reject) => {
    const layer = app.router.stack.find((entry) => entry.route && entry.route.path === path);

    if (!layer) {
      reject(new Error(`Route not found: ${path}`));
      return;
    }

    const response = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: this.body });
        return this;
      },
      send(payload) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: this.body });
        return this;
      },
    };

    const next = (error) => {
      if (error) {
        reject(error);
      }
    };

    layer.route.stack[0].handle(req, response, next);
  });
}

describe("app routes", () => {
  test("returns all conditions from the api", async () => {
    const app = createApp({
      conditionStore: {
        load: () => [
          {
            id: "tinnitus",
            name: "Tinnitus",
            cfr: [
              {
                section: "4.87",
                diagnostic_code: "6260",
                title: "Tinnitus",
                url: "https://example.com",
              },
            ],
          },
        ],
      },
      logFormat: "tiny",
    });

    const response = await invokeRoute(app, "/api/conditions");

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe("tinnitus");
  });

  test("returns 404 for an unknown condition", async () => {
    const app = createApp({
      conditionStore: { load: () => [] },
      logFormat: "tiny",
    });

    const response = await invokeRoute(app, "/api/conditions/:id", {
      params: { id: "missing" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: "Not found" });
  });
});
