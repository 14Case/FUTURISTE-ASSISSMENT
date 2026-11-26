-- =============================================================================
-- FUTURISTE ASSESSMENT — Sécurité : fonctions d'autorisation, RLS, audit,
-- verrouillage des sessions finalisées, RPC d'enregistrement idempotent.
-- =============================================================================
-- Principe : l'interface ne constitue JAMAIS une protection. Toutes les règles
-- d'accès sont appliquées ici (RLS + triggers) et vérifiées côté serveur.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fonctions d'autorisation (SECURITY DEFINER pour éviter la récursion RLS)
-- -----------------------------------------------------------------------------
create or replace function public.current_role_name()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

-- L'encadreur est-il affecté à la session (quelle que soit la portée) ?
create or replace function public.is_assigned_to_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_assignments sa
    join public.profiles p on p.id = sa.user_id and p.is_active
    join public.assessment_sessions s on s.id = sa.session_id and s.status <> 'archived'
    where sa.session_id = p_session_id and sa.user_id = auth.uid()
  );
$$;

-- Lecture d'un joueur dans une session : affecté à la session ET à la catégorie
-- du joueur dans cette session (ou affectation toutes catégories).
create or replace function public.can_read_session_player(p_session_id uuid, p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.session_players sp
    join public.session_assignments sa
      on sa.session_id = sp.session_id
     and sa.user_id = auth.uid()
     and (sa.category_id is null or sa.category_id = sp.category_id)
    join public.profiles p on p.id = sa.user_id and p.is_active
    join public.assessment_sessions s on s.id = sp.session_id and s.status <> 'archived'
    where sp.session_id = p_session_id and sp.player_id = p_player_id
  );
$$;

-- Lecture d'une fiche joueur : admin, ou joueur présent dans une session
-- non archivée à laquelle l'encadreur est affecté (portée catégorie respectée).
create or replace function public.can_read_player(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.session_players sp
    join public.session_assignments sa
      on sa.session_id = sp.session_id
     and sa.user_id = auth.uid()
     and (sa.category_id is null or sa.category_id = sp.category_id)
    join public.profiles p on p.id = sa.user_id and p.is_active
    join public.assessment_sessions s on s.id = sp.session_id and s.status <> 'archived'
    where sp.player_id = p_player_id
  );
$$;

-- Écriture d'une évaluation : admin, ou encadreur affecté à la session,
-- à l'atelier (ou tous) et à la catégorie du joueur (ou toutes),
-- uniquement lorsque la session est « en cours ».
create or replace function public.can_write_evaluation(p_session_id uuid, p_player_id uuid, p_test_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.session_players sp
    join public.session_assignments sa
      on sa.session_id = sp.session_id
     and sa.user_id = auth.uid()
     and (sa.category_id is null or sa.category_id = sp.category_id)
     and (sa.test_id is null or sa.test_id = p_test_id)
    join public.profiles p on p.id = sa.user_id and p.is_active
    join public.assessment_sessions s on s.id = sp.session_id and s.status = 'in_progress'
    join public.session_tests st on st.session_id = sp.session_id and st.test_id = p_test_id
    where sp.session_id = p_session_id and sp.player_id = p_player_id
      and sp.status <> 'withdrawn'
  );
$$;

-- -----------------------------------------------------------------------------
-- Protection des profils : seul un admin modifie les rôles / l'activation.
-- -----------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() est NULL pour le service_role (scripts serveur) : autorisé.
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
      raise exception 'Modification du rôle ou du statut réservée aux administrateurs.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  -- Un admin ne peut pas se retirer lui-même ses droits (évite le verrouillage).
  if auth.uid() = old.id and old.role = 'admin'
     and (new.role <> 'admin' or not new.is_active) then
    raise exception 'Vous ne pouvez pas retirer vos propres droits administrateur.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- -----------------------------------------------------------------------------
