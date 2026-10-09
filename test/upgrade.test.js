import assert from "node:assert/strict";
import { test } from "node:test";
import { pickSafeVersion } from "../src/upgrade.js";

const versions = ["4.17.4", "4.17.5", "4.17.21", "4.18.0", "4.18.1", "5.0.0", "5.1.0-beta.1"];

test("prefers the newest safe release in the current major", () => {
  const advisories = [{ id: "a", ranges: [{ introduced: "0", fixed: "4.17.21" }] }];
  assert.deepEqual(pickSafeVersion(versions, advisories, "4.17.4"), { version: "4.18.1", candidates: 4, sameMajor: true });
});

test("falls back to another major only when the current one has no safe release", () => {
  const advisories = [{ id: "a", ranges: [{ introduced: "0", fixed: "5.0.0" }] }];
  assert.deepEqual(pickSafeVersion(versions, advisories, "4.17.4"), { version: "5.0.0", candidates: 1, sameMajor: false });
});

test("prereleases never win and no safe version yields null", () => {
  const advisories = [{ id: "a", ranges: [{ introduced: "0" }] }];
  assert.deepEqual(pickSafeVersion(versions, advisories, "4.17.4"), { version: null, candidates: 0, sameMajor: false });
});
