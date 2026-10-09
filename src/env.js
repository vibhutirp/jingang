import { resolve } from "node:path";

const env = (key, fallback = "") => process.env[key] ?? fallback;

export const config = {
  clickhouse: {
    url: env("CLICKHOUSE_URL", "http://localhost:8123"),
    user: env("CLICKHOUSE_USER", "default"),
    password: env("CLICKHOUSE_PASSWORD"),
    database: env("CLICKHOUSE_DB", "jingang"),
  },
  akash: {
    apiKey: env("AKASHML_API_KEY"),
    baseUrl: env("AKASHML_BASE_URL", "https://api.akashml.com/v1"),
    model: env("AKASHML_MODEL", "gpt-oss-120b"),
  },
  github: {
    token: env("GITHUB_TOKEN"),
    repo: env("GITHUB_REPO"),
  },
  guildUrl: env("GUILD_API_URL"),
  apiSecret: env("JINGANG_API_SECRET"),
  demoAppPath: resolve(env("DEMO_APP_PATH", "../jingang-demo-app")),
  port: Number(env("JINGANG_PORT", "8787")),
  rulesDir: resolve("rules"),
  outDir: resolve("out"),
};

// A missing credential degrades one step instead of blocking the loop.
export const mode = {
  akash: config.akash.apiKey ? "live" : "mock",
  github: config.github.repo ? "live" : "dry",
};