-- Journal d'audit générique
-- -----------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_entity_id text;
  v_session uuid;
  v_reason text;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_new := null; v_row := v_old;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_row := v_new;
    -- Ignore les mises à jour sans changement réel (hors updated_at).
    if (v_old - 'updated_at') = (v_new - 'updated_at') then
      return new;
    end if;
  else
    v_old := null; v_new := to_jsonb(new); v_row := v_new;
  end if;

  v_entity_id := coalesce(
    v_row ->> 'id',
    v_row ->> 'code',
    concat_ws(':', v_row ->> 'session_id', v_row ->> 'player_id', v_row ->> 'guardian_id',
              v_row ->> 'test_id', v_row ->> 'category_id')
  );
  if tg_table_name = 'assessment_sessions' then
    v_session := (v_row ->> 'id')::uuid;
  elsif v_row ? 'session_id' then
    v_session := (v_row ->> 'session_id')::uuid;
  end if;
  v_reason := nullif(current_setting('app.audit_reason', true), '');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, session_id, old_data, new_data, reason)
  values (auth.uid(), lower(tg_op), tg_table_name, v_entity_id, v_session, v_old, v_new, v_reason);

  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'club_settings', 'seasons', 'assessment_categories', 'assessment_domains',
    'players', 'guardians', 'player_guardians', 'assessment_tests', 'test_age_rules',
    'rubric_versions', 'assessment_sessions', 'session_categories', 'session_tests',
    'session_players', 'session_assignments', 'test_evaluations', 'assessment_scores',
    'assessment_reports'
  ]
  loop
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row_change()', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Verrouillage des sessions finalisées / archivées
-- Toute modification exige : rôle admin + motif (app.audit_reason) → audité.
-- -----------------------------------------------------------------------------
create or replace function public.session_is_locked(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select status in ('finalized', 'archived') from public.assessment_sessions where id = p_session_id),
    false
  );
$$;

