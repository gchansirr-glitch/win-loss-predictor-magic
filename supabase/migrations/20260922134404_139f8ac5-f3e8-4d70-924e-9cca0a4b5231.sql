CREATE POLICY "Service role manages app users"
ON public.app_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role manages signal snapshots"
ON public.signal_snapshots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role manages result snapshots"
ON public.result_snapshots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);