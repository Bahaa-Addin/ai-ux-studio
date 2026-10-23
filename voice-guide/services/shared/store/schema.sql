-- Voice guide platform schema (ADR-0010). Idempotent: safe to run on every start.

CREATE TABLE IF NOT EXISTS schema_info (
	id int PRIMARY KEY DEFAULT 1,
	version int NOT NULL,
	applied_at timestamptz NOT NULL DEFAULT now()
);

-- Immutable knowledge base versions; one active pointer per site.
CREATE TABLE IF NOT EXISTS kb_versions (
	site_id text NOT NULL,
	version_id text NOT NULL,
	hash text NOT NULL,
	manifest jsonb NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (site_id, version_id)
);
CREATE TABLE IF NOT EXISTS kb_active (
	site_id text PRIMARY KEY,
	version_id text NOT NULL,
	activated_at timestamptz NOT NULL DEFAULT now(),
	FOREIGN KEY (site_id, version_id) REFERENCES kb_versions (site_id, version_id)
);

-- Conversation state; shallow-merged with `state || patch`.
CREATE TABLE IF NOT EXISTS sessions (
	id text PRIMARY KEY,
	site_id text NOT NULL,
	state jsonb NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS handoff_tokens (
	token text PRIMARY KEY,
	session_id text NOT NULL,
	expires_at timestamptz NOT NULL
);

-- Turn traces for the X-ray panel and pilot analysis; purged after the retention period.
CREATE TABLE IF NOT EXISTS trace_events (
	seq bigserial PRIMARY KEY,
	session_id text NOT NULL,
	site_id text NOT NULL,
	turn_id text,
	trace_id text NOT NULL,
	name text NOT NULL,
	service text NOT NULL,
	at timestamptz NOT NULL,
	duration_ms double precision,
	attrs jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS trace_events_session_idx ON trace_events (session_id, seq);
CREATE INDEX IF NOT EXISTS trace_events_at_idx ON trace_events (at);

-- Page watch (ADR-0023).
CREATE TABLE IF NOT EXISTS push_subscriptions (
	id text PRIMARY KEY,
	site_id text NOT NULL,
	endpoint text NOT NULL UNIQUE,
	keys jsonb NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS watches (
	id text PRIMARY KEY,
	site_id text NOT NULL,
	subscription_id text NOT NULL REFERENCES push_subscriptions (id) ON DELETE CASCADE,
	session_id text,
	url text NOT NULL,
	page_id text,
	target jsonb NOT NULL,
	label text NOT NULL,
	lang text NOT NULL,
	status text NOT NULL DEFAULT 'active',
	last_hash text,
	last_text text,
	last_checked_at timestamptz,
	next_check_at timestamptz NOT NULL,
	lease_until timestamptz,
	interval_sec int NOT NULL,
	error_count int NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS watches_due_idx ON watches (next_check_at) WHERE status <> 'paused';
-- v2: watches can be delivered live to an open session when Web Push is unavailable.
ALTER TABLE watches ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'push';
ALTER TABLE watches ALTER COLUMN subscription_id DROP NOT NULL;
ALTER TABLE watches ADD COLUMN IF NOT EXISTS missing_count int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS watches_session_idx ON watches (session_id);

CREATE TABLE IF NOT EXISTS watch_changes (
	id text PRIMARY KEY,
	watch_id text NOT NULL REFERENCES watches (id) ON DELETE CASCADE,
	at timestamptz NOT NULL,
	before text NOT NULL,
	after text NOT NULL
);

-- Small key/value cache (vision descriptions by image hash, ...).
CREATE TABLE IF NOT EXISTS cache (
	ns text NOT NULL,
	key text NOT NULL,
	value jsonb NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (ns, key)
);

-- Counters for quotas (agent tokens per site per day, ...).
CREATE TABLE IF NOT EXISTS usage_counters (
	scope text PRIMARY KEY,
	total double precision NOT NULL DEFAULT 0,
	updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_info (id, version) VALUES (1, 2)
	ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = now();
