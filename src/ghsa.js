import { config } from "./env.js";

// Unauthenticated calls get 60 requests an hour; one poll a minute fits.
export async function listNpmAdvisories({ modifiedSince, perPage = 50 } = {}) {
  const params = new URLSearchParams({ ecosystem: "npm", sort: "updated", direction: "desc", per_page: String(perPage) });
  if (modifiedSince) params.set("modified", `>=${new Date(modifiedSince).toISOString().slice(0, 10)}`);
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "jingang-watcher" };
  if (config.github.token) headers.Authorization = `Bearer ${config.github.token}`;
  const res = await fetch(`https://api.github.com/advisories?${params}`, { headers });
  if (!res.ok) throw new Error(`GitHub advisories ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const list = await res.json();
  return list.map((a) => ({ id: a.ghsa_id, updatedAt: a.updated_at, summary: a.summary }));
}
