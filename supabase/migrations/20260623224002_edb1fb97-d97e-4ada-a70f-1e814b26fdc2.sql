
CREATE POLICY "public-media anon read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'public-media');

CREATE POLICY "public-media admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'public-media' AND public.is_admin_or_dev(auth.uid()));

CREATE POLICY "public-media admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'public-media' AND public.is_admin_or_dev(auth.uid()))
  WITH CHECK (bucket_id = 'public-media' AND public.is_admin_or_dev(auth.uid()));

CREATE POLICY "public-media admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'public-media' AND public.is_admin_or_dev(auth.uid()));
