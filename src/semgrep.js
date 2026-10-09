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
  return {
    findings: report.results.map((r) => ({
      ruleId: r.check_id.split(".").pop(),
      file: relative(target, r.path),
      line: r.start.line,
      message: r.extra?.message ?? "",
      metadata: r.extra?.metadata ?? {},
    })),
    errors: (report.errors ?? []).map((e) => e.message ?? String(e)),
  };
}
