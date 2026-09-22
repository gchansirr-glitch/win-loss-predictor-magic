ALTER TABLE public.signal_snapshots
  ADD COLUMN signal_id text;

UPDATE public.signal_snapshots
SET signal_id = period || ':' || COALESCE(posted_at::text, captured_at::text)
WHERE signal_id IS NULL;

ALTER TABLE public.signal_snapshots
  ALTER COLUMN signal_id SET NOT NULL;

ALTER TABLE public.signal_snapshots
  DROP CONSTRAINT signal_snapshots_pkey;

ALTER TABLE public.signal_snapshots
  ADD CONSTRAINT signal_snapshots_pkey PRIMARY KEY (signal_id);

CREATE INDEX signal_snapshots_period_idx
  ON public.signal_snapshots (period);

GRANT ALL ON public.signal_snapshots TO service_role;