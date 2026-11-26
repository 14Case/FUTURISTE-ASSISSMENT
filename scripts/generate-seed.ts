/**
 * Génère supabase/migrations/20261125000004_reference_data.sql à partir du
 * catalogue TypeScript (source unique de vérité).
 *
 * Usage : npm run db:generate-seed
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_DOMAINS,
  DEFAULT_PARENT_MESSAGE,
  DEFAULT_TESTS,
  INITIAL_SESSION,
} from "../src/lib/scoring/default-catalog";
import { validateRubricConfig } from "../src/lib/scoring/engine";

const q = (s: string | null | undefined) => (s == null ? "null" : `'${s.replace(/'/g, "''")}'`);
const j = (o: unknown) => `$json$${JSON.stringify(o)}$json$::jsonb`;

// Contrôle de cohérence avant génération.
for (const t of DEFAULT_TESTS) {
  const issues = validateRubricConfig(t.rubric, t.max_points).filter((i) => i.code === "invalid_config");
  if (issues.length) {
    throw new Error(`Barème ${t.code} invalide : ${issues.map((i) => i.message).join(" ; ")}`);
  }
}
for (const d of DEFAULT_DOMAINS) {
  const sum = DEFAULT_TESTS.filter((t) => t.domain === d.code).reduce((s, t) => s + t.max_points, 0);
  if (sum !== d.max_points) throw new Error(`Domaine ${d.code} : ${sum} ≠ ${d.max_points}`);
}

const lines: string[] = [];
lines.push(`-- =============================================================================
-- FUTURISTE ASSESSMENT — Données de référence (GÉNÉRÉ — ne pas éditer à la main)
-- Source : src/lib/scoring/default-catalog.ts — commande : npm run db:generate-seed
-- =============================================================================
-- Contient uniquement de la configuration réelle fournie par le club :
-- domaines, catégories, saison, tests, protocoles, barèmes initiaux (v1) et la
-- session du 28/11/2026. AUCUN joueur, AUCUN score.
-- Les mesures chronométrées / distances / volumes n'ont PAS de seuils :
-- ils doivent être configurés par l'administrateur (module Barèmes).
-- =============================================================================
`);

lines.push(`insert into public.assessment_domains (code, label, max_points, sort_order, description) values`);
lines.push(
  DEFAULT_DOMAINS.map(
    (d) => `  (${q(d.code)}, ${q(d.label)}, ${d.max_points}, ${d.sort_order}, ${q(d.description)})`,
  ).join(",\n") + "\non conflict (code) do nothing;\n",
);

lines.push(`insert into public.assessment_categories (code, label, min_age, max_age, sort_order) values`);
lines.push(
  DEFAULT_CATEGORIES.map((c) => `  (${q(c.code)}, ${q(c.label)}, ${c.min_age}, ${c.max_age}, ${c.sort_order})`).join(",\n") +
    "\non conflict (code) do nothing;\n",
);

lines.push(`insert into public.seasons (label, start_date, end_date)
values (${q(INITIAL_SESSION.season)}, '2026-09-01', '2027-08-31')
on conflict (label) do nothing;
`);

lines.push(`insert into public.club_settings (id, parent_message_template, current_season_id)
values (1, ${q(DEFAULT_PARENT_MESSAGE)}, (select id from public.seasons where label = ${q(INITIAL_SESSION.season)}))
on conflict (id) do nothing;
`);

lines.push(`insert into public.assessment_tests (code, name, domain, max_points, description, instructions, sort_order) values`);
lines.push(
  DEFAULT_TESTS.map(
    (t) =>
      `  (${q(t.code)}, ${q(t.name)}, ${q(t.domain)}, ${t.max_points}, ${q(t.description)}, ${q(t.instructions)}, ${t.sort_order})`,
  ).join(",\n") + "\non conflict (code) do nothing;\n",
);

lines.push(`insert into public.test_age_rules (test_id, category_id, protocol, protocol_text)
select t.id, c.id, v.protocol, v.protocol_text
from (values`);
const ruleRows: string[] = [];
for (const t of DEFAULT_TESTS) {
  for (const [cat, p] of Object.entries(t.protocols)) {
    ruleRows.push(`  (${q(t.code)}, ${q(cat)}, ${j(p.protocol)}, ${q(p.text)})`);
  }
}
lines.push(ruleRows.join(",\n"));
lines.push(`) as v(test_code, category_code, protocol, protocol_text)
join public.assessment_tests t on t.code = v.test_code
join public.assessment_categories c on c.code = v.category_code
on conflict (test_id, category_id) do nothing;
`);

lines.push(`insert into public.rubric_versions (test_id, category_id, sex, version, status, effective_from, config, notes)
select t.id, null, null, 1, 'active', '2026-11-01', v.config, v.notes
from (values`);
lines.push(
  DEFAULT_TESTS.map(
    (t) =>
      `  (${q(t.code)}, ${j(t.rubric)}, ${q("Barème initial v1 (toutes catégories). " + (t.rubric.calculation_note ?? ""))})`,
  ).join(",\n"),
);
lines.push(`) as v(test_code, config, notes)
join public.assessment_tests t on t.code = v.test_code
on conflict on constraint rubric_versions_unique_version do nothing;
`);

lines.push(`-- Session réelle du 28 novembre 2026 (créée en brouillon).
with s as (
  insert into public.assessment_sessions (name, description, session_date, start_time, location, season_id, status)
  select ${q(INITIAL_SESSION.name)}, ${q(INITIAL_SESSION.description)}, ${q(INITIAL_SESSION.session_date)},
         ${q(INITIAL_SESSION.start_time)}, ${q(INITIAL_SESSION.location)},
         (select id from public.seasons where label = ${q(INITIAL_SESSION.season)}), 'draft'
  where not exists (select 1 from public.assessment_sessions where name = ${q(INITIAL_SESSION.name)})
  returning id
), cats as (
  insert into public.session_categories (session_id, category_id)
  select s.id, c.id from s cross join public.assessment_categories c
  returning session_id
)
insert into public.session_tests (session_id, test_id, sort_order)
select s.id, t.id, t.sort_order from s cross join public.assessment_tests t;
`);

const out = join(__dirname, "..", "supabase", "migrations", "20261125000004_reference_data.sql");
writeFileSync(out, lines.join("\n"));
console.log(`Seed généré : ${out}`);
