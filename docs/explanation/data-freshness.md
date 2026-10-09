# Data freshness

Stored rows are records of what happened, never the input to a run. These rules keep a run acting on current data.

- **The trigger carries an advisory ID, not an advisory.** The loop re-fetches that record from OSV at run start. The `advisories` table is a log of what the watcher saw.
- **Dedupe on (id, modified), not id alone.** OSV edits advisories after publication; an edited record re-triggers a run. The `advisories` table uses `ReplacingMergeTree(modified)` for the same reason.
- **The match step reads `package-lock.json` from disk at run time.** The `lockfiles` table is a snapshot per scan, used for blast radius ("which repos") and the dashboard.
- **The `deps` graph is a dated snapshot.** The loader writes its finish time to `events` (step `deps_load`); the dashboard shows "graph as of <time>" rather than implying it is live.
- **Never read back a row you just wrote to drive logic.** ClickHouse Cloud is multi-replica. Pass data forward in the trigger payload; a read that must see the latest write sets `select_sequential_consistency=1`.

Status is read with `argMax(status, ts)` over `events` and never updated in place; the data model section of the [PRD](../prd.md) has the tables.