create or replace function public.require_correction_rights(p_session_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.session_is_locked(p_session_id) then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Session finalisée : modification réservée aux administrateurs.'
        using errcode = 'insufficient_privilege';
    end if;
    if nullif(current_setting('app.audit_reason', true), '') is null then
      raise exception 'Session finalisée : un motif de correction est obligatoire.'
        using errcode = 'check_violation';
    end if;
  end if;
end;
$$;

create or replace function public.guard_session_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_correction_rights(coalesce(new.session_id, old.session_id));
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['session_players', 'session_tests', 'session_categories', 'test_evaluations', 'assessment_scores']
  loop
    execute format(
      'create trigger trg_lock_%1$s before insert or update or delete on public.%1$I
         for each row execute function public.guard_session_children()', t);
  end loop;
end;
$$;

create or replace function public.guard_attempts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
begin
  select session_id into v_session from public.test_evaluations
   where id = coalesce(new.evaluation_id, old.evaluation_id);
  if v_session is not null then
    perform public.require_correction_rights(v_session);
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_lock_test_attempts before insert or update or delete on public.test_attempts
  for each row execute function public.guard_attempts();

-- Transitions de statut d'une session.
create or replace function public.guard_session_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('app.audit_reason', true), '');
begin
  if old.status in ('finalized', 'archived') then
    -- Archivage d'une session finalisée : autorisé sans motif.
    if old.status = 'finalized' and new.status = 'archived'
       and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then
      return new;
    end if;
    if v_reason is null then
      raise exception 'Session finalisée : un motif est obligatoire pour toute modification.'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.status = 'finalized' and old.status <> 'finalized' then
    new.finalized_at := now();
    new.finalized_by := coalesce(auth.uid(), new.finalized_by);
  end if;
  return new;
end;
$$;
create trigger trg_sessions_guard before update on public.assessment_sessions
  for each row execute function public.guard_session_update();

-- Une évaluation validée ne peut être modifiée que par un admin ; seuls les
-- admins peuvent valider. Un encadreur ne peut pas usurper evaluated_by.
create or replace function public.guard_evaluation_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.validated_at is not null then
    raise exception 'Évaluation validée : seule une personne habilitée peut la corriger.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.validated_at is not null or new.validated_by is not null then
    raise exception 'La validation est réservée aux administrateurs.'
      using errcode = 'insufficient_privilege';
  end if;
  new.evaluated_by := auth.uid();
  return new;
end;
$$;
create trigger trg_evaluations_guard before insert or update on public.test_evaluations
  for each row execute function public.guard_evaluation_write();

-- Toute modification d'évaluation / de score rend le rapport existant obsolète.
create or replace function public.mark_reports_outdated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid := coalesce(new.session_id, old.session_id);
  v_player uuid := coalesce(new.player_id, old.player_id);
begin
  update public.assessment_reports
     set status = 'outdated'
   where session_id = v_session and player_id = v_player and status = 'generated';
  return coalesce(new, old);
end;
$$;
create trigger trg_evaluations_outdate_ins_del after insert or delete on public.test_evaluations
  for each row execute function public.mark_reports_outdated();
create trigger trg_evaluations_outdate_upd after update on public.test_evaluations
  for each row
  when (old.points is distinct from new.points
        or old.component_scores is distinct from new.component_scores
        or old.comment is distinct from new.comment
        or old.status is distinct from new.status)
  execute function public.mark_reports_outdated();
create trigger trg_scores_outdate after update on public.assessment_scores
  for each row
  when (old.details is distinct from new.details
        or old.analysis is distinct from new.analysis
        or old.coach_comment is distinct from new.coach_comment
        or old.total is distinct from new.total)
  execute function public.mark_reports_outdated();

-- -----------------------------------------------------------------------------
-- RPC : application idempotente d'une opération d'évaluation (saisie / sync)
-- SECURITY INVOKER : les politiques RLS de l'appelant s'appliquent.
-- -----------------------------------------------------------------------------
create or replace function public.apply_evaluation_op(
  p_op_id uuid,
  p_session_id uuid,
  p_player_id uuid,
  p_test_id uuid,
  p_base_version integer,
  p_supersedes uuid[],
  p_status public.evaluation_status,
  p_rubric_version_id uuid,
  p_points numeric,
  p_score_status public.score_status,
  p_component_scores jsonb,
  p_comment text,
  p_attempts jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing public.test_evaluations%rowtype;
  v_prev jsonb;
  v_eval_id uuid;
  v_version integer;
  v_result jsonb;
  v_attempt jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = 'insufficient_privilege';
  end if;

  -- 1. Idempotence : opération déjà traitée → renvoyer le résultat mémorisé.
  select result into v_prev from public.sync_operations where op_id = p_op_id;
  if found then
    return v_prev || jsonb_build_object('replayed', true);
  end if;

  if not public.can_write_evaluation(p_session_id, p_player_id, p_test_id) then
    raise exception 'Vous n''êtes pas autorisé à saisir ce résultat.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_reason is not null and length(trim(p_reason)) > 0 then
    perform set_config('app.audit_reason', p_reason, true);
  end if;

  -- 2. Verrou ligne + contrôle de version (concurrence optimiste).
  select * into v_existing from public.test_evaluations
   where session_id = p_session_id and player_id = p_player_id and test_id = p_test_id
   for update;

  if found and v_existing.version <> coalesce(p_base_version, 0)
     and not (v_existing.last_op_id is not null and v_existing.last_op_id = any(coalesce(p_supersedes, '{}'))) then
    v_result := jsonb_build_object(
      'status', 'conflict',
      'evaluation_id', v_existing.id,
      'server_version', v_existing.version,
      'server', jsonb_build_object(
        'status', v_existing.status,
        'points', v_existing.points,
        'score_status', v_existing.score_status,
        'component_scores', v_existing.component_scores,
        'comment', v_existing.comment,
        'evaluated_by', v_existing.evaluated_by,
        'updated_at', v_existing.updated_at
      )
    );
    insert into public.sync_operations (op_id, user_id, entity_type, entity_id, status, result)
    values (p_op_id, auth.uid(), 'test_evaluation', v_existing.id, 'conflict', v_result);
    return v_result;
  end if;

  -- 3. Écriture.
  if found then
    update public.test_evaluations set
      status = p_status,
      rubric_version_id = p_rubric_version_id,
      points = p_points,
      score_status = p_score_status,
      component_scores = coalesce(p_component_scores, '[]'::jsonb),
      comment = p_comment,
      evaluated_by = auth.uid(),
      evaluated_at = now(),
      version = v_existing.version + 1,
      last_op_id = p_op_id
    where id = v_existing.id
    returning id, version into v_eval_id, v_version;
  else
    insert into public.test_evaluations (
      session_id, player_id, test_id, rubric_version_id, status, points, score_status,
      component_scores, comment, evaluated_by, version, last_op_id
    ) values (
      p_session_id, p_player_id, p_test_id, p_rubric_version_id, p_status, p_points, p_score_status,
      coalesce(p_component_scores, '[]'::jsonb), p_comment, auth.uid(), 1, p_op_id
    )
    returning id, version into v_eval_id, v_version;
  end if;

  delete from public.test_attempts where evaluation_id = v_eval_id;
  for v_attempt in select * from jsonb_array_elements(coalesce(p_attempts, '[]'::jsonb))
  loop
    insert into public.test_attempts (evaluation_id, component_key, attempt_number, value, penalties, is_valid)
    values (
      v_eval_id,
      v_attempt ->> 'component_key',
      (v_attempt ->> 'attempt_number')::smallint,
      nullif(v_attempt ->> 'value', '')::numeric,
      coalesce((v_attempt ->> 'penalties')::smallint, 0),
      coalesce((v_attempt ->> 'is_valid')::boolean, true)
    );
  end loop;

  v_result := jsonb_build_object('status', 'applied', 'evaluation_id', v_eval_id, 'server_version', v_version);
  insert into public.sync_operations (op_id, user_id, entity_type, entity_id, status, result)
  values (p_op_id, auth.uid(), 'test_evaluation', v_eval_id, 'applied', v_result);
  return v_result;
end;
$$;

-- RPC admin : exécuter une mise à jour de statut de session avec motif audité.
create or replace function public.set_session_status(
  p_session_id uuid,
  p_status public.session_status,
  p_reason text default null
)
returns public.assessment_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.assessment_sessions;
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is not null and length(trim(p_reason)) > 0 then
    perform set_config('app.audit_reason', p_reason, true);
  end if;
  update public.assessment_sessions set status = p_status where id = p_session_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Session introuvable.' using errcode = 'no_data_found';
  end if;
  return v_row;
end;
$$;

-- RPC admin : enregistrer / valider un score consolidé avec motif optionnel.
create or replace function public.upsert_assessment_score(p_score jsonb, p_reason text default null)
returns public.assessment_scores
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.assessment_scores;
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is not null and length(trim(p_reason)) > 0 then
    perform set_config('app.audit_reason', p_reason, true);
  end if;
  insert into public.assessment_scores as s (
    session_id, player_id, category_id, athletic, technical, physical, game_intelligence,
    team_spirit, total, is_complete, details, rubric_version_ids, profile_labels, analysis,
    analysis_enabled, analysis_overridden, coach_comment, computed_at, validated_by, validated_at
  ) values (
    (p_score ->> 'session_id')::uuid,
    (p_score ->> 'player_id')::uuid,
    (p_score ->> 'category_id')::uuid,
    (p_score ->> 'athletic')::numeric,
    (p_score ->> 'technical')::numeric,
    (p_score ->> 'physical')::numeric,
    (p_score ->> 'game_intelligence')::numeric,
    (p_score ->> 'team_spirit')::numeric,
    (p_score ->> 'total')::numeric,
    coalesce((p_score ->> 'is_complete')::boolean, false),
    coalesce(p_score -> 'details', '{}'::jsonb),
    coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_score -> 'rubric_version_ids') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_score -> 'profile_labels') x), '{}'),
    coalesce(p_score -> 'analysis', '{}'::jsonb),
    coalesce((p_score ->> 'analysis_enabled')::boolean, true),
    coalesce((p_score ->> 'analysis_overridden')::boolean, false),
    p_score ->> 'coach_comment',
    now(),
    case when (p_score ->> 'validate')::boolean then auth.uid() else null end,
    case when (p_score ->> 'validate')::boolean then now() else null end
  )
  on conflict (session_id, player_id) do update set
    category_id = excluded.category_id,
    athletic = excluded.athletic,
    technical = excluded.technical,
    physical = excluded.physical,
    game_intelligence = excluded.game_intelligence,
    team_spirit = excluded.team_spirit,
    total = excluded.total,
    is_complete = excluded.is_complete,
    details = excluded.details,
    rubric_version_ids = excluded.rubric_version_ids,
    profile_labels = excluded.profile_labels,
    analysis = excluded.analysis,
    analysis_enabled = excluded.analysis_enabled,
    analysis_overridden = excluded.analysis_overridden,
    coach_comment = excluded.coach_comment,
    computed_at = now(),
    validated_by = coalesce(excluded.validated_by, s.validated_by),
    validated_at = coalesce(excluded.validated_at, s.validated_at)
  returning * into v_row;
  return v_row;
