-- Make VIP, Admin, Signals and History work with the public (anon / publishable)
-- key only. The app has no service_role secret, so every read and write now
-- happens as the `anon` role and is gated entirely by the RLS policies below.
--
-- SECURITY NOTE: because there is no trusted server secret, these policies allow
-- any holder of the publishable key to read and write these tables. That is an
-- accepted trade-off for a keyless client-side deployment. The in-app admin
-- allow-list only controls the UI, not the database.

-- Table-level privileges (RLS still gates individual rows).
GRANT SELECT, INSERT, UPDATE ON public.app_users TO anon, authenticated;
GRANT SELECT, INSERT ON public.signal_snapshots TO anon, authenticated;
GRANT SELECT, INSERT ON public.result_snapshots TO anon, authenticated;

-- ---------- signal_snapshots: public read, public insert (immutable) ----------
DROP POLICY IF EXISTS "Public read signal snapshots" ON public.signal_snapshots;
CREATE POLICY "Public read signal snapshots"
  ON public.signal_snapshots FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public insert signal snapshots" ON public.signal_snapshots;
CREATE POLICY "Public insert signal snapshots"
  ON public.signal_snapshots FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ---------- result_snapshots: public read, public insert (immutable) ----------
DROP POLICY IF EXISTS "Public read result snapshots" ON public.result_snapshots;
CREATE POLICY "Public read result snapshots"
  ON public.result_snapshots FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public insert result snapshots" ON public.result_snapshots;
CREATE POLICY "Public insert result snapshots"
  ON public.result_snapshots FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ---------- app_users: public read + upsert (insert + update) ----------
DROP POLICY IF EXISTS "Public read app users" ON public.app_users;
CREATE POLICY "Public read app users"
  ON public.app_users FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public insert app users" ON public.app_users;
CREATE POLICY "Public insert app users"
  ON public.app_users FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public update app users" ON public.app_users;
CREATE POLICY "Public update app users"
  ON public.app_users FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
