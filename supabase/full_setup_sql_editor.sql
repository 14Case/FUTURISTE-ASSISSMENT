-- =============================================================================
-- FUTURISTE ASSESSMENT — Schéma principal
-- FUTURISTE ACADÉMIE FC
-- =============================================================================
-- Conventions :
--   * Identifiants UUID stables (intégration future FUTURISTE FC MANAGEMENT).
--   * Horodatages timestamptz (UTC).
--   * Les données de démonstration portent is_demo = true et peuvent être purgées.
--   * Les évaluations ne sont jamais écrasées entre sessions : une évaluation
--     appartient à une session ; l'historique est conservé par session.
-- =============================================================================

-- Note : gen_random_uuid() est natif dans PostgreSQL 13+ (Supabase & PGlite).

-- -----------------------------------------------------------------------------
-- Types énumérés
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'coach');
create type public.player_status as enum ('active', 'inactive', 'archived');
create type public.session_status as enum ('draft', 'in_progress', 'to_validate', 'finalized', 'archived');
create type public.domain_code as enum ('athletic', 'technical', 'physical', 'game_intelligence', 'team_spirit');
create type public.rubric_status as enum ('draft', 'active', 'archived');
create type public.evaluation_status as enum ('pending', 'in_progress', 'completed', 'absent', 'exempt');
create type public.score_status as enum ('complete', 'incomplete', 'unconfigured', 'invalid', 'not_applicable');
create type public.session_player_status as enum ('registered', 'present', 'absent', 'withdrawn');
create type public.report_status as enum ('generated', 'outdated', 'archived');

-- -----------------------------------------------------------------------------
-- Fonction utilitaire : mise à jour automatique de updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profils utilisateurs (1-1 avec auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  role public.app_role not null default 'coach',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription d'un utilisateur Auth.
-- Le rôle par défaut est TOUJOURS 'coach' : le rôle admin ne peut être attribué
-- que par un administrateur existant (ou par le script d'amorçage côté serveur).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Paramètres du club (ligne unique)
-- -----------------------------------------------------------------------------
create table public.club_settings (
  id smallint primary key default 1 check (id = 1),
  club_name text not null default 'FUTURISTE ACADÉMIE FC',
  tagline text not null default 'Former, développer et révéler les talents.',
  logo_path text,
  primary_color text not null default '#5B21B6',
  secondary_color text not null default '#7DD3FC',
  current_season_id uuid,
  sex_field_enabled boolean not null default true,
  analysis_enabled boolean not null default true,
  parent_message_template text not null default '',
  report_footer text not null default 'Document confidentiel destiné au responsable légal du joueur.',
  report_signatory text not null default '',
  sync_settings jsonb not null default '{"auto_sync": true, "retry_interval_seconds": 30}'::jsonb,
  units jsonb not null default '{"time": "s", "distance": "m"}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create trigger trg_club_settings_updated before update on public.club_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Saisons
-- -----------------------------------------------------------------------------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (label ~ '^\d{4}[–-]\d{4}$'),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date > start_date)
);

alter table public.club_settings
  add constraint club_settings_current_season_fk
  foreign key (current_season_id) references public.seasons (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Catégories d'âge (configurables)
-- -----------------------------------------------------------------------------
create table public.assessment_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  min_age smallint not null check (min_age between 3 and 25),
  max_age smallint not null check (max_age between 3 and 25),
  sort_order smallint not null default 0,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_age >= min_age)
);
create trigger trg_categories_updated before update on public.assessment_categories
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Domaines d'évaluation (maxima configurables)
-- -----------------------------------------------------------------------------
create table public.assessment_domains (
  code public.domain_code primary key,
  label text not null,
  max_points numeric(6,2) not null check (max_points > 0),
  sort_order smallint not null default 0,
  description text
);

-- -----------------------------------------------------------------------------
-- Joueurs
-- -----------------------------------------------------------------------------
create sequence public.player_number_seq start 1;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  player_number text not null unique
    default ('FA-' || lpad(nextval('public.player_number_seq')::text, 4, '0')),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  birth_date date not null check (birth_date > date '1990-01-01'),
  sex text check (sex in ('M', 'F')),
  photo_path text,
  category_id uuid references public.assessment_categories (id) on delete set null,
  preferred_position text,
  dominant_foot text check (dominant_foot in ('right', 'left', 'both')),
  previous_club text,
  academy_entry_year smallint check (academy_entry_year between 2000 and 2100),
  notes text,
  status public.player_status not null default 'active',
  -- Information / consentement du responsable légal (RGPD / loi camerounaise 2010/012)
  consent_obtained boolean not null default false,
  consent_date date,
  consent_note text,
  is_demo boolean not null default false,
  external_ref text unique, -- identifiant dans FUTURISTE FC MANAGEMENT (intégration future)
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_players_updated before update on public.players
  for each row execute function public.set_updated_at();
create index players_category_idx on public.players (category_id);
create index players_status_idx on public.players (status);
create index players_identity_idx on public.players (lower(last_name), lower(first_name), birth_date);
create index players_demo_idx on public.players (is_demo) where is_demo;

-- -----------------------------------------------------------------------------
-- Responsables légaux (n-n avec les joueurs)
-- -----------------------------------------------------------------------------
create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  first_name text,
  phone text not null check (length(trim(phone)) between 6 and 25),
  whatsapp text,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_guardians_updated before update on public.guardians
  for each row execute function public.set_updated_at();