end;
$$;

-- RPC admin : valider (ou dévalider) les évaluations d'un joueur dans une session.
create or replace function public.validate_player_evaluations(
  p_session_id uuid,
  p_player_id uuid,
  p_validate boolean default true,
  p_reason text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is not null and length(trim(p_reason)) > 0 then
    perform set_config('app.audit_reason', p_reason, true);
  end if;
  update public.test_evaluations
     set validated_at = case when p_validate then now() else null end,
         validated_by = case when p_validate then auth.uid() else null end
   where session_id = p_session_id and player_id = p_player_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- RPC : statistiques du tableau de bord (agrégats uniquement, selon les droits).
create or replace function public.dashboard_counts()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'players', (select count(*) from public.players where status <> 'archived'),
    'sessions', (select count(*) from public.assessment_sessions),
    'sessions_in_progress', (select count(*) from public.assessment_sessions where status = 'in_progress'),
    'reports', (select count(*) from public.assessment_reports where status <> 'archived')
  );
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.club_settings enable row level security;
alter table public.seasons enable row level security;
alter table public.assessment_categories enable row level security;
alter table public.assessment_domains enable row level security;
alter table public.players enable row level security;
alter table public.guardians enable row level security;
alter table public.player_guardians enable row level security;
alter table public.assessment_tests enable row level security;
alter table public.test_age_rules enable row level security;
alter table public.rubric_versions enable row level security;
alter table public.assessment_sessions enable row level security;
alter table public.session_categories enable row level security;
alter table public.session_tests enable row level security;
alter table public.session_players enable row level security;
alter table public.session_assignments enable row level security;
alter table public.test_evaluations enable row level security;
alter table public.test_attempts enable row level security;
alter table public.assessment_scores enable row level security;
alter table public.assessment_reports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.sync_operations enable row level security;

