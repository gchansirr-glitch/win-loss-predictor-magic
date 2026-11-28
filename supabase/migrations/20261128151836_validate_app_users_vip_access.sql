SELECT column_name, data_type, is_nullable, column_default, is_generated
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_users'
ORDER BY ordinal_position;
