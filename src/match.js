import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isAffected } from "./osv.js";

// Returns every installed copy of a package, including nested ones, as {path, version}.
export async function installedVersions(repoPath, name) {
  const lock = JSON.parse(await readFile(join(repoPath, "package-lock.json"), "utf8"));
  const found = [];
  if (lock.packages) {
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)) found.push({ path, version: entry.version });
    }
  } else if (lock.dependencies) {
    const walk = (deps, prefix) => {
      for (const [dep, entry] of Object.entries(deps)) {
        const path = `${prefix}node_modules/${dep}`;
        if (dep === name) found.push({ path, version: entry.version });
        if (entry.dependencies) walk(entry.dependencies, `${path}/`);
      }
    };
    walk(lock.dependencies, "");
  }
  return found;
}

export async function matchLockfile(repoPath, name, ranges) {
  const installed = await installedVersions(repoPath, name);
  const matched = installed.filter((i) => isAffected(i.version, ranges));
  return { installed, matched };
}