-- Aucun accès anonyme : on révoque explicitement les droits du rôle anon.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated, service_role;

-- PROFILES -------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (public.is_active_user() and is_active));
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Insertion uniquement par le trigger handle_new_user (security definer).

-- CLUB SETTINGS / RÉFÉRENTIELS : lecture par tout utilisateur actif, écriture admin
create policy club_settings_select on public.club_settings for select to authenticated
  using (public.is_active_user());
create policy club_settings_write on public.club_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy seasons_select on public.seasons for select to authenticated using (public.is_active_user());
create policy seasons_write on public.seasons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy categories_select on public.assessment_categories for select to authenticated using (public.is_active_user());
create policy categories_write on public.assessment_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy domains_select on public.assessment_domains for select to authenticated using (public.is_active_user());
create policy domains_write on public.assessment_domains for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy tests_select on public.assessment_tests for select to authenticated using (public.is_active_user());
create policy tests_write on public.assessment_tests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy age_rules_select on public.test_age_rules for select to authenticated using (public.is_active_user());
create policy age_rules_write on public.test_age_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy rubrics_select on public.rubric_versions for select to authenticated using (public.is_active_user());
create policy rubrics_write on public.rubric_versions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- JOUEURS ----------------------------------------------------------------------
create policy players_select on public.players for select to authenticated
  using (public.can_read_player(id));
