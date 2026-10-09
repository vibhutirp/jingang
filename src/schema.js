import { readFile } from "node:fs/promises";
import { config } from "./env.js";
import { exec, ping, rows } from "./ch.js";

// reset drops the database first: a clean slate for a recording, so no earlier run's guardrail
// colours the first replay.
export async function applySchema({ reset = false } = {}) {
  const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  if (reset) await exec(`DROP DATABASE IF EXISTS ${config.clickhouse.database}`, { useDatabase: false });
  await exec(`CREATE DATABASE IF NOT EXISTS ${config.clickhouse.database}`, { useDatabase: false });
  for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await exec(statement);
  }
  return rows("SELECT name FROM system.tables WHERE database = currentDatabase() ORDER BY name");
}

if (import.meta.filename === process.argv[1]) {
  const reset = process.argv.includes("--reset");
  console.log(`ClickHouse ${await ping()} at ${config.clickhouse.url}${reset ? " (dropping and recreating the database)" : ""}`);
  const tables = await applySchema({ reset });
  console.log(`database ${config.clickhouse.database}: ${tables.map((t) => t.name).join(", ")}`);
}
