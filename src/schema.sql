CREATE TABLE IF NOT EXISTS advisories (
    id           String,
    aliases      Array(String),
    package      String,
    ecosystem    LowCardinality(String),
    ranges       String,
    details      String,
    refs         Array(String),
    fix_commits  Array(String),
    modified     DateTime64(3),
    detected_at  DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(modified)
ORDER BY id;

CREATE TABLE IF NOT EXISTS lockfiles (
    repo        String,
    commit_sha  String,
    package     String,
    version     String,
    ts          DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree
ORDER BY (repo, package, ts);

CREATE TABLE IF NOT EXISTS events (
    ts           DateTime64(3) DEFAULT now64(3),
    run_id       String,
    advisory_id  String,
    repo         String,
    step         LowCardinality(String),
    status       LowCardinality(String),
    latency_ms   UInt32,
    detail       String
) ENGINE = MergeTree
ORDER BY (run_id, ts);

CREATE TABLE IF NOT EXISTS guardrails (
    id              String,
    advisory_id     String,
    kind            LowCardinality(String),
    package         String,
    affected_range  String,
    rule_yaml       String,
    validated       UInt8,
    created_at      DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree
ORDER BY (package, created_at);
