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
// Releases in the current major win when any exist, so a fix never jumps a major on its own.
export function pickSafeVersion(versions, advisories, current) {
  const safe = versions.filter((v) => semver.valid(v) && !semver.prerelease(v) && !advisories.some((a) => isAffected(v, a.ranges)));
  const currentMajor = semver.valid(current) ? semver.major(current) : null;
  const sameMajor = currentMajor === null ? [] : safe.filter((v) => semver.major(v) === currentMajor);
  const pool = sameMajor.length ? sameMajor : safe;
  return { version: pool.sort(semver.rcompare)[0] ?? null, candidates: safe.length, sameMajor: sameMajor.length > 0 };
}

export async function newestSafeVersion(name, advisories, current) {
  const res = await fetch(`https://registry.npmjs.org/${name}`, { headers: { Accept: "application/vnd.npm.install-v1+json" } });
  if (!res.ok) throw new Error(`npm registry ${res.status} for ${name}`);
  const meta = await res.json();
  return { ...pickSafeVersion(Object.keys(meta.versions ?? {}), advisories, current), latest: meta["dist-tags"]?.latest ?? null };
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

// On Windows npm is npm.cmd, which Node only spawns through a shell.
async function npm(cwd, args) {
  const win = process.platform === "win32";
  try {
    const { stdout, stderr } = await run(win ? `npm ${args.join(" ")}` : "npm", win ? [] : args, { cwd, maxBuffer: 16 * 1024 * 1024, shell: win });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (err) {
    return { ok: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}`.trim() || err.message };
  }
}
