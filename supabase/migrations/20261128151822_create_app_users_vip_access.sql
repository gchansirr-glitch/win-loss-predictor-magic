BEGIN;

CREATE TABLE IF NOT EXISTS public.app_users (
  telegram_id text PRIMARY KEY,
  username text,
  first_name text,
  photo_url text,
  vip_expires_at timestamptz,
  expires_at timestamptz GENERATED ALWAYS AS (vip_expires_at) STORED,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_users TO service_role;

COMMIT;
