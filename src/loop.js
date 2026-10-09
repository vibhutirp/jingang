import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { insert } from "./ch.js";
import { config } from "./env.js";
import { storeGuardrails, versionPolicyViolations, writeGuardrailFiles } from "./guardrails.js";
import { installedVersions, matchLockfile } from "./match.js";
import { affectedRanges, isAffected, primaryPackage, toClickHouseTs } from "./osv.js";
import { buildBody, explain, headSha, openPr } from "./pr.js";
import { loadRules, reachabilityRulesFor, storedGuardrailConfigs } from "./rules.js";
import { scan } from "./semgrep.js";
import { allAdvisoriesFor, applyUpgrade, newestSafeVersion, runTests } from "./upgrade.js";

// One advisory through the eight steps; every step is one events row and the return value is the summary.
export async function runAdvisory(vuln, { repoPath = config.demoAppPath, detectedAt = new Date(), source = "replay" } = {}) {
  const runId = randomUUID().slice(0, 8);
  const repo = config.github.repo || basename(repoPath);
  const summary = { runId, advisoryId: vuln.id, repo, steps: [] };

  const log = async (step, status, detail = {}, startedAt = Date.now()) => {
    const latency_ms = Math.max(0, Date.now() - startedAt);
    await insert("events", { run_id: runId, advisory_id: vuln.id, repo, step, status, latency_ms, detail: JSON.stringify(detail) });
    summary.steps.push({ step, status, latency_ms, ...detail });
    console.log(`[${runId}] ${vuln.id} ${step}: ${status}${latency_ms ? ` (${latency_ms} ms)` : ""}`);
  };

  const pkg = primaryPackage(vuln);
  if (!pkg) {
    await log("match", "not_npm");
    return summary;
  }
  const ranges = affectedRanges(vuln, pkg);

  // 2. Match
  let t = Date.now();
  const { installed, matched } = await matchLockfile(repoPath, pkg, ranges);
  const sha = await headSha(repoPath);
  if (installed.length) {
    await insert("lockfiles", installed.map((i) => ({ repo, commit_sha: sha, package: pkg, version: i.version, ts: toClickHouseTs(new Date()) })));
  }
  if (matched.length === 0) {
    await log("match", "not_in_range", { package: pkg, installed: installed.map((i) => i.version), ranges }, t);
    return summary;
  }
  await log("match", "Matched", { package: pkg, installed: installed.map((i) => i.version), ranges }, t);

  const violations = await versionPolicyViolations(repoPath, pkg);
  if (violations.length) await log("guardrail_check", "violated", { policies: violations.map((v) => v.id) });

  // 3. Get the rule
  t = Date.now();
  const rules = await loadRules();
  const reach = reachabilityRulesFor(rules, vuln.id);
  if (reach.length === 0) {
    await log("rule", "Unconfirmed", { reason: "no hand-written rule and the generator is not built" }, t);
    return summary;
  }
  await log("rule", "hand_written", { rules: reach.map((r) => r.id) }, t);

  // 4. Exposed?
  t = Date.now();
  const taintRules = rules.filter((r) => r.kind === "taint_rule" && r.package === pkg);
  const { configs: storedConfigs } = await storedGuardrailConfigs();
  const configs = [...new Set([...reach.map((r) => r.file), ...taintRules.map((r) => r.file), ...storedConfigs])];
  const { findings, errors } = await scan({ configs, target: repoPath });
  const reachIds = new Set(reach.map((r) => r.id));
  const taintIds = new Set(taintRules.map((r) => r.id));
  const callSites = findings.filter((f) => reachIds.has(f.ruleId));
  const taintFindings = findings.filter((f) => taintIds.has(f.ruleId) || f.metadata?.kind === "taint_rule");
  if (callSites.length === 0) {
    await log("exposed", "Suppressed", { package: pkg, scanned: configs.length, errors }, t);
    return summary;
  }
  await log("exposed", "Exposed", { callSites, taintFindings, errors }, t);

  // 5. Upgrade
  t = Date.now();
  const advisories = await allAdvisoriesFor(pkg);
  const { version: safeVersion, latest } = await newestSafeVersion(pkg, advisories);
  if (!safeVersion) {
    await log("upgrade", "no_safe_version", { package: pkg, latest }, t);
    return summary;
  }
  const fromVersion = matched[0].version;
  const { install } = await applyUpgrade(repoPath, pkg, safeVersion);
  await log("upgrade", install.ok ? "upgraded" : "install_failed", { from: fromVersion, to: safeVersion, latest, output: install.output.slice(-800) }, t);
  const guardrailFiles = await writeGuardrailFiles(repoPath, taintRules);

  // 6. Verify
  t = Date.now();
  const after = await installedVersions(repoPath, pkg);
  const outsideAllRanges = after.length > 0 && after.every((i) => !advisories.some((a) => isAffected(i.version, a.ranges)));
  const tests = install.ok ? await runTests(repoPath) : { ok: false, output: "install failed" };
  const verified = outsideAllRanges && tests.ok;
  await log("verify", verified ? "Verified" : "needs-human", { outsideAllRanges, testsPassed: tests.ok, after: after.map((i) => i.version), output: tests.output.slice(-800) }, t);

  // 7. Open the PR
  t = Date.now();
  const facts = {
    runId,
    advisory: { id: vuln.id, aliases: vuln.aliases ?? [], summary: vuln.summary ?? "" },
    package: pkg,
    fromVersion,
    toVersion: safeVersion,
    callSites,
    taintFindings,
    outsideAllRanges,
    testsPassed: tests.ok,
    verified,
    otherAdvisories: advisories.filter((a) => a.id !== vuln.id && isAffected(fromVersion, a.ranges)),
    detectionToPrMs: Date.now() - detectedAt.getTime(),
    guardrailFiles,
  };
  const explanation = await explain(facts);
  facts.explanation = explanation.text;
  const title = `fix(deps): upgrade ${pkg} ${fromVersion} → ${safeVersion} (${vuln.id})${verified ? "" : " [needs-human]"}`;
  const pr = await openPr({ repoPath, branch: `jingang/${vuln.id.toLowerCase()}-${runId}`, title, body: buildBody(facts), runId });
  facts.detectionToPrMs = Date.now() - detectedAt.getTime();
  await log(
    "pr",
    pr.url ? "opened" : "dry",
    {
      url: pr.url,
      bodyPath: pr.bodyPath,
      branch: pr.branch,
      label: verified ? null : "needs-human",
      detection_to_pr_ms: facts.detectionToPrMs,
      source,
      explanation_source: explanation.source,
      explanation_fallback_reason: explanation.reason,
    },
    t,
  );

  // 8. Store guardrails
  t = Date.now();
  const stored = await storeGuardrails({ advisoryId: vuln.id, pkg, ranges, taintRules });
  await log("guardrails", "stored", stored, t);
  return summary;
}
