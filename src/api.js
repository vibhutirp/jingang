import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { insert, rows } from "./ch.js";
import { config, mode } from "./env.js";
import { replay } from "./watcher.js";

const VOCAB = ["Matched", "Exposed", "Suppressed", "Unconfirmed", "Verified"];

// Dashboard numbers are counts over the latest status per (advisory, step); nothing else feeds them.
export async function stats() {
  const latest = await rows(
    "SELECT advisory_id, step, argMax(status, ts) AS status, argMax(detail, ts) AS detail, max(ts) AS last_ts FROM events WHERE run_id != 'watch' GROUP BY advisory_id, step",
  );
  const count = (step, status) => latest.filter((r) => r.step === step && r.status === status).length;
  const prs = latest.filter((r) => r.step === "pr");
  const detectionToPr = prs.map((r) => JSON.parse(r.detail).detection_to_pr_ms ?? null).filter((v) => v !== null);
  const [{ n: guardrails }] = await rows("SELECT count() AS n FROM guardrails");
  const [{ n: advisoriesSeen }] = await rows("SELECT uniqExact(id) AS n FROM advisories");
  return {
    vocabulary: VOCAB,
    advisories_seen: Number(advisoriesSeen),
    matched: count("match", "Matched"),
    not_in_range: count("match", "not_in_range"),
    exposed: count("exposed", "Exposed"),
    suppressed: count("exposed", "Suppressed"),
    unconfirmed: count("rule", "Unconfirmed"),
    verified: count("verify", "Verified"),
    needs_human: count("verify", "needs-human"),
    prs: prs.length,
    detection_to_pr_ms: { last: detectionToPr.at(-1) ?? null, avg: detectionToPr.length ? Math.round(detectionToPr.reduce((a, b) => a + b, 0) / detectionToPr.length) : null },
    guardrails: Number(guardrails),
    modes: mode,
  };
}

export async function recentEvents(limit = 60) {
  const capped = Math.min(Math.max(1, Number(limit) || 60), 500);
  return rows(`SELECT ts, run_id, advisory_id, repo, step, status, latency_ms, detail FROM events ORDER BY ts DESC LIMIT ${capped}`);
}

function authorized(req) {
  return Boolean(config.apiSecret) && req.headers["x-jingang-secret"] === config.apiSecret;
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function send(res, status, payload, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(type === "application/json" ? JSON.stringify(payload) : payload);
}

export function createApi() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/") {
        return send(res, 200, await readFile(new URL("./dashboard.html", import.meta.url), "utf8"), "text/html; charset=utf-8");
      }
      if (req.method === "GET" && url.pathname === "/api/stats") return send(res, 200, await stats());
      if (req.method === "GET" && url.pathname === "/api/events") return send(res, 200, await recentEvents(url.searchParams.get("limit") ?? 60));

      if (req.method === "POST" && url.pathname === "/api/run") {
        if (!authorized(req)) return send(res, 401, { error: "X-Jingang-Secret header required" });
        const { advisory_id } = await readJson(req);
        if (!advisory_id) return send(res, 400, { error: "advisory_id required" });
        replay(advisory_id).catch((err) => console.error(`run ${advisory_id} failed: ${err.message}`));
        return send(res, 202, { accepted: advisory_id });
      }
      // Approval is recorded for the audit trail only. No run waits on it: the PRD accepts approvals
      // from Guild once Guild is wired in, and until then the loop runs straight through to the PR.
      if (req.method === "POST" && url.pathname === "/api/approve") {
        if (!authorized(req)) return send(res, 401, { error: "X-Jingang-Secret header required" });
        const { run_id, advisory_id, approver = "api" } = await readJson(req);
        await insert("events", { run_id: run_id ?? "", advisory_id: advisory_id ?? "", repo: "", step: "approve", status: "approved", latency_ms: 0, detail: JSON.stringify({ approver }) });
        return send(res, 200, { approved: true, gates_run: false, note: "recorded only; runs do not wait for approval until Guild is wired in" });
      }
      return send(res, 404, { error: "not found" });
    } catch (err) {
      console.error(err);
      return send(res, 500, { error: err.message });
    }
  });
}

if (import.meta.filename === process.argv[1]) {
  createApi().listen(config.port, config.host, () => {
    console.log(`Jingang API on http://${config.host}:${config.port} (akash=${mode.akash}, github=${mode.github}, secret ${config.apiSecret ? "set" : "NOT set: /api/run disabled"})`);
  });
}
