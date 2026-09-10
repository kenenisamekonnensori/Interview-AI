import assert from "node:assert/strict";
import { test } from "vitest";

import { greetingForHour } from "./greeting";

test("greeting maps local hours to time-of-day bands", () => {
  assert.equal(greetingForHour(5), "Good morning");
  assert.equal(greetingForHour(11), "Good morning");
  assert.equal(greetingForHour(12), "Good afternoon");
  assert.equal(greetingForHour(17), "Good afternoon");
  assert.equal(greetingForHour(18), "Good evening");
  assert.equal(greetingForHour(23), "Good evening");
  assert.equal(greetingForHour(4), "Good evening");
});
