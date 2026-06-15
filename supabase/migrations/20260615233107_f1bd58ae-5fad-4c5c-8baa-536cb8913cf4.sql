DROP POLICY IF EXISTS "feedback authed insert" ON storage.objects;
DROP POLICY IF EXISTS "feedback authed select" ON storage.objects;

CREATE POLICY "feedback authed insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback');

CREATE POLICY "feedback authed select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'feedback');