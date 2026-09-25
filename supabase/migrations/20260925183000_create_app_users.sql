CREATE TABLE IF NOT EXISTS public.app_users (
  telegram_id text PRIMARY KEY,
  username text,
  first_name text,
  photo_url text,
  vip_expires_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.app_users TO service_role;
GRANT ALL ON public.app_users TO anon;
GRANT ALL ON public.app_users TO authenticated;

DROP POLICY IF EXISTS "Allow all access to app_users" ON public.app_users;
CREATE POLICY "Allow all access to app_users" ON public.app_users
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