create index guardians_phone_idx on public.guardians (phone);

create table public.player_guardians (
  player_id uuid not null references public.players (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  relationship text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (player_id, guardian_id)
);
create index player_guardians_guardian_idx on public.player_guardians (guardian_id);

-- -----------------------------------------------------------------------------
-- Tests (ateliers) et protocoles par catégorie
-- -----------------------------------------------------------------------------
create table public.assessment_tests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]{0,9}$'),
  name text not null,
  domain public.domain_code not null references public.assessment_domains (code),
  max_points numeric(6,2) not null check (max_points > 0),
  description text,
  instructions text,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tests_updated before update on public.assessment_tests
  for each row execute function public.set_updated_at();

-- Protocole d'un test pour une catégorie : distances, cônes, durées, formats…
create table public.test_age_rules (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.assessment_tests (id) on delete cascade,
  category_id uuid not null references public.assessment_categories (id) on delete cascade,
  protocol jsonb not null default '{}'::jsonb,
  protocol_text text,
  updated_at timestamptz not null default now(),
  unique (test_id, category_id)
);
create trigger trg_age_rules_updated before update on public.test_age_rules
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Barèmes versionnés
-- config : voir src/lib/scoring/types.ts (RubricConfig) — validé côté serveur.
-- Une version active au plus par (test, catégorie, sexe).
-- Une version non brouillon est immuable (voir trigger).
-- -----------------------------------------------------------------------------
create table public.rubric_versions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.assessment_tests (id) on delete cascade,
  category_id uuid references public.assessment_categories (id) on delete cascade,
  sex text check (sex in ('M', 'F')),
  version integer not null check (version > 0),
  status public.rubric_status not null default 'draft',
  effective_from date not null default current_date,
  config jsonb not null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  archived_at timestamptz,
  constraint rubric_versions_unique_version unique nulls not distinct (test_id, category_id, sex, version)
);
create unique index rubric_versions_one_active
  on public.rubric_versions (test_id, category_id, sex) nulls not distinct
  where status = 'active';
create index rubric_versions_test_idx on public.rubric_versions (test_id);

create or replace function public.protect_rubric_versions()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' then
    if new.config is distinct from old.config
       or new.test_id is distinct from old.test_id
       or new.category_id is distinct from old.category_id
       or new.sex is distinct from old.sex
       or new.version is distinct from old.version then
      raise exception 'Un barème publié est immuable : créez une nouvelle version.'
        using errcode = 'check_violation';
    end if;
    if old.status = 'archived' and new.status <> 'archived' then
      raise exception 'Un barème archivé ne peut pas être réactivé : dupliquez-le.'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.status = 'active' and old.status <> 'active' then
    new.activated_at = now();
  end if;
  if new.status = 'archived' and old.status <> 'archived' then
    new.archived_at = now();
  end if;
  return new;
end;
$$;
create trigger trg_rubric_protect before update on public.rubric_versions
  for each row execute function public.protect_rubric_versions();

-- -----------------------------------------------------------------------------
-- Sessions d'évaluation
-- -----------------------------------------------------------------------------
create table public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 3 and 160),
  description text,
  session_date date not null,
  start_time time,
  location text,
  season_id uuid not null references public.seasons (id),
  status public.session_status not null default 'draft',
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  finalized_by uuid references public.profiles (id) on delete set null
);
create trigger trg_sessions_updated before update on public.assessment_sessions
  for each row execute function public.set_updated_at();
create index sessions_status_idx on public.assessment_sessions (status);
create index sessions_date_idx on public.assessment_sessions (session_date desc);

create table public.session_categories (
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  category_id uuid not null references public.assessment_categories (id) on delete restrict,
  primary key (session_id, category_id)
);

create table public.session_tests (
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  test_id uuid not null references public.assessment_tests (id) on delete restrict,
  sort_order smallint not null default 0,
  primary key (session_id, test_id)
);

-- Joueurs inscrits à une session. category_id = catégorie AU MOMENT du test
-- (instantané, indépendant d'un changement ultérieur de catégorie du joueur).
create table public.session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  category_id uuid not null references public.assessment_categories (id) on delete restrict,
  bib_number text,
  status public.session_player_status not null default 'registered',
  added_at timestamptz not null default now(),
  unique (session_id, player_id)
);
create index session_players_player_idx on public.session_players (player_id);
create index session_players_session_cat_idx on public.session_players (session_id, category_id);

-- Affectation des encadreurs. test_id / category_id NULL = tous les ateliers / toutes catégories.
create table public.session_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  test_id uuid references public.assessment_tests (id) on delete cascade,
  category_id uuid references public.assessment_categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint session_assignments_unique unique nulls not distinct (session_id, user_id, test_id, category_id)
);
create index session_assignments_user_idx on public.session_assignments (user_id, session_id);

