import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import { config } from "./env.js";
import { rows } from "./ch.js";

// A rule file carries its advisory, package and kind in metadata; that is the whole index.
export async function loadRules(dir = config.rulesDir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const out = [];
  for (const file of files) {
    const text = await readFile(join(dir, file), "utf8");
    const doc = YAML.parse(text);
    for (const rule of doc.rules ?? []) {
      out.push({
        file: join(dir, file),
        id: rule.id,
        advisory: rule.metadata?.advisory ?? null,
        package: rule.metadata?.package ?? null,
        kind: rule.metadata?.kind ?? "reachability",
        yaml: text,
      });
    }
  }
  return out;
}

export function reachabilityRulesFor(rules, advisoryId) {
  return rules.filter((r) => r.kind === "reachability" && r.advisory === advisoryId);
}

// Stored guardrails are materialised to disk because Semgrep reads configs from files.
// Ids in excludeIds are skipped: a rule that also lives in rules/ would make Semgrep report each finding twice.
export async function storedGuardrailConfigs({ excludeIds = new Set() } = {}) {
  const guardrails = await rows(
    "SELECT id, advisory_id, kind, package, affected_range, rule_yaml FROM guardrails WHERE validated = 1 ORDER BY created_at",
  );
  const dir = join(config.outDir, "guardrails");
  await mkdir(dir, { recursive: true });
  const configs = [];
  for (const g of guardrails) {
    if (!g.rule_yaml || excludeIds.has(g.id)) continue;
    const path = join(dir, `${g.id}.yaml`);
    await writeFile(path, g.rule_yaml);
    configs.push(path);
  }
  return { guardrails, configs };
}
