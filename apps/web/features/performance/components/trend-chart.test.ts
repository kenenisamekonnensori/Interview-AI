import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { buildChartPoints, buildSeriesPath, yForScore } from "./trend-chart";

describe("yForScore", () => {
  test("maps 0-100 scores to an inverted y axis with padding", () => {
    assert.equal(yForScore(100, 220, 8), 8);
    assert.equal(yForScore(0, 220, 8), 212);
    assert.equal(yForScore(50, 220, 8), 110);
  });
});

describe("buildChartPoints", () => {
  test("centers a single point", () => {
    assert.deepEqual(buildChartPoints([80], 640, 220, 8), [{ x: 320, y: yForScore(80, 220, 8) }]);
  });

  test("spreads two points across the padded width", () => {
    const [first, second] = buildChartPoints([0, 100], 640, 220, 8);
    assert.equal(first?.x, 8);
    assert.equal(second?.x, 632);
    assert.equal(first?.y, 212);
    assert.equal(second?.y, 8);
  });

  test("returns no points for an empty series", () => {
    assert.deepEqual(buildChartPoints([], 640, 220), []);
  });
});

describe("buildSeriesPath", () => {
  test("starts with a move and continues with lines", () => {
    const path = buildSeriesPath([
      { x: 8, y: 110 },
      { x: 320, y: 60 },
      { x: 632, y: 20 },
    ]);
    assert.equal(path, "M8,110 L320,60 L632,20");
  });

  test("produces a single move for one point", () => {
    assert.equal(buildSeriesPath([{ x: 320, y: 110 }]), "M320,110");
  });
});
