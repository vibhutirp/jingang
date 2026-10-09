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

// OSV range bounds are not always full semver ("1.0", "4.17"); they are coerced like the version is.
// A bound that still does not parse is treated conservatively: an unreadable start means "from 0",
// an unreadable end means "no fix known", so the advisory stays matched rather than silently dropped.
export function isAffected(version, ranges) {
  const v = semver.coerce(version, { includePrerelease: true })?.version ?? semver.valid(version);
  if (!v) return false;
  const bound = (x) => (x === undefined || x === null ? undefined : (semver.valid(x) ?? semver.coerce(x)?.version ?? undefined));
  return ranges.some((r) => {
    try {
      const from = r.introduced === "0" ? "0.0.0" : (bound(r.introduced) ?? "0.0.0");
      if (semver.lt(v, from)) return false;
      if (r.fixed !== undefined) {
        const fixed = bound(r.fixed);
        return fixed ? semver.lt(v, fixed) : true;
      }
      if (r.lastAffected !== undefined) {
        const last = bound(r.lastAffected);
        return last ? semver.lte(v, last) : true;
      }
      return true;
    } catch {
      return false;
    }
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
