import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import semver from "semver";
import { affectedRanges, isAffected, listVulns } from "./osv.js";

const run = promisify(execFile);

export async function allAdvisoriesFor(name) {
  const vulns = await listVulns(name);
  return vulns.map((v) => ({ id: v.id, summary: v.summary ?? "", ranges: affectedRanges(v, name) }));
}

// The newest stable release outside every known advisory range, not merely the first fixed version.
export async function newestSafeVersion(name, advisories) {
  const res = await fetch(`https://registry.npmjs.org/${name}`, { headers: { Accept: "application/vnd.npm.install-v1+json" } });
  if (!res.ok) throw new Error(`npm registry ${res.status} for ${name}`);
  const meta = await res.json();
  const safe = Object.keys(meta.versions ?? {}).filter(
    (v) => semver.valid(v) && !semver.prerelease(v) && !advisories.some((a) => isAffected(v, a.ranges)),
  );
  return { version: safe.sort(semver.rcompare)[0] ?? null, latest: meta["dist-tags"]?.latest ?? null, candidates: safe.length };
}

export async function applyUpgrade(repoPath, name, version) {
  const pkgPath = join(repoPath, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  const before = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? null;
  if (pkg.dependencies?.[name] !== undefined) pkg.dependencies[name] = version;
  if (pkg.devDependencies?.[name] !== undefined) pkg.devDependencies[name] = version;
  pkg.overrides = { ...(pkg.overrides ?? {}), [name]: version };
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  const install = await npm(repoPath, ["install", "--no-audit", "--no-fund", "--ignore-scripts"]);
  return { before, install };
}

export async function runTests(repoPath) {
  return npm(repoPath, ["test"]);
}

async function npm(cwd, args) {
  try {
    const { stdout, stderr } = await run("npm", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (err) {
    return { ok: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}`.trim() || err.message };
  }
}
