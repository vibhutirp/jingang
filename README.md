# jingang

An autonomous agent that finds which new vulnerabilities actually reach your code, ships the fix, and guards the gate so they can't come back.

Jingang (金刚) watches public advisory feeds, confirms whether your code actually calls the vulnerable function, ships a verified upgrade as a pull request, and leaves two guardrails behind so the same bug can't come back.

> Dependabot tells you a library is old. Jingang tells you line 12 calls the vulnerable function with user input, ships the fix, and blocks anyone from writing line 12 again.

## Architecture

Two views of the same loop: the overview first, the detailed flow for building underneath. Dotted parts (Guild, blast radius) are Should items the loop works without.

### Overview

```mermaid
flowchart LR
    FEEDS[("Advisory feeds<br/>GitHub Advisories · OSV")]
    WATCH["Watcher + glue API + dashboard<br/>one process; Akash container is a Could"]
    CH[("ClickHouse Cloud<br/>advisories · lockfiles · events · guardrails<br/>deps graph - Should")]
    GUILD["Guild.ai - Should<br/>trigger, audit log, approval"]
    LOOP["Agent loop<br/>match → rule → gate → exposed? → upgrade<br/>→ verify → PR → guardrails<br/>blast radius - Should"]
    EXT[["Services the loop calls<br/>AkashML (model) · Semgrep (rules) · GitHub (PR)"]]
    CI["Demo repo CI<br/>guardrail check on every PR"]
    style GUILD stroke-dasharray: 5 5

    FEEDS -->|poll every 60 s| WATCH
    WATCH -->|new advisory| CH
    WATCH -->|POST /api/run| LOOP
    WATCH -.->|trigger| GUILD
    GUILD -.->|/api/run, /api/approve| WATCH
    LOOP <-->|queries + step log| CH
    LOOP <--> EXT
    EXT -->|fix PR adds .semgrep rules| CI
    CH -->|tiles| DASHNUM
    DASHNUM["Dashboard tiles, from events<br/>① Matched vs exposed vs suppressed<br/>② Detection to PR<br/>③ Blast radius, if built<br/>④ Rules validated, if built"]
    DASHNUM --> WATCH
```

### Detailed flow

```mermaid
flowchart TD
    subgraph FEEDS["Public advisory feeds"]
        GHSA[("GitHub Advisory API<br/>npm, authenticated")]
        OSV[("OSV.dev<br/>full record + references")]
    end

    W["Watcher<br/>polls every 60 s<br/>replay mode for demo"]
    API["Glue API<br/>/api/run /api/approve /api/stats<br/>shared-secret header"]
    GUILD["Guild.ai agent - Should<br/>trigger, audit log, approval"]
    BR["Blast radius - Should<br/>dependents in deps graph"]

    subgraph LOOP["Agent loop"]
        M["1 Match<br/>lockfile vs affected range<br/>semver checked in Node"]
        RULE["2 Get rule<br/>hand-written, or generated<br/>from advisory + fix diff"]
        GATE{"Fixture gate<br/>fires on positives<br/>silent on negatives<br/>max 3 retries"}
        EXP{"3 Exposed?<br/>rule hit AND<br/>version in range"}
        FIX["4 Upgrade<br/>latest safe version<br/>+ npm overrides"]
        VER{"5 Verified?<br/>version outside all ranges<br/>AND npm test passes"}
        PR["6 Open PR<br/>advisory link, call site,<br/>taint finding, diff"]
        GR["7 Store guardrails<br/>A: version policy<br/>B: taint rule"]
    end

    AKML[["AkashML<br/>rule generation, PR text"]]
    SG[["Semgrep CLI"]]
    GH[["GitHub<br/>jingang-demo-app"]]

    subgraph CH["ClickHouse Cloud"]
        ADV[(advisories)]
        LOCK[(lockfiles)]
        DEPS[(deps)]
        EV[(events, append-only)]
        GRT[(guardrails)]
    end

    DASH["Dashboard<br/>exposed vs suppressed<br/>detection to PR<br/>rules validated, blast radius"]

    GHSA --> W
    W --> OSV
    W --> ADV
    W -->|new advisory| API
    API -.->|if Guild works| GUILD
    GUILD -.-> API
    API -.-> BR
    BR -.-> DEPS
    API --> M
    M --> LOCK
    M -->|not in range| EV
    M -->|in range| RULE
    RULE --> AKML
    RULE --> GATE
    GATE -->|fail, retry| RULE
    GATE -->|3 fails: unconfirmed| EV
    GATE -->|pass| EXP
    EXP --> SG
    EXP -->|no hit: suppressed| EV
    EXP -->|exposed| FIX
    FIX --> VER
    VER -->|pass| PR
    VER -->|tests fail: label needs-human| PR
    PR --> AKML
    PR --> GH
    PR --> GR
    GR --> GRT
    GRT -.->|joins every future scan| EXP
    M -.->|log| EV
    EXP -.->|log| EV
    PR -.->|log| EV
    EV --> DASH
    GRT --> DASH
```

## Install

Needs Node 22+, the Semgrep CLI, a ClickHouse you can reach over HTTP, and a local clone of the demo app next to this repo.

```bash
git clone https://github.com/g7xu/jingang-demo-app ../jingang-demo-app && (cd ../jingang-demo-app && npm install)
npm install
cp .env.example .env
npm run schema
```

With only the `CLICKHOUSE_*` variables set, AkashML text is templated and the PR step writes its body to `out/` instead of opening a pull request. Add keys to `.env` to switch each step live; see [Configuration](docs/reference/configuration.md).

## Run

Replay one real advisory through the whole loop against the demo app:

```bash
npm run replay -- GHSA-fvqr-27wr-82fm
```

For a clean recording, wipe earlier runs first and replay the suppressed advisories before the exposed one, so no stored guardrail from a previous run colours the first tiles:

```bash
npm run schema -- --reset && npm run replay -- GHSA-35jh-r3h4-6jhm && npm run replay -- GHSA-p6mc-m468-83gw && npm run replay -- GHSA-fvqr-27wr-82fm
```

Start the dashboard and API on http://localhost:8787, then poll the GitHub Advisory API live:

```bash
npm run api
```

```bash
npm run watch
```

## Documentation

- [Proposal & architecture, v2.4](docs/prd.md): the current spec. Loop definitions, rules and fixtures, ClickHouse data model, scope and checkpoints, demo script.
- [Configuration](docs/reference/configuration.md): every environment variable, with what happens when it is empty.
- [Data freshness](docs/explanation/data-freshness.md): why a run re-fetches its inputs instead of reading stored rows.

## Status

Hackathon build, Oct 9, 2026. The Must path runs end to end in dry mode; Guild, the rule generator and blast radius are not built.

## License

[Apache-2.0](LICENSE)
