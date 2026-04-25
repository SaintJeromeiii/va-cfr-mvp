"use strict";

const { parseCommandQuery } = require("../public/js/command-query");

describe("parseCommandQuery", () => {
  test("parses diagnostic code shortcuts", () => {
    expect(parseCommandQuery("dc:8100")).toEqual({
      mode: "jump",
      jump: "8100",
      text: "8100",
    });
  });

  test("parses section shortcuts", () => {
    expect(parseCommandQuery("section 4.124a")).toEqual({
      mode: "jump",
      jump: "4.124a",
      text: "4.124a",
    });
  });

  test("parses system filters", () => {
    expect(parseCommandQuery("system:ear")).toEqual({
      mode: "system",
      system: "ear",
      text: "",
    });
  });

  test("falls back to a plain text search", () => {
    expect(parseCommandQuery("PTSD")).toEqual({
      mode: "text",
      text: "PTSD",
    });
  });
});
