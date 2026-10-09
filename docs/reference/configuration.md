# Configuration

All settings are environment variables, read from `.env` locally. Copy `.env.example` and fill in values; only names are committed.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CLICKHOUSE_URL` | yes | `http://localhost:8123` | HTTP endpoint. ClickHouse Cloud uses `https://<host>:8443`. |
| `CLICKHOUSE_USER` | yes | `default` | |
| `CLICKHOUSE_PASSWORD` | yes | `hack` | Password of the team's local Docker container `ch-hack`; Cloud uses its own. |
| `AKASHML_API_KEY` | no | empty | Empty runs rule generation and PR text in mock mode: hand-written rules, templated text. |
| `AKASHML_BASE_URL` | no | `https://api.akashml.com/v1` | OpenAI-compatible endpoint. |
| `AKASHML_MODEL` | no | `gpt-oss-120b` | |
| `GITHUB_TOKEN` | no | empty | Fine-grained token scoped to `jingang-demo-app` only: Contents and Pull requests read/write, 7-day expiry. Empty makes the PR step print the body instead of opening it. |
| `GITHUB_REPO` | no | empty | `owner/name` of the demo app the agent patches. |
| `GUILD_API_URL` | no | empty | Empty runs the loop locally; Guild is a Should item. |
| `JINGANG_API_SECRET` | for `/api/run`, `/api/approve` | empty | Expected value of the `X-Jingang-Secret` header. `/api/stats` is read-only and needs none. |

Every component must run with only the `CLICKHOUSE_*` variables set, so a missing key degrades one step rather than blocking the demo. The token scoping rules come from the "Securing Jingang itself" section of the [PRD](../prd.md).
