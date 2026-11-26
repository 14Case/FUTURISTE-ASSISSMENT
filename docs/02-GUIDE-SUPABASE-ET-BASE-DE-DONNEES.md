# Guide Supabase & Architecture Base de Données PostgreSQL

## 1. Ordre d'exécution des migrations SQL

Dans votre projet Supabase (**SQL Editor → New Query**), exécutez dans cet ordre exact :

1. `supabase/migrations/20261125000001_schema.sql` — Tables, clés étrangères, contraintes, index, séquences.
2. `supabase/migrations/20261125000002_security.sql` — Fonctions d'autorisation, politiques Row Level Security (RLS), journal d'audit automatique, verrouillage des sessions finalisées, RPC transactionnels.
3. `supabase/migrations/20261125000003_storage.sql` — Buckets `reports` (privé), `player-photos` (privé) et `branding` (public lecture) + politiques d'accès Storage.
4. `supabase/migrations/20261125000004_reference_data.sql` — Domaines, catégories initiales (`U6–U9`, `U10–U13`, `U14–U16`), saison `2026–2027`, 12 tests initiaux (`A1` à `E1`), protocoles par âge, barèmes v1 et la session officielle du **28 novembre 2026 à l'École Publique de Japoma (9h30)**.

## 2. Configuration Supabase Auth

Dans **Authentication → Providers → Email** :
- Activez **Email provider**.
- Désactivez l'auto-inscription publique si vous souhaitez que seuls les administrateurs créent les comptes via `/encadreurs` (de toute façon, un compte non affecté à une session n'a accès à aucune donnée grâce à la RLS).

## 3. Schéma relationnel normalisé

- `profiles` : extension `1-1` de `auth.users` (`role`: `'admin' | 'coach'`, `is_active`).
- `club_settings` : ligne unique (`id = 1`) des paramètres institutionnels, messages parents et synchronisation.
- `seasons` : saisons sportives (`2026–2027`, etc.).
- `assessment_categories` : tranches d'âge configurables (`min_age`, `max_age`).
- `assessment_domains` : les 5 domaines de référence (`athletic /40`, `technical /30`, `physical /10`, `game_intelligence /15`, `team_spirit /5`).
- `players` : identité sportive, numéro unique auto-séquencé `FA-0001`, consentement parental, `external_ref` (pour couplage futur avec FUTURISTE FC MANAGEMENT) et drapeau `is_demo`.
- `guardians` & `player_guardians` : relation `n-n` entre joueurs et responsables légaux (un parent peut suivre une fratrie ; un joueur peut avoir deux parents enregistrés).
- `assessment_tests` & `test_age_rules` : définition des ateliers et protocoles spécifiques par catégorie.
- `rubric_versions` : barèmes versionnés JSONB. Un trigger PostgreSQL empêche toute altération d'un barème déjà publié afin de garantir l'exactitude historique des anciennes évaluations.
- `assessment_sessions`, `session_categories`, `session_tests` : sessions d'évaluation.
- `session_players` : inscription d'un joueur à une session avec **instantané de sa catégorie à la date du test** (`category_id`).
- `session_assignments` : affectations des encadreurs (tous ateliers/catégories ou restreints).
- `test_evaluations` & `test_attempts` : évaluations par `(session_id, player_id, test_id)` avec numéro de `version` optimiste et tentatives détaillées.
- `assessment_scores` : scores consolidés, profils descriptifs et synthèse validée.
- `assessment_reports` : historique versionné des PDF stockés dans le bucket privé `reports` (statut automatiquement basculé à `outdated` par trigger SQL si une note est corrigée).
- `audit_logs` : journal immuable alimenté par trigger SQL.
- `sync_operations` : registre d'idempotence des identifiants `op_id` envoyés depuis le mode hors ligne.
