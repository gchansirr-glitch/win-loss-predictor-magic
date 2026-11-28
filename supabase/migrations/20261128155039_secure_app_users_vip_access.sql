BEGIN;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS expires_at timestamptz GENERATED ALWAYS AS (vip_expires_at) STORED;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to app_users" ON public.app_users;
DROP POLICY IF EXISTS "Public read app users" ON public.app_users;
DROP POLICY IF EXISTS "Public insert app users" ON public.app_users;
DROP POLICY IF EXISTS "Public update app users" ON public.app_users;
DROP POLICY IF EXISTS "Service role manages app users" ON public.app_users;
CREATE POLICY "Service role manages app users"
  ON public.app_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.app_users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_users TO service_role;

COMMIT;