-- -----------------------------------------------------------------------------
-- Évaluations (une par joueur × test × session) et tentatives brutes
-- -----------------------------------------------------------------------------
create table public.test_evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  test_id uuid not null references public.assessment_tests (id) on delete restrict,
  rubric_version_id uuid references public.rubric_versions (id) on delete restrict,
  status public.evaluation_status not null default 'in_progress',
  points numeric(6,2),
  score_status public.score_status not null default 'incomplete',
  component_scores jsonb not null default '[]'::jsonb,
  comment text check (comment is null or length(comment) <= 2000),
  evaluated_by uuid references public.profiles (id) on delete set null,
  evaluated_at timestamptz not null default now(),
  validated_by uuid references public.profiles (id) on delete set null,
  validated_at timestamptz,
  version integer not null default 1,
  last_op_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, player_id, test_id),
  check (points is null or points >= 0)
);
create trigger trg_evaluations_updated before update on public.test_evaluations
  for each row execute function public.set_updated_at();
create index evaluations_player_idx on public.test_evaluations (player_id);
create index evaluations_session_test_idx on public.test_evaluations (session_id, test_id);

create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.test_evaluations (id) on delete cascade,
  component_key text not null check (component_key ~ '^[a-z0-9_]{1,40}$'),
  attempt_number smallint not null check (attempt_number between 1 and 20),
  value numeric(10,3),
  penalties smallint not null default 0 check (penalties between 0 and 50),
  is_valid boolean not null default true,
  created_at timestamptz not null default now(),
  unique (evaluation_id, component_key, attempt_number)
);

-- -----------------------------------------------------------------------------
-- Scores consolidés (instantané validé par un responsable)
-- -----------------------------------------------------------------------------
create table public.assessment_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  category_id uuid not null references public.assessment_categories (id),
  athletic numeric(6,2),
  technical numeric(6,2),
  physical numeric(6,2),
  game_intelligence numeric(6,2),
  team_spirit numeric(6,2),
  total numeric(6,2),
  is_complete boolean not null default false,
  details jsonb not null default '{}'::jsonb,          -- détail domaines/tests
  rubric_version_ids uuid[] not null default '{}',
  profile_labels text[] not null default '{}',
  analysis jsonb not null default '{}'::jsonb,         -- points forts, axes, recommandations, synthèse
  analysis_enabled boolean not null default true,
  analysis_overridden boolean not null default false,
  coach_comment text check (coach_comment is null or length(coach_comment) <= 3000),
  computed_at timestamptz not null default now(),
  validated_by uuid references public.profiles (id) on delete set null,
  validated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (session_id, player_id)
);
create trigger trg_scores_updated before update on public.assessment_scores
  for each row execute function public.set_updated_at();
create index scores_player_idx on public.assessment_scores (player_id);

-- -----------------------------------------------------------------------------
-- Rapports PDF (stockage privé Supabase Storage, bucket "reports")
-- -----------------------------------------------------------------------------
create table public.assessment_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  score_id uuid references public.assessment_scores (id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  version integer not null default 1,
  status public.report_status not null default 'generated',
  file_size integer,
  checksum text,
  page_count smallint,
  generated_by uuid references public.profiles (id) on delete set null,
  generated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (session_id, player_id, version)
);
create index reports_session_idx on public.assessment_reports (session_id, status);
create index reports_player_idx on public.assessment_reports (player_id);

-- -----------------------------------------------------------------------------
-- Journal d'audit (ajout seul)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  session_id uuid,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_session_idx on public.audit_logs (session_id);

