-- Visitor statistics schema, idempotent. Mirrors drizzle/ with browser_id folded
-- into analytics_active so re-applying on every boot is safe.
CREATE TABLE IF NOT EXISTS analytics_daily (
 day TEXT NOT NULL,
 device TEXT NOT NULL,
 browser TEXT NOT NULL,
 views INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (day, device, browser)
);

CREATE TABLE IF NOT EXISTS analytics_active (
 id TEXT PRIMARY KEY NOT NULL,
 seen INTEGER NOT NULL,
 browser_id TEXT
);

CREATE INDEX IF NOT EXISTS analytics_active_seen ON analytics_active(seen);

CREATE TABLE IF NOT EXISTS analytics_browser_day (
 day TEXT NOT NULL,
 browser_id TEXT NOT NULL,
 seen INTEGER NOT NULL,
 PRIMARY KEY(day,browser_id)
);

CREATE TABLE IF NOT EXISTS analytics_metrics (
 day TEXT NOT NULL,
 device TEXT NOT NULL,
 browser TEXT NOT NULL,
 visits INTEGER NOT NULL DEFAULT 0,
 browsers INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day,device,browser)
);
