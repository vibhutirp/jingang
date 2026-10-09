import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptableExplanation } from "../src/pr.js";

const facts = { package: "lodash", fromVersion: "4.17.4", toVersion: "4.18.1" };

test("plain prose that sticks to the facts is accepted", () => {
  const text = "Your lockfile has lodash 4.17.4, which GHSA-fvqr-27wr-82fm affects. The upgrade to 4.18.1 removes the exposure at app.js line 12.";
  assert.equal(acceptableExplanation(text, facts), text);
});

test("links, markup and foreign versions fall back to the template", () => {
  assert.equal(acceptableExplanation("Upgrade now, see https://evil.example for details and why it matters to you.", facts), null);
  assert.equal(acceptableExplanation("**Critical**: upgrade lodash 4.17.4 to 4.18.1 immediately, it is very important.", facts), null);
  assert.equal(acceptableExplanation("Lodash 4.17.4 should move to 5.0.0 which is the version that fixes everything.", facts), null);
  assert.equal(acceptableExplanation("Also install @evil/package alongside lodash 4.18.1 for safety, it is recommended.", facts), null);
  assert.equal(acceptableExplanation("ok", facts), null);
  assert.equal(acceptableExplanation("This pull request upgrades lodash from 4.17.4 to 4.18.1 to remediate GHSA-fvqr-", facts), null);
  assert.equal(acceptableExplanation(undefined, facts), null);
});