create policy players_insert on public.players for insert to authenticated
  with check (public.is_admin());
create policy players_update on public.players for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy players_delete on public.players for delete to authenticated
  using (public.is_admin());

-- RESPONSABLES LÉGAUX : données de contact → administrateurs uniquement
create policy guardians_admin on public.guardians for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy player_guardians_admin on public.player_guardians for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- SESSIONS -------------------------------------------------------------------
create policy sessions_select on public.assessment_sessions for select to authenticated
  using (public.is_admin() or public.is_assigned_to_session(id));
create policy sessions_write on public.assessment_sessions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy session_categories_select on public.session_categories for select to authenticated
  using (public.is_admin() or public.is_assigned_to_session(session_id));
create policy session_categories_write on public.session_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy session_tests_select on public.session_tests for select to authenticated
  using (public.is_admin() or public.is_assigned_to_session(session_id));
create policy session_tests_write on public.session_tests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy session_players_select on public.session_players for select to authenticated
  using (public.can_read_session_player(session_id, player_id));
create policy session_players_write on public.session_players for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy assignments_select on public.session_assignments for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
create policy assignments_write on public.session_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ÉVALUATIONS ------------------------------------------------------------------
create policy evaluations_select on public.test_evaluations for select to authenticated
  using (public.can_read_session_player(session_id, player_id));
create policy evaluations_insert on public.test_evaluations for insert to authenticated
  with check (public.can_write_evaluation(session_id, player_id, test_id));
create policy evaluations_update on public.test_evaluations for update to authenticated
  using (public.can_write_evaluation(session_id, player_id, test_id))
  with check (public.can_write_evaluation(session_id, player_id, test_id));
create policy evaluations_delete on public.test_evaluations for delete to authenticated
  using (public.is_admin());

create policy attempts_select on public.test_attempts for select to authenticated
  using (exists (
    select 1 from public.test_evaluations e
    where e.id = evaluation_id and public.can_read_session_player(e.session_id, e.player_id)));
create policy attempts_write on public.test_attempts for all to authenticated
  using (exists (
    select 1 from public.test_evaluations e
    where e.id = evaluation_id and public.can_write_evaluation(e.session_id, e.player_id, e.test_id)))
  with check (exists (
    select 1 from public.test_evaluations e
    where e.id = evaluation_id and public.can_write_evaluation(e.session_id, e.player_id, e.test_id)));

-- SCORES CONSOLIDÉS : lecture encadreur affecté, écriture admin --------------
create policy scores_select on public.assessment_scores for select to authenticated
  using (public.can_read_session_player(session_id, player_id));
create policy scores_write on public.assessment_scores for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- RAPPORTS : administrateurs uniquement --------------------------------------
create policy reports_admin on public.assessment_reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- AUDIT : lecture admin ; aucune écriture directe (triggers security definer) --
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_admin());

-- SYNC : chaque utilisateur ne voit / n'insère que ses propres opérations ----
create policy sync_select on public.sync_operations for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy sync_insert on public.sync_operations for insert to authenticated
  with check (user_id = auth.uid());

-- Droits de table explicites pour le rôle authenticated (RLS filtre ensuite).
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
