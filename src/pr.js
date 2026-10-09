import { execFile } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { config, mode } from "./env.js";

const run = promisify(execFile);

async function git(cwd, args, env = process.env) {
  const { stdout } = await run("git", ["-C", cwd, ...args], { env });
  return stdout.trim();
}

// The token travels in git's environment-based config, never in argv or the remote URL.
function tokenEnv(token) {
  if (!token) return process.env;
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    ...process.env,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}

// The demo app must be its own repository; a plain directory gets a DRY run with the body on disk.
export async function isOwnGitRepo(repoPath) {
  try {
    const top = await git(repoPath, ["rev-parse", "--show-toplevel"]);
    return (await realpath(top)) === (await realpath(repoPath));
  } catch {
    return false;
  }
}

export async function headSha(repoPath) {
  try {
    return await git(repoPath, ["rev-parse", "HEAD"]);
  } catch {
    return "";
  }
}

export async function defaultBranch(repoPath) {
  try {
    const ref = await git(repoPath, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
    return ref.replace("refs/remotes/origin/", "");
  } catch {
    return "main";
  }
}

// Puts the demo app back on its default branch so a replay starts from the vulnerable state.
export async function resetRepo(repoPath) {
  if (!(await isOwnGitRepo(repoPath))) return false;
  const branch = await defaultBranch(repoPath);
  await git(repoPath, ["checkout", "-q", "-f", branch]);
  await git(repoPath, ["reset", "-q", "--hard"]);
  await git(repoPath, ["clean", "-fdq", "-e", "node_modules"]);
  return true;
}

export function buildBody(f) {
  const site = f.callSites.map((c) => `- \`${c.file}:${c.line}\` calls the vulnerable function`).join("\n");
  const taint = f.taintFindings.length
    ? f.taintFindings.map((t) => `- \`${t.file}:${t.line}\`: ${t.message.split("\n")[0]}`).join("\n")
    : "- none found by the taint guardrail";
  const others = f.otherAdvisories.length
    ? f.otherAdvisories.map((a) => `- ${a.id}: ${a.summary}`).join("\n")
    : "- none";
  return `## Why this PR exists

${f.explanation}

**Advisory:** [${f.advisory.id}](https://osv.dev/vulnerability/${f.advisory.id})${f.advisory.aliases.length ? ` (${f.advisory.aliases.join(", ")})` : ""}
**Package:** \`${f.package}\` ${f.fromVersion} → ${f.toVersion}

## Reachable call site

${site}

## Request data reaching the call

${taint}

## Verification

- Lockfile version outside every known \`${f.package}\` advisory range: **${f.outsideAllRanges ? "yes" : "no"}**
- \`npm test\`: **${f.testsPassed ? "passed" : "failed"}**
- Status: **${f.verified ? "Verified" : "needs-human"}**

## Other advisories closed by this upgrade

${others}

## Guardrails added

- \`package.json\` \`overrides\` pins every copy of \`${f.package}\`, transitive ones included, to ${f.toVersion}
- \`.semgrep/\` gains the taint rule that flags request data flowing into a deep merge on any version

---
Opened by Jingang. Detection to PR: ${Math.round(f.detectionToPrMs / 1000)} s. Run \`${f.runId}\`.
`;
}

export async function explain(f) {
  const fallback = `Your lockfile has ${f.package} ${f.fromVersion}, inside the range affected by ${f.advisory.id} (${f.advisory.summary}). Jingang confirmed the code calls the vulnerable function at ${f.callSites[0]?.file}:${f.callSites[0]?.line}, so this is exposure, not just an old version. The upgrade to ${f.toVersion} is the newest release outside every known advisory for this package.`;
  if (mode.akash !== "live") return fallback;
  try {
    // A slow or dead model endpoint must never hold up the PR; the template is always acceptable.
    const res = await fetch(`${config.akash.baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.akash.apiKey}` },
      body: JSON.stringify({
        model: config.akash.model,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              "You write the two-sentence plain-English explanation at the top of a dependency-fix pull request. Use only the facts given. Do not invent versions, files, or lines.",
          },
          { role: "user", content: JSON.stringify({ advisory: f.advisory, package: f.package, from: f.fromVersion, to: f.toVersion, callSites: f.callSites, taint: f.taintFindings }) },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function openPr({ repoPath, branch, title, body, runId }) {
  await mkdir(config.outDir, { recursive: true });
  const bodyPath = join(config.outDir, `pr-${runId}.md`);
  await writeFile(bodyPath, `# ${title}\n\n${body}`);

  if (!(await isOwnGitRepo(repoPath))) return { url: null, mode: "dry", bodyPath, note: "demo app path is not its own git repository" };

  await git(repoPath, ["checkout", "-q", "-B", branch]);
  await git(repoPath, ["add", "-A"]);
  await run("git", ["-C", repoPath, "-c", "user.name=Jingang", "-c", "user.email=jingang@users.noreply.github.com", "commit", "-q", "-m", title]);
  if (mode.github !== "live") return { url: null, mode: "dry", bodyPath, branch };

  const { token, repo } = config.github;
  const pushTarget = token ? `https://github.com/${repo}.git` : "origin";
  await git(repoPath, ["push", "-q", "-f", pushTarget, `${branch}:${branch}`], tokenEnv(token));
  const base = await defaultBranch(repoPath);
  const env = token ? { ...process.env, GH_TOKEN: token } : process.env;
  const { stdout } = await run(
    "gh",
    ["pr", "create", "--repo", repo, "--head", branch, "--base", base, "--title", title, "--body-file", bodyPath],
    { env },
  );
  return { url: stdout.trim().split("\n").pop(), mode: "live", bodyPath, branch };
}
