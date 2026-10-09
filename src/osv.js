import semver from "semver";

const OSV = "https://api.osv.dev/v1";

export async function getVuln(id) {
  const res = await fetch(`${OSV}/vulns/${id}`);
  if (!res.ok) throw new Error(`OSV ${res.status} for ${id}`);
  return res.json();
}

export async function listVulns(name, ecosystem = "npm") {
  const res = await fetch(`${OSV}/query`, { method: "POST", body: JSON.stringify({ package: { name, ecosystem } }) });
  if (!res.ok) throw new Error(`OSV query ${res.status} for ${name}`);
  return (await res.json()).vulns ?? [];
}

export function primaryPackage(vuln, ecosystem = "npm") {
  return vuln.affected?.find((a) => a.package?.ecosystem === ecosystem)?.package?.name ?? null;
}

// Each range becomes {introduced, fixed?, lastAffected?}; "0" means every version.
export function affectedRanges(vuln, name, ecosystem = "npm") {
  const out = [];
  for (const a of vuln.affected ?? []) {
    if (a.package?.ecosystem !== ecosystem || a.package?.name !== name) continue;
    for (const r of a.ranges ?? []) {
      if (!["ECOSYSTEM", "SEMVER"].includes(r.type)) continue;
      let current = null;
      for (const ev of r.events ?? []) {
        if (ev.introduced !== undefined) {
          if (current) out.push(current);
          current = { introduced: ev.introduced };
        } else if (current && ev.fixed !== undefined) {
          current.fixed = ev.fixed;
        } else if (current && ev.last_affected !== undefined) {
          current.lastAffected = ev.last_affected;
        }
      }
      if (current) out.push(current);
    }
  }
  return out;
}

export function isAffected(version, ranges) {
  const v = semver.coerce(version, { includePrerelease: true })?.version ?? semver.valid(version);
  if (!v) return false;
  return ranges.some((r) => {
    const from = r.introduced === "0" ? "0.0.0" : r.introduced;
    if (semver.lt(v, from)) return false;
    if (r.fixed) return semver.lt(v, r.fixed);
    if (r.lastAffected) return semver.lte(v, r.lastAffected);
    return true;
  });
}

// Fix commits can hide under any reference type, so every URL is scanned.
export function fixCommits(vuln) {
  return (vuln.references ?? []).map((r) => r.url).filter((u) => /github\.com\/[^/]+\/[^/]+\/commit\//.test(u));
}

export function toAdvisoryRow(vuln, { ecosystem = "npm", detectedAt = new Date() } = {}) {
  const pkg = primaryPackage(vuln, ecosystem);
  return {
    id: vuln.id,
    aliases: vuln.aliases ?? [],
    package: pkg ?? "",
    ecosystem,
    ranges: JSON.stringify(pkg ? affectedRanges(vuln, pkg, ecosystem) : []),
    details: `${vuln.summary ?? ""}\n\n${vuln.details ?? ""}`.trim(),
    refs: (vuln.references ?? []).map((r) => r.url),
    fix_commits: fixCommits(vuln),
    modified: toClickHouseTs(vuln.modified),
    detected_at: toClickHouseTs(detectedAt),
  };
}

export function toClickHouseTs(value) {
  return new Date(value).toISOString().replace("T", " ").replace("Z", "");
}