-- -----------------------------------------------------------------------------
-- Opérations de synchronisation hors ligne (idempotence)
-- -----------------------------------------------------------------------------
create table public.sync_operations (
  op_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  status text not null check (status in ('applied', 'conflict', 'rejected')),
  result jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
create index sync_operations_user_idx on public.sync_operations (user_id, received_at desc);
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
-- =============================================================================
-- FUTURISTE ASSESSMENT — Données de référence (GÉNÉRÉ — ne pas éditer à la main)
-- Source : src/lib/scoring/default-catalog.ts — commande : npm run db:generate-seed
-- =============================================================================
-- Contient uniquement de la configuration réelle fournie par le club :
-- domaines, catégories, saison, tests, protocoles, barèmes initiaux (v1) et la
-- session du 28/11/2026. AUCUN joueur, AUCUN score.
-- Les mesures chronométrées / distances / volumes n'ont PAS de seuils :
-- ils doivent être configurés par l'administrateur (module Barèmes).
-- =============================================================================

insert into public.assessment_domains (code, label, max_points, sort_order, description) values
  ('athletic', 'Compétences athlétiques', 40, 1, 'Vitesse, agilité, coordination, réaction, explosivité.'),
  ('technical', 'Compétences techniques', 30, 2, 'Passes, contrôle orienté, conduite et dribble, finition.'),
  ('physical', 'Capacités physiques', 10, 3, 'Endurance à effort contrôlé.'),
  ('game_intelligence', 'Intelligence de jeu', 15, 4, 'Compréhension et lecture du jeu en mini-matchs.'),
  ('team_spirit', 'Esprit d''équipe', 5, 5, 'Attitude collective observée durant l''ensemble des tests.')
on conflict (code) do nothing;

insert into public.assessment_categories (code, label, min_age, max_age, sort_order) values
  ('U6-U9', 'U6–U9', 6, 9, 1),
  ('U10-U13', 'U10–U13', 10, 13, 2),
  ('U14-U16', 'U14–U16', 14, 16, 3)
on conflict (code) do nothing;

insert into public.seasons (label, start_date, end_date)
values ('2026–2027', '2026-09-01', '2027-08-31')
on conflict (label) do nothing;

insert into public.club_settings (id, parent_message_template, current_season_id)
values (1, 'Bonjour,

FUTURISTE ACADÉMIE FC vous transmet le rapport individuel d''évaluation de votre enfant, réalisé lors du Test d''Aptitude de la saison {saison}.

Ce rapport présente ses résultats athlétiques, techniques, physiques, de compréhension du jeu et d''esprit d''équipe, ainsi que les principaux axes de progression identifiés.

Nous vous remercions pour votre confiance et votre engagement dans le développement sportif de votre enfant.

FUTURISTE ACADÉMIE FC
Former, développer et révéler les talents.', (select id from public.seasons where label = '2026–2027'))
on conflict (id) do nothing;

insert into public.assessment_tests (code, name, domain, max_points, description, instructions, sort_order) values
  ('A1', 'Sprint', 'athletic', 10, 'Vitesse de course linéaire sur distance adaptée à l''âge.', 'Départ arrêté derrière la ligne, sans élan. Chronométrer du premier mouvement au franchissement de la ligne d''arrivée. 2 tentatives, récupération complète entre les essais. Le meilleur temps est retenu.', 1),
  ('A2', 'Agilité', 'athletic', 10, 'Parcours en zigzag entre cônes : vitesse et changements de direction.', 'Parcours en zigzag. 2 tentatives, meilleur temps retenu. Observer la qualité des appuis et des changements de direction (abaissement du centre de gravité, orientation du corps, relance).', 2),
  ('A3', 'Coordination', 'athletic', 8, 'Échelle de coordination : vitesse d''exécution, précision et fluidité.', 'Exercice d''échelle de coordination défini pour la session (pas simples, pas latéraux, entrées-sorties…). Chronométrer l''exécution et observer la précision des appuis (aucun barreau touché), la fluidité et la coordination bras-jambes.', 3),
  ('A4', 'Réaction', 'athletic', 6, 'Réaction à un signal et déplacement vers la direction indiquée.', 'Au signal (visuel ou sonore), le joueur se déplace vers la direction indiquée. 4 essais. Noter la rapidité de réaction et compter le nombre d''essais où la bonne direction est prise et le déplacement correctement réalisé.', 4),
  ('A5', 'Explosivité', 'athletic', 6, 'Saut en longueur sans élan.', 'Pieds joints derrière la ligne, sans élan. Mesurer du bord de la ligne au talon le plus proche à la réception. 2 tentatives, meilleure distance retenue. Observer l''impulsion des bras, l''extension et la stabilité de la réception.', 5),
  ('T1', 'Passes', 'technical', 8, 'Précision et qualité de transmission sur 10 passes.', '10 passes vers une cible (porte de cônes ou partenaire), 5 par pied lorsque le niveau le permet. Compter les passes réussies dans la cible. Observer la surface de contact, le dosage et la tension de la passe.', 6),
  ('T2', 'Contrôle orienté', 'technical', 6, 'Qualité du contrôle et orientation de la première touche.', '8 répétitions : réception d''un ballon transmis et contrôle orienté vers une porte indiquée. Observer la qualité de l''amorti et l''orientation / la vitesse de la première touche.', 7),
  ('T3', 'Conduite et dribble', 'technical', 8, 'Slalom balle au pied : vitesse et maîtrise.', 'Slalom entre les cônes balle au pied, aller-retour selon le protocole. 2 tentatives, meilleur temps retenu. Observer la maîtrise, la précision, l''équilibre et l''utilisation des deux pieds.', 8),
  ('T4', 'Finition', 'technical', 8, 'Précision et qualité de frappe sur 8 tirs.', '8 tirs vers le but (zones cibles selon le protocole de la session). Compter les tirs cadrés dans la cible. Observer la qualité de frappe : pied d''appui, surface de contact, équilibre et puissance contrôlée.', 9),
  ('P1', 'Endurance', 'physical', 10, 'Navettes à effort contrôlé sur durée adaptée à l''âge.', 'Allers-retours entre deux lignes à allure contrôlée pendant la durée prévue. Compter le nombre de longueurs (navettes) réalisées. Observer le maintien du rythme et la qualité de déplacement. Arrêter immédiatement en cas de signe de malaise.', 10),
  ('I1', 'Mini-matchs', 'game_intelligence', 15, 'Observation de la compréhension du jeu en situation réduite.', 'Mini-matchs au format adapté. Chaque encadreur observe un groupe restreint de joueurs. Noter chaque critère selon la grille et ajouter un commentaire factuel.', 11),
  ('E1', 'Esprit d''équipe', 'team_spirit', 5, 'Observation durant l''ensemble des tests, en particulier les mini-matchs. Ne pas confondre communication verbale et esprit d''équipe.', 'Évaluer des comportements observés, pas la personnalité ni l''aisance verbale. Un joueur discret peut faire preuve d''un excellent esprit d''équipe.', 12)
on conflict (code) do nothing;

insert into public.test_age_rules (test_id, category_id, protocol, protocol_text)
select t.id, c.id, v.protocol, v.protocol_text
from (values
  ('A1', 'U6-U9', $json${"distance_m":10,"attempts":2}$json$::jsonb, '10 m — 2 tentatives — meilleur temps'),
  ('A1', 'U10-U13', $json${"distance_m":20,"attempts":2}$json$::jsonb, '20 m — 2 tentatives — meilleur temps'),
  ('A1', 'U14-U16', $json${"distance_m":30,"attempts":2}$json$::jsonb, '30 m — 2 tentatives — meilleur temps'),
  ('A2', 'U6-U9', $json${"cones":4,"spacing_m":"3–4","attempts":2}$json$::jsonb, '4 cônes — 3 à 4 m entre les cônes — 2 tentatives'),
  ('A2', 'U10-U13', $json${"cones":5,"spacing_m":5,"attempts":2}$json$::jsonb, '5 cônes — 5 m — 2 tentatives'),
  ('A2', 'U14-U16', $json${"cones":5,"spacing_m":5,"attempts":2}$json$::jsonb, '5 cônes — 5 m — 2 tentatives'),
  ('A3', 'U6-U9', $json${"exercise":"Échelle — 1 appui par case","attempts":2}$json$::jsonb, 'Échelle de coordination — exercice simple — 2 tentatives'),
  ('A3', 'U10-U13', $json${"exercise":"Échelle — 2 appuis par case + latéral","attempts":2}$json$::jsonb, 'Échelle de coordination — exercice intermédiaire — 2 tentatives'),
  ('A3', 'U14-U16', $json${"exercise":"Échelle — entrées/sorties","attempts":2}$json$::jsonb, 'Échelle de coordination — exercice avancé — 2 tentatives'),
  ('A4', 'U6-U9', $json${"distance_m":3,"trials":4}$json$::jsonb, 'Déplacement de 3 m — 4 essais'),
  ('A4', 'U10-U13', $json${"distance_m":5,"trials":4}$json$::jsonb, 'Déplacement de 5 m — 4 essais'),
  ('A4', 'U14-U16', $json${"distance_m":"5–7","trials":4}$json$::jsonb, 'Déplacement de 5 à 7 m — 4 essais'),
  ('A5', 'U6-U9', $json${"attempts":2}$json$::jsonb, 'Saut sans élan — 2 tentatives — meilleure distance'),
  ('A5', 'U10-U13', $json${"attempts":2}$json$::jsonb, 'Saut sans élan — 2 tentatives — meilleure distance'),
  ('A5', 'U14-U16', $json${"attempts":2}$json$::jsonb, 'Saut sans élan — 2 tentatives — meilleure distance'),
  ('T1', 'U6-U9', $json${"passes":10,"distance_m":"4–5","per_foot":"si adapté"}$json$::jsonb, '10 passes — 4 à 5 m — 5 par pied si adapté'),
  ('T1', 'U10-U13', $json${"passes":10,"distance_m":"6–8","per_foot":5}$json$::jsonb, '10 passes — 6 à 8 m — 5 par pied'),
  ('T1', 'U14-U16', $json${"passes":10,"distance_m":"8–10","per_foot":5}$json$::jsonb, '10 passes — 8 à 10 m — 5 par pied'),
  ('T2', 'U6-U9', $json${"repetitions":8}$json$::jsonb, '8 répétitions — ballon à la main ou au sol'),
  ('T2', 'U10-U13', $json${"repetitions":8}$json$::jsonb, '8 répétitions — passe au sol'),
  ('T2', 'U14-U16', $json${"repetitions":8}$json$::jsonb, '8 répétitions — passe au sol et aérienne'),
  ('T3', 'U6-U9', $json${"cones":5,"spacing_m":2.5,"attempts":2}$json$::jsonb, '5 cônes — 2,5 m — 2 tentatives'),
  ('T3', 'U10-U13', $json${"cones":6,"spacing_m":3,"attempts":2}$json$::jsonb, '6 cônes — 3 m — 2 tentatives'),
  ('T3', 'U14-U16', $json${"cones":6,"spacing_m":3,"attempts":2}$json$::jsonb, '6 cônes — 3 m — 2 tentatives'),
  ('T4', 'U6-U9', $json${"shots":8,"distance_m":"5–7"}$json$::jsonb, '8 tirs — 5 à 7 m'),
  ('T4', 'U10-U13', $json${"shots":8,"distance_m":"8–10"}$json$::jsonb, '8 tirs — 8 à 10 m'),
  ('T4', 'U14-U16', $json${"shots":8,"distance_m":"10–14"}$json$::jsonb, '8 tirs — 10 à 14 m'),
  ('P1', 'U6-U9', $json${"line_distance_m":10,"duration_min":3}$json$::jsonb, '10 m entre les lignes — 3 minutes'),
  ('P1', 'U10-U13', $json${"line_distance_m":15,"duration_min":4}$json$::jsonb, '15 m entre les lignes — 4 minutes'),
  ('P1', 'U14-U16', $json${"line_distance_m":20,"duration_min":5}$json$::jsonb, '20 m entre les lignes — 5 minutes'),
  ('I1', 'U6-U9', $json${"format":"3c3 ou 4c4","matches":2,"duration_min":5}$json$::jsonb, '3 contre 3 ou 4 contre 4 — 2 matchs de 5 min'),
  ('I1', 'U10-U13', $json${"format":"4c4 ou 5c5","matches":2,"duration_min":7}$json$::jsonb, '4 contre 4 ou 5 contre 5 — 2 matchs de 7 min'),
  ('I1', 'U14-U16', $json${"format":"5c5 ou 6c6","matches":2,"duration_min":8}$json$::jsonb, '5 contre 5 ou 6 contre 6 — 2 matchs de 8 min'),
  ('E1', 'U6-U9', $json${"observation":"Ensemble des ateliers + mini-matchs"}$json$::jsonb, 'Observation continue'),
  ('E1', 'U10-U13', $json${"observation":"Ensemble des ateliers + mini-matchs"}$json$::jsonb, 'Observation continue'),
  ('E1', 'U14-U16', $json${"observation":"Ensemble des ateliers + mini-matchs"}$json$::jsonb, 'Observation continue')
) as v(test_code, category_code, protocol, protocol_text)
join public.assessment_tests t on t.code = v.test_code
join public.assessment_categories c on c.code = v.category_code
on conflict (test_id, category_id) do nothing;

insert into public.rubric_versions (test_id, category_id, sex, version, status, effective_from, config, notes)
select t.id, null, null, 1, 'active', '2026-11-01', v.config, v.notes
from (values
  ('A1', $json${"schema_version":1,"calculation_note":"Meilleur temps retenu. Seuils à définir par catégorie dans le module Barèmes.","components":[{"key":"time","label":"Temps de sprint","kind":"measured","max_points":10,"measure_type":"time","unit":"s","direction":"lower_better","attempts":2,"aggregation":"best","min_value":1,"max_value":15,"scoring":{"mode":"none"},"penalty":null}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). Meilleur temps retenu. Seuils à définir par catégorie dans le module Barèmes.'),
  ('A2', $json${"schema_version":1,"components":[{"key":"time","label":"Temps du parcours","kind":"measured","max_points":6,"measure_type":"time","unit":"s","direction":"lower_better","attempts":2,"aggregation":"best","min_value":2,"max_value":60,"scoring":{"mode":"none"},"penalty":null},{"key":"direction_quality","label":"Qualité des changements de direction","kind":"qualitative","max_points":4,"levels":[{"value":0,"label":"Insuffisant","description":"Perd l'équilibre ou s'arrête à chaque changement de direction."},{"value":1,"label":"Fragile","description":"Changements lents, appuis instables, trajectoires larges."},{"value":2,"label":"En acquisition","description":"Changements corrects mais irréguliers ; relance parfois lente."},{"value":3,"label":"Acquis","description":"Appuis stables, centre de gravité abaissé, relance efficace."},{"value":4,"label":"Maîtrisé","description":"Changements rapides, fluides et contrôlés sur tout le parcours."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('A3', $json${"schema_version":1,"components":[{"key":"time","label":"Vitesse d'exécution (temps)","kind":"measured","max_points":4,"measure_type":"time","unit":"s","direction":"lower_better","attempts":2,"aggregation":"best","min_value":1,"max_value":60,"scoring":{"mode":"none"},"penalty":null},{"key":"precision","label":"Précision, fluidité et coordination","kind":"qualitative","max_points":4,"levels":[{"value":0,"label":"Insuffisant","description":"Ne parvient pas à suivre la séquence d'appuis."},{"value":1,"label":"Fragile","description":"Nombreux barreaux touchés, rythme haché."},{"value":2,"label":"En acquisition","description":"Séquence respectée avec quelques erreurs d'appui."},{"value":3,"label":"Acquis","description":"Appuis précis, rythme régulier, bonne coordination bras-jambes."},{"value":4,"label":"Maîtrisé","description":"Exécution précise, fluide et rythmée du début à la fin."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('A4', $json${"schema_version":1,"calculation_note":"Précision : conversion proportionnelle (essais réussis / 4 × 3 pts), arrondie au demi-point.","components":[{"key":"reaction","label":"Réaction au signal","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Réaction très tardive ou absente."},{"value":1,"label":"En acquisition","description":"Réaction lente ou hésitante sur la plupart des essais."},{"value":2,"label":"Acquis","description":"Réaction rapide sur la majorité des essais."},{"value":3,"label":"Maîtrisé","description":"Réaction immédiate et constante sur tous les essais."}]},{"key":"precision","label":"Précision du déplacement (essais réussis)","kind":"measured","max_points":3,"measure_type":"successes","unit":"réussites","direction":"higher_better","attempts":1,"aggregation":"best","min_value":0,"max_value":4,"out_of":4,"scoring":{"mode":"linear","best":4,"worst":0,"round_to":0.5},"penalty":null}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). Précision : conversion proportionnelle (essais réussis / 4 × 3 pts), arrondie au demi-point.'),
  ('A5', $json${"schema_version":1,"components":[{"key":"distance","label":"Distance du saut","kind":"measured","max_points":4,"measure_type":"distance","unit":"m","direction":"higher_better","attempts":2,"aggregation":"best","min_value":0.2,"max_value":3.5,"scoring":{"mode":"none"},"penalty":null},{"key":"technique","label":"Technique et réception","kind":"qualitative","max_points":2,"levels":[{"value":0,"label":"Insuffisant","description":"Impulsion désordonnée, réception déséquilibrée (chute, mains au sol)."},{"value":1,"label":"En acquisition","description":"Impulsion correcte mais réception instable."},{"value":2,"label":"Acquis","description":"Impulsion coordonnée bras-jambes et réception stable, genoux fléchis."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('T1', $json${"schema_version":1,"calculation_note":"Précision : conversion proportionnelle (passes réussies / 10 × 5 pts), arrondie au demi-point.","components":[{"key":"precision","label":"Précision (passes réussies)","kind":"measured","max_points":5,"measure_type":"successes","unit":"réussites","direction":"higher_better","attempts":1,"aggregation":"best","min_value":0,"max_value":10,"out_of":10,"scoring":{"mode":"linear","best":10,"worst":0,"round_to":0.5},"penalty":null},{"key":"quality","label":"Qualité technique et transmission","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Surface de contact inadaptée, ballon non maîtrisé."},{"value":1,"label":"En acquisition","description":"Gestuelle correcte avec un seul pied ; dosage irrégulier."},{"value":2,"label":"Acquis","description":"Bonne surface de contact, passes bien dosées, pied faible utilisé."},{"value":3,"label":"Maîtrisé","description":"Passes tendues, précises et bien dosées des deux pieds."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). Précision : conversion proportionnelle (passes réussies / 10 × 5 pts), arrondie au demi-point.'),
  ('T2', $json${"schema_version":1,"components":[{"key":"control_quality","label":"Qualité du contrôle","kind":"qualitative","max_points":4,"levels":[{"value":0,"label":"Insuffisant","description":"Le ballon échappe au joueur sur la plupart des répétitions."},{"value":1,"label":"Fragile","description":"Contrôle souvent trop long ou non amorti."},{"value":2,"label":"En acquisition","description":"Contrôle correct sur environ la moitié des répétitions."},{"value":3,"label":"Acquis","description":"Contrôle propre et amorti sur la majorité des répétitions."},{"value":4,"label":"Maîtrisé","description":"Contrôle propre, amorti et sûr sur toutes les répétitions."}]},{"key":"orientation","label":"Orientation et vitesse de la première touche","kind":"qualitative","max_points":2,"levels":[{"value":0,"label":"Insuffisant","description":"Contrôle statique, sans orientation."},{"value":1,"label":"En acquisition","description":"Orientation présente mais lente ou imprécise."},{"value":2,"label":"Acquis","description":"Première touche orientée, rapide et enchaînée."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('T3', $json${"schema_version":1,"components":[{"key":"time","label":"Temps du slalom","kind":"measured","max_points":4,"measure_type":"time","unit":"s","direction":"lower_better","attempts":2,"aggregation":"best","min_value":2,"max_value":90,"scoring":{"mode":"none"},"penalty":null},{"key":"mastery","label":"Maîtrise, précision, équilibre et utilisation des pieds","kind":"qualitative","max_points":4,"levels":[{"value":0,"label":"Insuffisant","description":"Perd le ballon à plusieurs reprises."},{"value":1,"label":"Fragile","description":"Ballon souvent éloigné, cônes touchés, un seul pied."},{"value":2,"label":"En acquisition","description":"Conduite correcte, quelques pertes de contrôle."},{"value":3,"label":"Acquis","description":"Ballon proche, bon équilibre, utilisation des deux pieds."},{"value":4,"label":"Maîtrisé","description":"Conduite rapide, précise et équilibrée avec les deux pieds."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('T4', $json${"schema_version":1,"calculation_note":"Précision : conversion proportionnelle (tirs réussis / 8 × 5 pts), arrondie au demi-point.","components":[{"key":"precision","label":"Précision (tirs réussis)","kind":"measured","max_points":5,"measure_type":"successes","unit":"réussites","direction":"higher_better","attempts":1,"aggregation":"best","min_value":0,"max_value":8,"out_of":8,"scoring":{"mode":"linear","best":8,"worst":0,"round_to":0.5},"penalty":null},{"key":"strike_quality","label":"Qualité de frappe et exécution","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Frappe désordonnée, pied d'appui mal placé."},{"value":1,"label":"En acquisition","description":"Frappe correcte mais manque de contrôle ou de puissance."},{"value":2,"label":"Acquis","description":"Bonne frappe, équilibrée, surface de contact adaptée."},{"value":3,"label":"Maîtrisé","description":"Frappe maîtrisée, puissante et précise, exécution rapide."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). Précision : conversion proportionnelle (tirs réussis / 8 × 5 pts), arrondie au demi-point.'),
  ('P1', $json${"schema_version":1,"components":[{"key":"volume","label":"Volume de déplacement (navettes)","kind":"measured","max_points":6,"measure_type":"repetitions","unit":"navettes","direction":"higher_better","attempts":1,"aggregation":"best","min_value":0,"max_value":300,"scoring":{"mode":"none"},"penalty":null},{"key":"rhythm","label":"Maintien du rythme","kind":"qualitative","max_points":2,"levels":[{"value":0,"label":"Insuffisant","description":"Rythme très irrégulier, arrêts fréquents."},{"value":1,"label":"En acquisition","description":"Baisse de rythme nette en fin d'effort."},{"value":2,"label":"Acquis","description":"Rythme régulier maintenu jusqu'à la fin."}]},{"key":"movement_quality","label":"Qualité de déplacement","kind":"qualitative","max_points":2,"levels":[{"value":0,"label":"Insuffisant","description":"Foulée désorganisée, demi-tours non maîtrisés."},{"value":1,"label":"En acquisition","description":"Foulée correcte, demi-tours perfectibles."},{"value":2,"label":"Acquis","description":"Foulée économique et demi-tours efficaces."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('I1', $json${"schema_version":1,"components":[{"key":"information","label":"Prise d'information","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Joue tête baissée, ne regarde pas autour de lui."},{"value":1,"label":"En acquisition","description":"Lève parfois la tête, surtout sans ballon."},{"value":2,"label":"Acquis","description":"Observe régulièrement avant de recevoir le ballon."},{"value":3,"label":"Maîtrisé","description":"Prend l'information en permanence, avant et pendant l'action."}]},{"key":"decision","label":"Prise de décision","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Choix souvent inadaptés (perte de balle systématique)."},{"value":1,"label":"En acquisition","description":"Choix simples, parfois inadaptés à la situation."},{"value":2,"label":"Acquis","description":"Choix majoritairement pertinents (passer, conduire, tirer)."},{"value":3,"label":"Maîtrisé","description":"Choix rapides et pertinents, y compris sous pression."}]},{"key":"positioning","label":"Placement et déplacement","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Reste statique ou suit le ballon en grappe."},{"value":1,"label":"En acquisition","description":"Se déplace mais occupe mal l'espace."},{"value":2,"label":"Acquis","description":"Se démarque et occupe l'espace de façon cohérente."},{"value":3,"label":"Maîtrisé","description":"Placement intelligent, crée et exploite les espaces."}]},{"key":"understanding","label":"Compréhension offensive et défensive","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Ne distingue pas les phases d'attaque et de défense."},{"value":1,"label":"En acquisition","description":"Participe surtout à une seule phase de jeu."},{"value":2,"label":"Acquis","description":"Participe aux deux phases et réagit à la perte du ballon."},{"value":3,"label":"Maîtrisé","description":"Comprend les transitions et adapte son rôle en permanence."}]},{"key":"anticipation","label":"Anticipation","kind":"qualitative","max_points":3,"levels":[{"value":0,"label":"Insuffisant","description":"Réagit toujours après l'action."},{"value":1,"label":"En acquisition","description":"Anticipe rarement les trajectoires ou intentions."},{"value":2,"label":"Acquis","description":"Anticipe régulièrement passes et déplacements."},{"value":3,"label":"Maîtrisé","description":"Lit le jeu en avance, intercepte et se projette."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). '),
  ('E1', $json${"schema_version":1,"components":[{"key":"support","label":"Encourage et aide ses partenaires","kind":"qualitative","max_points":1,"levels":[{"value":0,"label":"Non observé","description":"Comportement non observé."},{"value":0.5,"label":"Parfois","description":"Aide ou encourage ponctuellement."},{"value":1,"label":"Régulièrement","description":"Aide et encourage ses partenaires de façon régulière."}]},{"key":"respect","label":"Respecte les consignes et les personnes","kind":"qualitative","max_points":1,"levels":[{"value":0,"label":"Non observé","description":"Consignes ou personnes non respectées."},{"value":0.5,"label":"Parfois","description":"Respect partiel, rappels nécessaires."},{"value":1,"label":"Régulièrement","description":"Respecte constamment consignes, encadreurs et partenaires."}]},{"key":"resilience","label":"Accepte les erreurs et garde une attitude positive","kind":"qualitative","max_points":1,"levels":[{"value":0,"label":"Non observé","description":"Se décourage ou s'énerve face à l'erreur."},{"value":0.5,"label":"Parfois","description":"Attitude variable selon les situations."},{"value":1,"label":"Régulièrement","description":"Reste positif face à ses erreurs et à celles des autres."}]},{"key":"cooperation","label":"Coopère et partage le ballon","kind":"qualitative","max_points":1,"levels":[{"value":0,"label":"Non observé","description":"Garde le ballon, joue seul."},{"value":0.5,"label":"Parfois","description":"Partage le ballon de façon irrégulière."},{"value":1,"label":"Régulièrement","description":"Coopère et partage le ballon naturellement."}]},{"key":"fair_play","label":"Discipline et fair-play","kind":"qualitative","max_points":1,"levels":[{"value":0,"label":"Non observé","description":"Gestes ou comportements antisportifs observés."},{"value":0.5,"label":"Parfois","description":"Quelques écarts de discipline."},{"value":1,"label":"Régulièrement","description":"Discipliné et fair-play en toutes circonstances."}]}]}$json$::jsonb, 'Barème initial v1 (toutes catégories). ')
) as v(test_code, config, notes)
join public.assessment_tests t on t.code = v.test_code
on conflict on constraint rubric_versions_unique_version do nothing;

-- Session réelle du 28 novembre 2026 (créée en brouillon).
with s as (
  insert into public.assessment_sessions (name, description, session_date, start_time, location, season_id, status)
  select 'Test d''aptitude FUTURISTE ACADÉMIE FC – Saison 2026–2027', 'Test d''aptitude de début de saison pour les catégories U6–U9, U10–U13 et U14–U16.', '2026-11-28',
         '09:30', 'École Publique de Japoma, Douala, Cameroun',
         (select id from public.seasons where label = '2026–2027'), 'draft'
  where not exists (select 1 from public.assessment_sessions where name = 'Test d''aptitude FUTURISTE ACADÉMIE FC – Saison 2026–2027')
  returning id
), cats as (
  insert into public.session_categories (session_id, category_id)
  select s.id, c.id from s cross join public.assessment_categories c
  returning session_id
)
insert into public.session_tests (session_id, test_id, sort_order)
select s.id, t.id, t.sort_order from s cross join public.assessment_tests t;
