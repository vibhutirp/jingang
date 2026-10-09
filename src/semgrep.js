import { execFile } from "node:child_process";
import { relative } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

async function semgrep(args, opts = {}) {
  try {
    return await run("semgrep", args, { maxBuffer: 64 * 1024 * 1024, ...opts });
  } catch (err) {
    // Exit code 1 means findings were reported, which is a normal result here.
    if (err.code === 1 && err.stdout) return { stdout: err.stdout, stderr: err.stderr };
    throw err;
  }
}

export async function validateRules(path) {
  try {
    const { stdout, stderr } = await run("semgrep", ["--metrics=off", "--validate", "--config", path]);
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (err) {
    return { ok: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}`.trim() };
  }
}

// Findings come back as {ruleId, file, line, message, metadata}; file is relative to target.
export async function scan({ configs, target }) {
  const args = ["scan", "--metrics=off", "--quiet", "--json", "--exclude", "node_modules", ...configs.flatMap((c) => ["--config", c]), target];
  const { stdout } = await semgrep(args);
  const report = JSON.parse(stdout);
  // The same rule id can arrive from two config files; one finding per (rule, file, line) is kept.
  const byKey = new Map();
  for (const r of report.results) {
    const finding = {
      ruleId: r.check_id.split(".").pop(),
      file: relative(target, r.path),
      line: r.start.line,
      message: r.extra?.message ?? "",
      metadata: r.extra?.metadata ?? {},
    };
    byKey.set(`${finding.ruleId}|${finding.file}|${finding.line}`, finding);
  }
  return {
    findings: [...byKey.values()],
    errors: (report.errors ?? []).map((e) => e.message ?? String(e)),
  };
}
