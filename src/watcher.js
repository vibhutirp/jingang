import { parseArgs } from "node:util";
import { insert, rows } from "./ch.js";
import { config, mode } from "./env.js";
import { listNpmAdvisories } from "./ghsa.js";
import { runAdvisory } from "./loop.js";
import { getVuln, toAdvisoryRow } from "./osv.js";
import { resetRepo } from "./pr.js";

const POLL_MS = 60_000;

export async function replay(advisoryId, { repoPath = config.demoAppPath, reset = true } = {}) {
  const detectedAt = new Date();
  const vuln = await getVuln(advisoryId);
  await insert("advisories", toAdvisoryRow(vuln, { detectedAt }));
  await insert("events", { run_id: "watch", advisory_id: vuln.id, repo: "", step: "watch", status: "replay", latency_ms: 0, detail: JSON.stringify({ modified: vuln.modified }) });
  if (reset) await resetRepo(repoPath);
  return runAdvisory(vuln, { repoPath, detectedAt, source: "replay" });
}

export async function pollOnce(seen, { repoPath = config.demoAppPath, modifiedSince } = {}) {
  const list = await listNpmAdvisories({ modifiedSince });
  const fresh = list.filter((a) => !seen.has(a.id));
  for (const a of fresh) {
    const detectedAt = new Date();
    let vuln;
    try {
      vuln = await getVuln(a.id);
    } catch (err) {
      console.log(`${a.id}: OSV not ready (${err.message}), retrying next poll`);
      continue;
    }
    seen.add(a.id);
    await insert("advisories", toAdvisoryRow(vuln, { detectedAt }));
    await insert("events", { run_id: "watch", advisory_id: vuln.id, repo: "", step: "watch", status: "live", latency_ms: 0, detail: JSON.stringify({ summary: a.summary }) });
    console.log(`live: ${vuln.id} ${a.summary ?? ""}`);
    await runAdvisory(vuln, { repoPath, detectedAt, source: "live" });
  }
  return fresh.length;
}

export async function watch({ repoPath = config.demoAppPath, once = false } = {}) {
  const seen = new Set((await rows("SELECT DISTINCT id FROM advisories")).map((r) => r.id));
  const modifiedSince = Date.now() - 24 * 60 * 60 * 1000;
  console.log(`watching GitHub Advisory API (npm), ${seen.size} advisories already seen, modes: akash=${mode.akash} github=${mode.github}`);
  do {
    try {
      const n = await pollOnce(seen, { repoPath, modifiedSince });
      console.log(`${new Date().toISOString()} poll: ${n} new`);
    } catch (err) {
      console.error(`poll failed: ${err.message}`);
    }
    if (!once) await new Promise((r) => setTimeout(r, POLL_MS));
  } while (!once);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { values } = parseArgs({
    options: {
      replay: { type: "string" },
      once: { type: "boolean", default: false },
      repo: { type: "string" },
      "no-reset": { type: "boolean", default: false },
    },
  });
  const repoPath = values.repo ?? config.demoAppPath;
  if (values.replay) {
    const summary = await replay(values.replay, { repoPath, reset: !values["no-reset"] });
    console.log(JSON.stringify(summary, null, 2));
  } else {
    await watch({ repoPath, once: values.once });
  }
}
