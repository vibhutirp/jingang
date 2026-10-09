import { config } from "./env.js";

const { url, user, password, database } = config.clickhouse;

function headers() {
  return { "X-ClickHouse-User": user, "X-ClickHouse-Key": password };
}

async function post(sql, { useDatabase = true, body = "" } = {}) {
  const params = new URLSearchParams({ query: sql });
  if (useDatabase) params.set("database", database);
  const res = await fetch(`${url}/?${params}`, { method: "POST", headers: headers(), body });
  const text = await res.text();
  if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${text.trim()}`);
  return text;
}

export async function exec(sql, opts) {
  await post(sql, opts);
}

export async function rows(sql) {
  const text = await post(`${sql} FORMAT JSONEachRow`);
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function insert(table, records) {
  const list = Array.isArray(records) ? records : [records];
  if (list.length === 0) return;
  await post(`INSERT INTO ${table} FORMAT JSONEachRow`, { body: list.map((r) => JSON.stringify(r)).join("\n") });
}

export async function ping() {
  return (await post("SELECT version()", { useDatabase: false })).trim();
}
