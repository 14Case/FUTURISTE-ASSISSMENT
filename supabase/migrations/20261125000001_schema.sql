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
