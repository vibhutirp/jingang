import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { installedVersions, matchLockfile } from "../src/match.js";
import { affectedRanges, isAffected } from "../src/osv.js";

const ranges = [{ introduced: "0", fixed: "4.17.5" }];

async function lockfileWith(versions) {
  const dir = await mkdtemp(join(tmpdir(), "jingang-lock-"));
  const packages = { "": { name: "x" } };
  versions.forEach((v, i) => {
    packages[i === 0 ? "node_modules/lodash" : `node_modules/dep${i}/node_modules/lodash`] = { version: v };
  });
  await writeFile(join(dir, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages }));
  return dir;
}

test("isAffected follows OSV introduced/fixed events", () => {
  assert.equal(isAffected("4.17.4", ranges), true);
  assert.equal(isAffected("4.17.5", ranges), false);
  assert.equal(isAffected("4.17.21", ranges), false);
  assert.equal(isAffected("4.0.0", [{ introduced: "4.0.0", fixed: "4.17.21" }]), true);
  assert.equal(isAffected("3.10.1", [{ introduced: "4.0.0", fixed: "4.17.21" }]), false);
  assert.equal(isAffected("1.2.3", [{ introduced: "0", lastAffected: "1.2.3" }]), true);
});

test("affectedRanges reads only the requested npm package", () => {
  const vuln = {
    affected: [
      { package: { ecosystem: "npm", name: "lodash" }, ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "0" }, { fixed: "4.17.5" }] }] },
      { package: { ecosystem: "RubyGems", name: "lodash-rails" }, ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "0" }, { fixed: "4.17.5" }] }] },
    ],
  };
  assert.deepEqual(affectedRanges(vuln, "lodash"), ranges);
  assert.deepEqual(affectedRanges(vuln, "express"), []);
});

test("nested copies of the package are found and matched independently", async () => {
  const dir = await lockfileWith(["4.17.21", "4.17.4"]);
  const installed = await installedVersions(dir, "lodash");
  assert.deepEqual(installed.map((i) => i.version), ["4.17.21", "4.17.4"]);
  const { matched } = await matchLockfile(dir, "lodash", ranges);
  assert.deepEqual(matched.map((i) => i.version), ["4.17.4"]);
});

test("a lockfile outside the range does not match", async () => {
  const dir = await lockfileWith(["4.18.1"]);
  const { matched } = await matchLockfile(dir, "lodash", ranges);
  assert.deepEqual(matched, []);
});
