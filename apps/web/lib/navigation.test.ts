import assert from "node:assert/strict";
import { test } from "vitest";

import { isRouteActive, navigationSections } from "./navigation";

test("sidebar navigation matches the dashboard information architecture", () => {
  assert.deepEqual(
    navigationSections.map((section) => [section.label, section.items.map((item) => item.label)]),
    [
      [
        "Main",
        [
          "Overview",
          "Practice",
          "Interview Library",
          "Resume & Jobs",
          "Performance",
          "Skills & Weaknesses",
          "Practice Plan",
        ],
      ],
      ["Account", ["Subscription", "Settings", "Profile"]],
    ],
  );
});

test("every navigation item points to a unique, well-formed internal route", () => {
  const items = navigationSections.flatMap((section) => section.items);
  const hrefs = items.map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const href of hrefs) {
    assert.match(href, /^\/[a-z0-9-/]*$/);
  }
});

test("active route matching is exact for actions and prefix-based for sections", () => {
  assert.equal(isRouteActive("/dashboard", "/dashboard"), true);
  assert.equal(isRouteActive("/dashboard/other", "/dashboard"), false);
  assert.equal(isRouteActive("/interviews/new", "/interviews/new"), true);
  assert.equal(isRouteActive("/interviews/abc", "/interviews/new"), false);
  assert.equal(isRouteActive("/history", "/history"), true);
  assert.equal(isRouteActive("/history/extra", "/history"), true);
  assert.equal(isRouteActive("/profile", "/profile"), true);
  assert.equal(isRouteActive("/profiles", "/profile"), false);
  assert.equal(isRouteActive("/practice-plan", "/practice-plan"), true);
  assert.equal(isRouteActive("/performance", "/practice-plan"), false);
});
