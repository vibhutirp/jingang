import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { insert, rows } from "./ch.js";
import { installedVersions } from "./match.js";
import { isAffected } from "./osv.js";

const WORKFLOW = `name: jingang-guardrails
on: [pull_request]
jobs:
  semgrep:
    runs-on: ubuntu-latest
    container: semgrep/semgrep
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: git config --global --add safe.directory "$GITHUB_WORKSPACE"
      - run: semgrep scan --config .semgrep --baseline-commit "origin/\${{ github.base_ref }}" --error
`;

// Files the fix PR carries into the demo repo so CI blocks the pattern from returning.
export async function writeGuardrailFiles(repoPath, taintRules) {
  const semgrepDir = join(repoPath, ".semgrep");
  await mkdir(semgrepDir, { recursive: true });
  const written = [];
  for (const rule of taintRules) {
    const target = join(semgrepDir, basename(rule.file));
    await copyFile(rule.file, target);
    written.push(`.semgrep/${basename(rule.file)}`);
  }
  const workflowDir = join(repoPath, ".github", "workflows");
  const workflowPath = join(workflowDir, "jingang-guardrails.yml");
  try {
    await readFile(workflowPath);
  } catch {
    await mkdir(workflowDir, { recursive: true });
    await writeFile(workflowPath, WORKFLOW);
    written.push(".github/workflows/jingang-guardrails.yml");
  }
  return written;
}

export async function storeGuardrails({ advisoryId, pkg, ranges, taintRules }) {
  const candidates = [
    {
      id: `${advisoryId}-version-policy`,
      advisory_id: advisoryId,
      kind: "version_policy",
      package: pkg,
      affected_range: JSON.stringify(ranges),
      rule_yaml: "",
      validated: 1,
    },
    ...taintRules.map((r) => ({
      id: r.id,
      advisory_id: advisoryId,
      kind: "taint_rule",
      package: pkg,
      affected_range: "",
      rule_yaml: r.yaml,
      validated: 1,
    })),
  ];
  const ids = candidates.map((c) => `'${c.id}'`).join(",");
  const existing = new Set((await rows(`SELECT id FROM guardrails WHERE id IN (${ids})`)).map((r) => r.id));
  const fresh = candidates.filter((c) => !existing.has(c.id));
  await insert("guardrails", fresh);
  return { stored: fresh.map((c) => c.id), alreadyPresent: [...existing] };
}

// Guardrail A at scan time: any stored range the lockfile has drifted back into.
export async function versionPolicyViolations(repoPath, pkg) {
  const policies = await rows(`SELECT id, advisory_id, affected_range FROM guardrails WHERE kind = 'version_policy' AND package = '${pkg}'`);
  if (policies.length === 0) return [];
  const installed = await installedVersions(repoPath, pkg);
  return policies
    .map((p) => ({ ...p, hits: installed.filter((i) => isAffected(i.version, JSON.parse(p.affected_range))) }))
    .filter((p) => p.hits.length > 0);
}
