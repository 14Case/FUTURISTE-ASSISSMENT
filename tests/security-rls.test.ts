import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const SUPABASE_AUTH_STUB_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema if not exists auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );

  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;

  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
`;

describe("Sécurité PostgreSQL — Migrations SQL, Row Level Security (RLS), Verrouillage & Audit", () => {
  it("applique réellement les politiques RLS entre Admin, Encadreur affecté et Encadreur non affecté, l'idempotence et le verrouillage après finalisation", async () => {
    const db = new PGlite();

    const m1 = readFileSync(
      join(process.cwd(), "supabase/migrations/20261125000001_schema.sql"),
      "utf8",
    );
    const m2 = readFileSync(
      join(process.cwd(), "supabase/migrations/20261125000002_security.sql"),
      "utf8",
    );
    const m4 = readFileSync(
      join(process.cwd(), "supabase/migrations/20261125000004_reference_data.sql"),
      "utf8",
    );

    await db.exec(SUPABASE_AUTH_STUB_SQL);
    await db.exec(m1);
    await db.exec(m2);
    await db.exec(m4);

    // Vérifie que la session initiale du 28 novembre 2026 et les 12 tests ont été créés
    const initSessionRes = await db.query<{ id: string; session_date: string }>(
      `select id, session_date::text from public.assessment_sessions limit 1`,
    );
    expect(initSessionRes.rows).toHaveLength(1);
    expect(initSessionRes.rows[0].session_date).toBe("2026-11-28");
    const sessionId = initSessionRes.rows[0].id;

    // Création de 3 utilisateurs : 1 Admin, 1 Coach affecté (U10-U13 + atelier T1 uniquement), 1 Coach non affecté
    const adminId = "00000000-0000-4000-8000-000000000001";
    const coachAssignedId = "00000000-0000-4000-8000-000000000002";
    const coachOtherId = "00000000-0000-4000-8000-000000000003";

    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data) values
        ('${adminId}', 'admin@fafc.cm', '{"full_name":"Admin FAFC"}'),
        ('${coachAssignedId}', 'coach1@fafc.cm', '{"full_name":"Coach U10"}'),
        ('${coachOtherId}', 'coach2@fafc.cm', '{"full_name":"Coach Externe"}');
      update public.profiles set role = 'admin' where id = '${adminId}';
    `);

    const catsRes = await db.query<{ id: string; code: string }>(
      `select id, code from public.assessment_categories`,
    );
    const catU10 = catsRes.rows.find((c) => c.code === "U10-U13")!.id;
    const catU14 = catsRes.rows.find((c) => c.code === "U14-U16")!.id;

    const testsRes = await db.query<{ id: string; code: string }>(
      `select id, code from public.assessment_tests`,
    );
    const testT1 = testsRes.rows.find((t) => t.code === "T1")!.id;
    const testT2 = testsRes.rows.find((t) => t.code === "T2")!.id;

    // En tant qu'Admin : créer 2 joueurs (1 U10, 1 U14), 1 responsable légal, les inscrire et affecter Coach 1 sur (T1, U10)
    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${adminId}', true);

      insert into public.players (id, last_name, first_name, birth_date, category_id, consent_obtained)
      values
        ('10000000-0000-4000-8000-000000000001', 'ETOO', 'Junior', '2015-05-10', '${catU10}', true),
        ('10000000-0000-4000-8000-000000000002', 'MBOMA', 'Patrick', '2011-05-10', '${catU14}', true);

      insert into public.guardians (id, last_name, phone)
      values ('20000000-0000-4000-8000-000000000001', 'ETOO_PARENT', '+237699000000');

      insert into public.player_guardians (player_id, guardian_id, is_primary)
      values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', true);

      insert into public.session_players (session_id, player_id, category_id)
      values
        ('${sessionId}', '10000000-0000-4000-8000-000000000001', '${catU10}'),
        ('${sessionId}', '10000000-0000-4000-8000-000000000002', '${catU14}');

      insert into public.session_assignments (session_id, user_id, test_id, category_id)
      values ('${sessionId}', '${coachAssignedId}', '${testT1}', '${catU10}');
      commit;
    `);

    const playerU10 = "10000000-0000-4000-8000-000000000001";
    const playerU14 = "10000000-0000-4000-8000-000000000002";

    // TEST 1 : Le rôle anon n'a accès à RIEN
    await expect(
      db.exec(`begin; set local role anon; select * from public.players; commit;`),
    ).rejects.toThrow();
    await db.exec("rollback;");

    // TEST 2 : Coach non affecté ne voit AUCUNE session ni AUCUN joueur
    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${coachOtherId}', true);
    `);
    const otherSessions = await db.query(`select id from public.assessment_sessions`);
    const otherPlayers = await db.query(`select id from public.players`);
    await db.exec("commit;");
    expect(otherSessions.rows).toHaveLength(0);
    expect(otherPlayers.rows).toHaveLength(0);

    // TEST 3 : Coach affecté sur U10 ne voit QUE le joueur U10 (pas le U14 !), NE VOIT PAS les responsables légaux, NE VOIT PAS les rapports, et ne peut pas s'auto-promouvoir admin
    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${coachAssignedId}', true);
    `);
    const coachPlayers = await db.query<{ id: string }>(`select id from public.players`);
    const coachGuardians = await db.query(`select id from public.guardians`);
    const coachAudit = await db.query(`select id from public.audit_logs`);
    expect(coachPlayers.rows.map((r) => r.id)).toEqual([playerU10]);
    expect(coachGuardians.rows).toHaveLength(0);
    expect(coachAudit.rows).toHaveLength(0);

    await expect(
      db.query(`update public.profiles set role = 'admin' where id = '${coachAssignedId}'`),
    ).rejects.toThrow();
    await db.exec("rollback;");

    // TEST 4 : Tant que la session est en 'draft', l'encadreur NE PEUT PAS saisir de résultat
    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${coachAssignedId}', true);
    `);
    await expect(
      db.query(`
        select public.apply_evaluation_op(
          '30000000-0000-4000-8000-000000000001'::uuid,
          '${sessionId}'::uuid, '${playerU10}'::uuid, '${testT1}'::uuid,
          0, '{}', 'completed', null, 6.5, 'complete', '[]'::jsonb, 'Essai', '[]'::jsonb, null
        )
      `),
    ).rejects.toThrow();
    await db.exec("rollback;");

    // L'admin passe la session 'in_progress'
    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${adminId}', true);
      select public.set_session_status('${sessionId}'::uuid, 'in_progress', null);
      commit;
    `);

    // TEST 5 : L'encadreur peut saisir T1 pour le joueur U10, mais PAS T2 (atelier non affecté) ni le joueur U14
    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${coachAssignedId}', true);
    `);
    const opRes1 = await db.query<{ apply_evaluation_op: { status: string; server_version: number } }>(`
      select public.apply_evaluation_op(
        '30000000-0000-4000-8000-000000000002'::uuid,
        '${sessionId}'::uuid, '${playerU10}'::uuid, '${testT1}'::uuid,
        0, '{}', 'completed', null, 6.5, 'complete', '[]'::jsonb, 'Très bonnes passes',
        '[{"component_key":"precision","attempt_number":1,"value":8,"penalties":0,"is_valid":true}]'::jsonb, null
      )
    `);
    expect(opRes1.rows[0].apply_evaluation_op.status).toBe("applied");
    expect(opRes1.rows[0].apply_evaluation_op.server_version).toBe(1);

    // Rejeu idempotent du même op_id -> replayed: true, aucun doublon
    const opReplay = await db.query<{ apply_evaluation_op: { replayed?: boolean; server_version: number } }>(`
      select public.apply_evaluation_op(
        '30000000-0000-4000-8000-000000000002'::uuid,
        '${sessionId}'::uuid, '${playerU10}'::uuid, '${testT1}'::uuid,
        0, '{}', 'completed', null, 6.5, 'complete', '[]'::jsonb, 'Très bonnes passes',
        '[{"component_key":"precision","attempt_number":1,"value":8,"penalties":0,"is_valid":true}]'::jsonb, null
      )
    `);
    expect(opReplay.rows[0].apply_evaluation_op.replayed).toBe(true);
    await db.exec("commit;");

    // Tentative sur T2 non affecté ou sur le joueur U14 -> rejeté !
    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${coachAssignedId}', true);
    `);
    await expect(
      db.query(`
        select public.apply_evaluation_op(
          '30000000-0000-4000-8000-000000000003'::uuid,
          '${sessionId}'::uuid, '${playerU10}'::uuid, '${testT2}'::uuid,
          0, '{}', 'completed', null, 5, 'complete', '[]'::jsonb, null, '[]'::jsonb, null
        )
      `),
    ).rejects.toThrow();
    await db.exec("rollback;");

    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${coachAssignedId}', true);
    `);
    await expect(
      db.query(`
        select public.apply_evaluation_op(
          '30000000-0000-4000-8000-000000000004'::uuid,
          '${sessionId}'::uuid, '${playerU14}'::uuid, '${testT1}'::uuid,
          0, '{}', 'completed', null, 5, 'complete', '[]'::jsonb, null, '[]'::jsonb, null
        )
      `),
    ).rejects.toThrow();
    await db.exec("rollback;");

    // TEST 6 : Finalisation de la session + création d'un rapport + blocage sans motif + invalidation automatique du rapport après correction motivée
    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${adminId}', true);
      insert into public.assessment_reports (id, session_id, player_id, storage_path, file_name, version, status)
      values ('40000000-0000-4000-8000-000000000001', '${sessionId}', '${playerU10}', 's/p/v1.pdf', 'FAFC_Rapport_ETOO_Junior_2026.pdf', 1, 'generated');
      select public.set_session_status('${sessionId}'::uuid, 'finalized', 'Clôture officielle');
      commit;
    `);

    // Même l'admin ne peut pas modifier une évaluation d'une session finalisée SANS motif d'audit
    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${adminId}', true);
    `);
    await expect(
      db.query(`update public.test_evaluations set points = 7 where session_id = '${sessionId}' and player_id = '${playerU10}'`),
    ).rejects.toThrow(/motif/i);
    await db.exec("rollback;");

    // Avec un motif d'audit explicite : l'admin peut corriger, le motif est enregistré dans audit_logs et le rapport passe en 'outdated'
    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${adminId}', true);
      select set_config('app.audit_reason', 'Correction erreur de lecture chronomètre', true);
      update public.test_evaluations set points = 7.5 where session_id = '${sessionId}' and player_id = '${playerU10}';
      commit;
    `);

    await db.exec(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${adminId}', true);
    `);
    const repCheck = await db.query<{ status: string }>(
      `select status from public.assessment_reports where id = '40000000-0000-4000-8000-000000000001'`,
    );
    expect(repCheck.rows[0].status).toBe("outdated");

    const auditReasonCheck = await db.query<{ reason: string }>(
      `select reason from public.audit_logs where reason = 'Correction erreur de lecture chronomètre'`,
    );
    expect(auditReasonCheck.rows.length).toBeGreaterThanOrEqual(1);
    await db.exec("commit;");
  });
});
