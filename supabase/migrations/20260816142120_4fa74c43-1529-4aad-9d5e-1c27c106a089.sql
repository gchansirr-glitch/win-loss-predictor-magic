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