# AGENTS.md

Instructions for AI coding agents working in this repository. Humans: the same rules apply, but [README.md](README.md) is the better starting point.

## What this is

Jingang watches npm advisory feeds, confirms with Semgrep whether the demo app actually calls the vulnerable function, opens a verified upgrade PR, and stores two guardrails so the bug cannot return. It is a one-day hackathon build (Oct 9, 2026) with a hard deadline of 16:30.

The spec is [docs/prd.md](docs/prd.md). Read its "The loop", "Rules", and "ClickHouse data model" sections before writing pipeline code. Do not restate the PRD in code comments or new docs; link to it.

## Vocabulary

Use these words exactly, in code, dashboard labels, and PR text. They are defined in the PRD's "The loop" section:

`Matched`, `Exposed`, `Suppressed`, `Unconfirmed`, `Verified`, `Detection to PR`.

"Exposed" means the rule fired AND the lockfile version is inside the affected range. A rule hit alone is not exposure.

## Constraints that are easy to violate

- **Build order is the Must list** in the PRD's "Scope and timeline". Finish an item before starting the next; a stop at any line must leave a working demo.
- **ClickHouse tables are append-only.** Insert events; read current status with `argMax(status, ts)`. Never `UPDATE`.
- **Semver logic runs in Node**, with the `semver` package, never in SQL.
- **Model output is untrusted.** Generated rules run only after the fixture gate. Facts in a PR body (versions, file, line, advisory link) come from data; AkashML writes only the explanation around them.
- **Never push to `main`.** Every change to the demo repo is a PR on a new branch.
- **Secrets live in environment variables only.** `.env` is ignored; `.env.example` lists names. Adding a variable means adding it to `.env.example` and to [docs/reference/configuration.md](docs/reference/configuration.md).
- **Every component must run with only `CLICKHOUSE_*` set.** A missing AkashML key means templated text; a missing GitHub token means the PR body is printed, not opened.
- **Re-fetch, don't read back.** See [docs/explanation/data-freshness.md](docs/explanation/data-freshness.md) before writing anything that reads a row it just wrote.

## Repository layout

| Path | Contents |
| --- | --- |
| `docs/prd.md` | The spec. Edit only when the team doc changes. |
| `docs/reference/` | Lookup tables (configuration). |
| `docs/explanation/` | Design rationale. |
| `rules/*.yaml` | Hand-written Semgrep rules and their fixtures, validated in the Semgrep Playground before commit. |
| `.env.example` | Variable names with placeholder values. |

Pipeline code has no home yet. When it does, add its directory here with one line.

## Writing docs and comments

- The README is a landing page, under 150 lines. Reference material goes in `docs/reference/`, rationale in `docs/explanation/`.
- A comment must say something the adjacent code does not: units, invariants, the case deliberately not handled. Delete any comment a stranger could write by reading the line beside it.
- No transition words in comments ("now", "previously", "this fixes"). The history belongs in commit messages.
