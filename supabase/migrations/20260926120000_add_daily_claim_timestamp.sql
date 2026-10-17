ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_free_claim_at timestamptz;
