CREATE TABLE public.app_users (
  telegram_id text PRIMARY KEY,
  username text,
  first_name text,
  photo_url text,
  vip_expires_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_users TO service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.signal_snapshots (
  period text NOT NULL,
  source_direction text NOT NULL CHECK (source_direction IN ('BIG', 'SMALL')),
  website_direction text NOT NULL CHECK (website_direction IN ('BIG', 'SMALL')),
  level integer NOT NULL DEFAULT 1,
  source_text text NOT NULL,
  posted_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now(),
  signal_id text NOT NULL PRIMARY KEY
);
CREATE INDEX signal_snapshots_period_idx ON public.signal_snapshots (period);
GRANT ALL ON public.signal_snapshots TO service_role;
ALTER TABLE public.signal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.result_snapshots (
  issue_number text PRIMARY KEY,
  number text NOT NULL,
  color text NOT NULL DEFAULT '',
  block_timestamp bigint NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.result_snapshots TO service_role;
ALTER TABLE public.result_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages app users"
ON public.app_users FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages signal snapshots"
ON public.signal_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages result snapshots"
ON public.result_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);