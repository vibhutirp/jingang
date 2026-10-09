import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { scan, validateRules } from "../src/semgrep.js";

const rulesDir = resolve("rules");
const fixtures = resolve("rules/fixtures");

// The PRD fixture table: reachability fires on three of four, taint on the two request-data cases.
const expected = {
  "jingang-ghsa-fvqr-27wr-82fm-call": new Set(["pos-cjs.js", "pos-esm.mjs", "const-merge.js"]),
  "jingang-guard-untrusted-input-deep-merge": new Set(["pos-cjs.js", "pos-esm.mjs"]),
  "jingang-ghsa-35jh-r3h4-6jhm-call": new Set(),
  "jingang-ghsa-p6mc-m468-83gw-call": new Set(),
};

test("every rule file passes semgrep --validate", async () => {
  const { ok, output } = await validateRules(rulesDir);
  assert.ok(ok, output);
});

test("rules fire exactly where the fixture table says", async () => {
  const { findings, errors } = await scan({ configs: [rulesDir], target: fixtures });
  assert.deepEqual(errors, []);
  const actual = {};
  for (const f of findings) (actual[f.ruleId] ??= new Set()).add(f.file);
  for (const [rule, files] of Object.entries(expected)) {
    assert.deepEqual([...(actual[rule] ?? [])].sort(), [...files].sort(), rule);
  }
});
