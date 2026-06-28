INSERT INTO public.collections (slug, title, description, is_published, sort_order, filter)
VALUES (
  'essentials',
  'Tank Essentials',
  'Filter socks and other reef-keeping gear ready to ship from our Sandy showroom.',
  true,
  10,
  '{"sort":"newest"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  is_published = EXCLUDED.is_published,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  filter = EXCLUDED.filter,
  sort_order = EXCLUDED.sort_order;