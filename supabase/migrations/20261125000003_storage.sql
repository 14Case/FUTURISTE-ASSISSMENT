-- =============================================================================
-- FUTURISTE ASSESSMENT — Stockage (Supabase Storage)
-- =============================================================================
-- reports       : PRIVÉ — rapports PDF. Accès admin uniquement, via URL signées
--                 de courte durée générées côté serveur. Jamais de lien public.
-- player-photos : PRIVÉ — photos des joueurs (facultatives). URL signées.
-- branding      : PUBLIC en lecture — logo du club (non sensible).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('reports', 'reports', false, 10485760, array['application/pdf', 'application/zip']),
  ('player-photos', 'player-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp']),
  ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Rapports : administrateurs uniquement (lecture / écriture / suppression).
create policy reports_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'reports' and public.is_admin());
create policy reports_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and public.is_admin());
create policy reports_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'reports' and public.is_admin())
  with check (bucket_id = 'reports' and public.is_admin());
create policy reports_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reports' and public.is_admin());

-- Photos : écriture admin ; lecture si l'utilisateur peut lire le joueur.
-- Convention de chemin : <player_id>/<fichier>
create policy photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'player-photos'
    and public.can_read_player(((storage.foldername(name))[1])::uuid)
  );
create policy photos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and public.is_admin());
create policy photos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and public.is_admin())
  with check (bucket_id = 'player-photos' and public.is_admin());
create policy photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and public.is_admin());

-- Logo : écriture admin (lecture publique via le bucket public).
create policy branding_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_admin());
create policy branding_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_admin())
  with check (bucket_id = 'branding' and public.is_admin());
create policy branding_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_admin());
