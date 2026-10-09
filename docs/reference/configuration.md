# Configuration

All settings are environment variables, read from `.env` locally. Copy `.env.example` and fill in values; only names are committed.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CLICKHOUSE_URL` | yes | `http://localhost:8123` | HTTP endpoint. ClickHouse Cloud uses `https://<host>:8443`. |
| `CLICKHOUSE_USER` | yes | `default` | |
| `CLICKHOUSE_PASSWORD` | yes | `hack` | Password of the team's local Docker container `ch-hack`; Cloud uses its own. |
| `CLICKHOUSE_DB` | no | `jingang` | Database the schema creates and every query runs in. |
| `AKASHML_API_KEY` | no | empty | Empty runs rule generation and PR text in mock mode: hand-written rules, templated text. Any non-empty value switches the model call on; a self-hosted endpoint ignores it. |
| `AKASHML_BASE_URL` | no | `https://api.akashml.com/v1` | Any OpenAI-compatible endpoint, including an Ollama container on Akash console deployed from `deploy/akash-ollama.yaml`. |
| `AKASHML_MODEL` | no | `openai/gpt-oss-120b` | Model id the endpoint lists under `/v1/models`, for example `qwen2.5:3b` on the Ollama deployment. |
| `GITHUB_TOKEN` | no | empty | Fine-grained token scoped to `jingang-demo-app` only: Contents and Pull requests read/write, 7-day expiry. Empty makes the PR step print the body instead of opening it. |
| `GITHUB_REPO` | no | empty | `owner/name` of the demo app the agent patches. |
| `GUILD_API_URL` | no | empty | Empty runs the loop locally; Guild is a Should item. |
| `JINGANG_API_SECRET` | for `/api/run`, `/api/approve` | empty | Expected value of the `X-Jingang-Secret` header. `/api/stats` is read-only and needs none. Empty disables both endpoints. |
| `DEMO_APP_PATH` | yes | `../jingang-demo-app` | Local clone of the demo app the loop reads, upgrades and commits in. A plain directory that is not its own git repository gets a dry run. |
| `JINGANG_PORT` | no | `8787` | Port for the glue API and dashboard. |
| `JINGANG_HOST` | no | `127.0.0.1` | Bind address. Set `0.0.0.0` only behind something that terminates TLS and auth. |

Every component must run with only the `CLICKHOUSE_*` variables set, so a missing key degrades one step rather than blocking the demo. The token scoping rules come from the "Securing Jingang itself" section of the [PRD](../prd.md).
