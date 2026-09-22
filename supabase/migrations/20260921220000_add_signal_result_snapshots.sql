-- Keep every visitor on the same signal/result history.
-- Existing periods/results are never updated after their first insert.
CREATE TABLE public.signal_snapshots (
  period text PRIMARY KEY,
  source_direction text NOT NULL CHECK (source_direction IN ('BIG', 'SMALL')),
  website_direction text NOT NULL CHECK (website_direction IN ('BIG', 'SMALL')),
  level integer NOT NULL DEFAULT 1,
  source_text text NOT NULL,
  posted_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now()
);

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