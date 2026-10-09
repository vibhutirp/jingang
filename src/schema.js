import { readFile } from "node:fs/promises";
import { config } from "./env.js";
import { exec, ping, rows } from "./ch.js";

export async function applySchema() {
  const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await exec(`CREATE DATABASE IF NOT EXISTS ${config.clickhouse.database}`, { useDatabase: false });
  for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await exec(statement);
  }
  return rows("SELECT name FROM system.tables WHERE database = currentDatabase() ORDER BY name");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  console.log(`ClickHouse ${await ping()} at ${config.clickhouse.url}`);
  const tables = await applySchema();
  console.log(`database ${config.clickhouse.database}: ${tables.map((t) => t.name).join(", ")}`);
}
