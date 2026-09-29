-- Defense in depth: the app connects as the schema owner (bypasses RLS). With RLS enabled and no
-- policies, any other role (e.g. Supabase anon/authenticated via the REST API) sees nothing.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'nova' LOOP
    EXECUTE format('ALTER TABLE nova.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
